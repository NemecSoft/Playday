// 差分打包：能用上次那份 Electron 运行时，就绝不重打整包；能只动一个文件，就绝不动第二个。
//
// 需求（2026-09-17 用户原话）："实现差分编译、差分复制，能不动的就不动。
//   因为要同步到客户机，如果主程序也动不动就变化了，我们的那一套权威数据库机制也就形同虚设了。"
//
// 关键前提：客户机是靠**差分复制（大小/日期）**同步的（FastCopy / robocopy 都是这个判据）。
//   所以**文件的 mtime 就是"要不要重搬"的信号** —— 一个字节没变的文件，连 mtime 都不能动。
//
// 两件事一起保证：
//   ① `asar: false`（见 electron-builder.yml）：程序不打成 118MB 的 app.asar，
//      而是在 resources/app/ 下放普通文件 —— 改一行代码只有那一个文件变。
//      （asar 是单文件：里面改一个字节，整个 118MB 的大小/日期都变，每台客户机都得重搬。）
//   ② 增量路径**不跑 electron-builder**：只把 dist/ + dist-electron/ 同步进
//      `.pack-tmp/win-unpacked/resources/app/`，且 syncDir 会把 mtime **对齐源文件**。
//      于是没变的文件在目的地保持老日期 → robocopy 跳过 → 客户机的差分复制也跳过。
//
// 走整包的条件：骨架变了（Electron 版本 / electron-builder.yml / package.json / 随包素材的源）、
//   上次的产物不是普通文件布局（残留的 app.asar 会让 Electron 优先加载它 —— 必须清掉重打）。
//
// 产物仍落在 `.pack-tmp/win-unpacked`，`deploy.mjs` 照旧从那儿复制 —— 对下游完全透明。
//
// 用法：
//   node scripts/pack.mjs            # 自动判断增量 / 整包
//   node scripts/pack.mjs --full     # 强制整包
//   node scripts/pack.mjs --clean    # 连中转目录一起删掉再整包（怀疑布局坏了用这个）
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const STAGING = path.join(ROOT, ".pack-tmp", "win-unpacked");
const APP_DIR = path.join(STAGING, "resources", "app");
const STALE_ASAR = path.join(STAGING, "resources", "app.asar");
// 骨架指纹放在 `.pack-tmp` 里（与它描述的产物同生共死）：删了中转目录就等于"没有基准"，
// 下次自动走整包 —— 这个因果关系正是我们要的。
const FP_FILE = path.join(ROOT, ".pack-tmp", "shell-fingerprint.txt");

const FORCE_FULL = process.argv.includes("--full");
const CLEAN = process.argv.includes("--clean");

// 日志落盘（与 deploy.mjs / promote.mjs 同一约定）：见 scripts/build.mjs 的同名注释。
const LOG_FILE = path.join(ROOT, "logs", "pack-last.log");
const logLines = [];
process.on("exit", () => {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.writeFileSync(LOG_FILE, `打包日志 ${new Date().toLocaleString()}\n${logLines.join("\n")}\n`, "utf-8");
  } catch {
    /* ignore */
  }
});
const say = (s = "") => {
  logLines.push(s);
  process.stdout.write(`${s}\n`);
};

// 「骨架」= 不进 resources/app 的那些东西：Electron 版本、打包配置、随包素材的源。
// 它们一变就必须整包重打（运行时要换 / extraResources 要重铺）。
//
// ⚠️ 字体目录的名字**不许在这里写死**：它是 `dev-` 素材目录，只应该出现在 path-modes.json 里
//   （架构守卫规则 12 —— 脚本里再写一遍就会漂移：打包按写死的名字找、部署按表搬）。
//   所以从规则表取，用的还是 deploy.mjs 那份解析器。
const FIXED_SHELL_INPUTS = [
  "electron-builder.yml",
  "package.json",
  "package-lock.json",
  "dev-tools/YunGameStart/assets",
  "public/icons",
  "vendor",
];

function shellInputs() {
  const file = path.join(ROOT, "dist-electron", "shared", "pathModes.js");
  if (!fs.existsSync(file)) {
    console.error("❌ 找不到 dist-electron/shared/pathModes.js —— 先跑 node scripts/build.mjs（deploy.bat 会自动跑）。");
    process.exit(1);
  }
  const pm = require(file);
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "path-modes.json"), "utf-8"));
  const plan = pm.copyPlan(pm.readModeTable(rules), "release");
  const fontsSrc = plan.find((i) => i.field === "fontsDir")?.src;
  return fontsSrc ? [...FIXED_SHELL_INPUTS, fontsSrc] : FIXED_SHELL_INPUTS;
}

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

const ELECTRON_BUILDER = binEntry("electron-builder", "electron-builder");

/**
 * 两个文件"算不算同一个"：大小 + **秒级** mtime。
 *
 * 为什么是秒而不是毫秒：utimesSync 把 mtime 对齐到 NTFS 的 100ns 单位时会有亚毫秒取整，
 * 毫秒级比较会出现"刚对齐过、却差 1ms → 判成变了"的抖动 —— 实测 338 个文件里稳定漏掉 44 个，
 * 于是每次打包都白拷一遍。秒级是 make / robocopy 那套经典粒度，稳定且够用。
 */
const sameFile = (a, b) => a.size === b.size && Math.floor(a.mtimeMs / 1000) === Math.floor(b.mtimeMs / 1000);

function walkRel(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkRel(p, base, out);
    else out.push(path.relative(base, p));
  }
  return out;
}

/** 骨架指纹：Electron 版本 + 上面那些输入（路径/大小/mtime）。 */
function shellFingerprint() {
  const parts = [];
  const ev = path.join(ROOT, "node_modules", "electron", "package.json");
  parts.push(`electron|${fs.existsSync(ev) ? JSON.parse(fs.readFileSync(ev, "utf-8")).version : "?"}`);
  for (const rel of shellInputs()) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) {
      parts.push(`${rel}|MISSING`);
      continue;
    }
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      const sub = [];
      for (const f of walkRel(p)) {
        const s = fs.statSync(path.join(p, f));
        sub.push(`${f}|${s.size}|${Math.floor(s.mtimeMs)}`);
      }
      sub.sort();
      parts.push(`${rel}|${sub.join(";")}`);
    } else {
      parts.push(`${rel}|${st.size}|${Math.floor(st.mtimeMs)}`);
    }
  }
  parts.sort();
  return crypto.createHash("sha256").update(parts.join("\n")).digest("hex");
}

/**
 * 把 src 镜像进 dst（只用于我们自己生成的产物目录，所以可以放心删多余的）。
 *
 * ⚠️ 复制后必须 utimesSync 把 mtime 对齐源文件 —— 这是**整套差分的地基**：
 *    不对齐的话，目的地每个文件都是"刚写的"，下一环 robocopy（按 大小+时间）会认为全变了，
 *    把整份重拷一遍，客户机的差分复制也跟着全搬 —— 差分就白做了。
 */
function syncDir(src, dst) {
  if (!fs.existsSync(src)) {
    console.error(`❌ 找不到 ${src} —— 先跑 node scripts/build.mjs。`);
    process.exit(1);
  }
  fs.mkdirSync(dst, { recursive: true });
  let copied = 0;
  let removed = 0;
  const seen = new Set();
  for (const rel of walkRel(src)) {
    seen.add(rel);
    const s = path.join(src, rel);
    const d = path.join(dst, rel);
    const ss = fs.statSync(s);
    let same = false;
    try {
      same = sameFile(fs.statSync(d), ss);
    } catch {
      /* 目标不存在 */
    }
    if (same) continue;
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.copyFileSync(s, d);
    fs.utimesSync(d, ss.atime, ss.mtime);
    copied++;
  }
  for (const rel of walkRel(dst)) {
    if (!seen.has(rel)) {
      fs.rmSync(path.join(dst, rel), { force: true });
      removed++;
    }
  }
  return { copied, removed };
}

function step(label, args) {
  const t = Date.now();
  const r = spawnSync(process.execPath, args, { stdio: "inherit", cwd: ROOT });
  const s = ((Date.now() - t) / 1000).toFixed(1);
  if (r.status !== 0) {
    console.error(`\n❌ ${label} 失败（${s}s）—— 打包中止。`);
    process.exit(r.status || 1);
  }
  say(`   ✅ [${s}s] ${label}`);
}

const t0 = Date.now();
say("== Playday 打包（差分）==");

if (CLEAN && fs.existsSync(STAGING)) {
  say("   （--clean：删掉整份中转目录，下面的整包会重建它）");
  fs.rmSync(path.join(ROOT, ".pack-tmp"), { recursive: true, force: true });
}

const fp = shellFingerprint();
const prevFp = fs.existsSync(FP_FILE) ? fs.readFileSync(FP_FILE, "utf-8").trim() : "";
// 上次是不是"普通文件"布局？残留的 app.asar 会让 Electron **优先加载它**（旧代码），必须清掉重打。
const layoutOk = fs.existsSync(path.join(APP_DIR, "package.json")) && !fs.existsSync(STALE_ASAR);

const reason = FORCE_FULL
  ? "--full"
  : !fs.existsSync(path.join(STAGING, "resources"))
    ? "还没有打过包（.pack-tmp 不存在）"
    : !layoutOk
      ? "上次不是普通文件布局（resources/app.asar 残留会让 Electron 加载旧代码）"
      : prevFp !== fp
        ? "骨架有变化（Electron 版本 / 打包配置 / 随包素材 / 依赖清单）"
        : "";

if (reason) {
  say(`   → 走【整包】：${reason}`);
  // 整包前把上一份产物整个删掉：electron-builder 会重建，而残留文件
  //（尤其旧的 app.asar）会让 Electron 加载到**旧代码**，是那种"改了没生效"的典型事故。
  if (fs.existsSync(STAGING)) fs.rmSync(STAGING, { recursive: true, force: true });
  step("electron-builder --dir", [ELECTRON_BUILDER, "--dir", "--config", "electron-builder.yml"]);
  fs.writeFileSync(FP_FILE, `${fp}\n`, "utf-8");
  say(`   （resources/app：${walkRel(APP_DIR).length} 个文件 / ${sizeMB(APP_DIR)}MB ｜ 整份暂存区 ${sizeMB(STAGING)}MB）`);
} else {
  say("   → 走【差分】：复用上次的 Electron 运行时与依赖，只同步变了的程序文件");
  const a = syncDir(path.join(ROOT, "dist"), path.join(APP_DIR, "dist"));
  const b = syncDir(path.join(ROOT, "dist-electron"), path.join(APP_DIR, "dist-electron"));
  const pjSrc = path.join(ROOT, "package.json");
  const pjDst = path.join(APP_DIR, "package.json");
  const ps = fs.statSync(pjSrc);
  let pjSame = false;
  try {
    pjSame = sameFile(fs.statSync(pjDst), ps);
  } catch {
    /* ignore */
  }
  if (!pjSame) {
    fs.copyFileSync(pjSrc, pjDst);
    fs.utimesSync(pjDst, ps.atime, ps.mtime);
  }
  const changed = a.copied + a.removed + b.copied + b.removed + (pjSame ? 0 : 1);
  say(
    `   dist：更新 ${a.copied} / 删 ${a.removed} ｜ dist-electron：更新 ${b.copied} / 删 ${b.removed} ｜ package.json：${pjSame ? "无变化" : "已更新"}`,
  );
  if (changed === 0) {
    say("   ⏭️  一个文件都不用动（客户机那边也不会搬任何东西）");
  } else {
    say(`   ✅ 只有这 ${changed} 个文件变了 —— 差分复制只会搬这些`);
  }
}

function sizeMB(p) {
  let bytes = 0;
  const add = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const q = path.join(d, e.name);
      if (e.isDirectory()) add(q);
      else bytes += fs.statSync(q).size;
    }
  };
  try {
    if (fs.statSync(p).isDirectory()) add(p);
    else bytes = fs.statSync(p).size;
  } catch {
    /* ignore */
  }
  return (bytes / 1048576).toFixed(1);
}

say(`\n✅ 打包完成：${((Date.now() - t0) / 1000).toFixed(1)}s`);
say("   下一步：node scripts/deploy.mjs --staging .pack-tmp/win-unpacked（deploy.bat 会自动跑）");
