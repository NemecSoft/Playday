// 增量构建：能跳就跳，不能跳才真干。
//
// 为什么需要它（2026-09-17 用户要求："实现增量编译，也就是轻微的改动就编译好久"）：
// 旧链路是 `npm run build` = tsc 主进程 + tsc 渲染层 + vite build，实测热态：
//     tsc 主进程       1.5s（早就有 incremental）
//     tsc 渲染层       5.7s（**没有** incremental —— 每次冷查全库）
//     vite build      11.5s（真正的代码只有 5MB，却要重拷 46MB 静态素材：
//                            public/fonts 32.8MB + public/live2d 13.4MB）
//     合计             约 19s（还没算 electron-builder 那 16.6s，见 scripts/pack.mjs）
// 本脚本做三件事：
//   1) 渲染层类型检查走增量（见 tsconfig.json 的 incremental / tsBuildInfoFile）；
//   2) 渲染层**输入没变就整段跳过 vite build**（指纹存 dist/.build-fingerprint）；
//   3) 每步打印耗时 —— 慢在哪一眼看得见。
//
// 指纹用「路径 + 大小 + mtime」（make / ninja 那一套判据）。
// 为什么不用内容哈希：public/ 有 46MB 素材，逐字节哈希省不下什么；
// 而 mtime 方案**不会漏改**（git checkout / 编辑 / 生成都会更新 mtime），
// 最坏情况只是"内容没变但 mtime 变了 → 多构建一次"，方向是安全的。
//
// 用法：
//   node scripts/build.mjs                 # 增量（默认；deploy.bat 走这条）
//   node scripts/build.mjs --force         # 强制重跑 vite build（怀疑缓存不对时用）
//   node scripts/build.mjs --no-typecheck  # 只产出、不查类型（本地快速试跑；发布不要用）
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const FORCE = process.argv.includes("--force");
const NO_TYPECHECK = process.argv.includes("--no-typecheck");
const SKIP_MAIN = process.argv.includes("--no-main");

// 渲染层产物的输入：改任何一项，vite build 就必须重跑。
// electron/ 刻意不在列 —— 它由 tsc 编到 dist-electron，与渲染层产物无关
// （这正是"只改主进程"时能省掉 11.5s 的原因）。
//
// ⚠️ 加目录前先看下面 assertInputsCoverExternalImports()：漏登记一个被 src import 的目录，
//    后果是**静默跳过构建、发出旧内容**（改了没生效而且不报错）。locales/ 就是这么漏掉过的。
const RENDERER_INPUTS = [
  "src",
  "shared",
  "locales",
  "public",
  "index.html",
  "vite.config.mts",
  "tailwind.config.js",
  "postcss.config.js",
  "postcss-font-scale.cjs",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
];

const FINGERPRINT_FILE = path.join(ROOT, "dist", ".build-fingerprint");

// 日志落盘（与 deploy.mjs / promote.mjs 同一约定）：控制台输出可能被 IDE 收走，
// 而"这次到底跳过了哪一步、每步多少秒"正是排查构建问题时最想看的。写不进去也不影响构建。
const LOG_FILE = path.join(ROOT, "logs", "build-last.log");
const logLines = [];
process.on("exit", () => {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.writeFileSync(LOG_FILE, `构建日志 ${new Date().toLocaleString()}\n${logLines.join("\n")}\n`, "utf-8");
  } catch {
    /* ignore */
  }
});
const say = (s = "") => {
  logLines.push(s);
  process.stdout.write(`${s}\n`);
};

/** 工具的入口 js（绕开 .cmd：spawnSync 起 .cmd 要 shell，且路径带引号时容易翻车）。 */
function binEntry(pkg, binName) {
  const p = path.join(ROOT, "node_modules", pkg, "package.json");
  if (!fs.existsSync(p)) {
    console.error(`❌ 找不到 ${pkg} —— 先 npm install。`);
    process.exit(1);
  }
  const pj = JSON.parse(fs.readFileSync(p, "utf-8"));
  const rel = typeof pj.bin === "string" ? pj.bin : pj.bin?.[binName];
  if (!rel) {
    console.error(`❌ ${pkg} 的 package.json 里没有 bin.${binName}。`);
    process.exit(1);
  }
  return path.join(ROOT, "node_modules", pkg, rel);
}

const TSC = binEntry("typescript", "tsc");
const VITE = binEntry("vite", "vite");

function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else {
      const st = fs.statSync(p);
      out.push(`${path.relative(base, p)}|${st.size}|${Math.floor(st.mtimeMs)}`);
    }
  }
  return out;
}

function rendererFingerprint() {
  const parts = [];
  for (const rel of RENDERER_INPUTS) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) {
      parts.push(`${rel}|MISSING`);
      continue;
    }
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, ROOT, parts);
    else parts.push(`${rel}|${st.size}|${Math.floor(st.mtimeMs)}`);
  }
  parts.sort();
  return crypto.createHash("sha256").update(parts.join("\n")).digest("hex");
}

function filesUnder(rel) {
  const out = [];
  const base = path.join(ROOT, rel);
  const go = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) go(p);
      else out.push(path.relative(ROOT, p));
    }
  };
  if (fs.existsSync(base)) go(base);
  return out;
}

/**
 * 自检：src/ 里所有"跳到 src 之外的相对 import"，其顶层目录都必须已登记进 RENDERER_INPUTS。
 *
 * 为什么必须有这条：指纹是"输入没变就跳过 vite build"。一旦某个被引用的外部目录漏登记，
 * 改它就会**静默跳过构建、发出旧内容** —— 正是本仓库最怕的那类事故（改了没生效、还不报错）。
 * 这里宁可直接失败。
 * （2026-09-17 就是靠这个发现 locales/ 漏了：src/i18n/config.ts 会 import locales/*.json。）
 */
function assertInputsCoverExternalImports() {
  const rootsLen = (p) => p.replace(/\\/g, "/").split("/").length;
  const inputTops = new Set(RENDERER_INPUTS.map((p) => p.split("/")[0]));
  const missing = new Set();
  for (const rel of [...filesUnder("src"), ...filesUnder("shared")]) {
    if (!/\.(ts|tsx)$/.test(rel)) continue;
    // 测试文件不参与 vite 打包（vitest 单独跑），所以它们引谁都不影响构建产物。
    // 实测：shared/coverMatch.test.ts 会 import ../server/coverMatch.mjs（两侧规则的 parity 用例）。
    if (/\.test\.(ts|tsx)$/.test(rel)) continue;
    // 轻量去注释：只为挡掉注释里的示例 import（宁可少认几个，也不能误报挡住构建）
    const code = fs
      .readFileSync(path.join(ROOT, rel), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const m of code.matchAll(/from\s+["']([^"']+)["']/g)) {
      const spec = m[1];
      if (!spec.startsWith(".")) continue; // 包名：不关构建产物的事
      const abs = path.resolve(path.dirname(path.join(ROOT, rel)), spec);
      const outRel = path.relative(ROOT, abs);
      if (outRel.startsWith("..")) continue; // 跳到仓库外
      const top = outRel.split(path.sep)[0];
      if (inputTops.has(top)) continue;
      if (rootsLen(outRel) < 2) continue; // 仓库根下的单文件（如 index.html）由清单显式管
      missing.add(`${rel} → ${spec}（顶层目录「${top}」没进 RENDERER_INPUTS）`);
    }
  }
  if (missing.size) {
    console.error("❌ 渲染层输入清单不全 —— 这些外部依赖改了不会被察觉：");
    for (const m of missing) console.error(`   · ${m}`);
    console.error("   把它们加进 scripts/build.mjs 的 RENDERER_INPUTS，否则会静默跳过构建、发出旧内容。");
    process.exit(1);
  }
}

function step(label, args) {
  const t = Date.now();
  const r = spawnSync(process.execPath, args, { stdio: "inherit", cwd: ROOT });
  const s = ((Date.now() - t) / 1000).toFixed(1);
  if (r.status !== 0) {
    console.error(`\n❌ ${label} 失败（${s}s）—— 构建中止，什么都没有发布。`);
    process.exit(r.status || 1);
  }
  say(`   ✅ [${s}s] ${label}`);
}

const t0 = Date.now();
say("== Playday 增量构建 ==");
assertInputsCoverExternalImports();

// ---- 1) 主进程：tsc（配置里已有 incremental，热态约 1.5s）----
// 为什么无论跳不跳 vite 都要跑它：deploy.mjs / promote.mjs 都读 dist-electron/shared/pathModes.js，
// 那是规则表的唯一实现 —— 缺了它后续步骤直接失败（见 deploy.mjs 的 loadPathModes）。
if (!SKIP_MAIN) {
  step("主进程编译（tsc -p tsconfig.main.json）", [TSC, "-p", "tsconfig.main.json"]);
}

// ---- 2) 类型检查：渲染层 + shared（增量）----
if (NO_TYPECHECK) {
  say("   ⏭️  跳过类型检查（--no-typecheck）");
} else {
  step("类型检查（tsc -p tsconfig.json --noEmit）", [TSC, "-p", "tsconfig.json", "--noEmit"]);
}

// ---- 3) 渲染层打包：输入没变就跳过 ----
const fp = rendererFingerprint();
const prev = fs.existsSync(FINGERPRINT_FILE) ? fs.readFileSync(FINGERPRINT_FILE, "utf-8").trim() : "";
const distIndex = path.join(ROOT, "dist", "index.html");
const skipped = !FORCE && prev === fp && fs.existsSync(distIndex);

if (skipped) {
  say("   ⏭️  渲染层输入没变化 → 跳过 vite build（省掉重拷 46MB 素材 + 打包）");
} else {
  if (FORCE) say("   （--force：强制重跑 vite build）");
  else if (prev !== fp) say("   （渲染层输入有变化 → 重跑 vite build）");
  step("渲染层打包（vite build）", [VITE, "build"]);
  // 指纹必须**构建成功后**才写：vite 的 emptyOutDir 会清空 dist，
  // 写在前面会被它一起删掉，下次又是冷启动。
  fs.writeFileSync(FINGERPRINT_FILE, `${fp}\n`, "utf-8");
}

const total = ((Date.now() - t0) / 1000).toFixed(1);
say(`\n✅ 构建完成：${total}s${skipped ? "（渲染层整段跳过）" : ""}`);
