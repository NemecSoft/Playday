// 一键部署：把「程序产物 + 规则表里声明要搬的素材」铺到**目的地**，并生成 config.json。
//
// 用法（`deploy.bat` 会调它，平时不用手敲）：
//   node scripts/deploy.mjs                     # 按 release 表部署到目的地（D:/YunGame/PlayNite）
//   node scripts/deploy.mjs --dry-run           # 只打印计划，一个字节都不写
//   node scripts/deploy.mjs --no-program        # 只搬素材、不覆盖程序（调资源用）
//   node scripts/deploy.mjs --force             # 目的地没有部署标记也照样写（第一次接管时用）
//
// 依赖：`dist-electron/shared/pathModes.js`（`npm run build` 的产物）—— 规则表**只有一个实现**
//（shared/pathModes.ts），脚本不自己解析表，避免"部署按一套、客户端按另一套"。
//
// ⚠️ 目的地是**和原版 Playnite 共用的目录**（2026-09-17 定）：我们的 exe 顶掉 PlayniteUI.exe，
// 原版那一堆 dll / locales / Resources 原地不动。所以这里**绝不镜像（不用 /MIR）**：
// 镜像会把"我们没写过、原版有"的文件当多余删掉，一跑就把原版客户端打坏。
// 覆盖策略换成一条更窄的规则 —— **只删自己写过的**：
//   · 程序：清单里记下本次写过哪些（相对目的地根），下次只删"上次写了、这次产物里没有"的；
//   · 素材：清单里记下每个文件的 (目的地, 源)，下次源不在仓库里了 → 删掉目的地那份。
// 除此之外一个字节都不动（YunGameConfig / CoverImages / Addons / 音乐 / 原版客户端文件）。
//
// 另：`.playday-deploy.json` 是"这个目录归部署管"的标记，也是上面两份记录的家。

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const RULE_FILE = path.join(ROOT, "path-modes.json");
const CONFIG_FILE = path.join(ROOT, "config.json");
const MANIFEST = ".playday-deploy.json";
const STAGING = path.join(ROOT, ".pack-tmp", "win-unpacked");

/** 库里那两类**绝不进包**的东西：备份历史 + 运行时副本（客户端自己会从权威库重建）。 */
const LIBRARY_EXCLUDE_FILES = ["*.bak-*"];
const LIBRARY_EXCLUDE_DIRS = ["library"];

/**
 * 打印一行，同时存进内存；退出时整份写到 logs\deploy-last.log。
 * 为什么还要落盘：控制台可能被 IDE 收走、或者一路刷上去看不全 —— 出过问题之后要能回看整个过程。
 * 日志写不进去也不影响部署本身（所以这里所有 IO 都吞异常）。
 */
const logLines = [];
const LOG_FILE = path.join(ROOT, "logs", "deploy-last.log");
let logWritten = false;
process.on("exit", () => {
  if (logWritten) return;
  logWritten = true;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.writeFileSync(LOG_FILE, `部署日志 ${new Date().toLocaleString()}\n${logLines.join("\n")}\n`, "utf-8");
  } catch {
    /* ignore */
  }
});

function say(s = "") {
  logLines.push(s);
  console.log(s);
}

/** 一眼看得出"正常 / 要注意 / 出错了"—— 结尾还会汇总一次，翻日志只看结论就行。 */
const OK = "✅";
const WARN = "⚠️";
const BAD = "❌";

/** 本次部署值得看一眼的提醒（不致命）。结尾统一列出来。 */
const warnings = [];
function warn(msg) {
  warnings.push(msg);
}

function fail(lines) {
  const all = ["", `${BAD} 部署中止了：${lines[0]}`, ...lines.slice(1)];
  console.error(all.join("\n"));
  console.error("");
  console.error("（上面这段就是原因和怎么办；改完直接重跑 deploy.bat 即可）");
  console.error("");
  logLines.push(...all, "", "（上面这段就是原因和怎么办；改完直接重跑 deploy.bat 即可）");
  process.exit(1);
}

/** 编译产物里的纯逻辑层（表解析 / 搬运清单 / 配置生成都在那儿）。 */
function loadPathModes() {
  const rel = "dist-electron/shared/pathModes.js";
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) fail([`找不到 ${rel} —— 先跑一次 npm run build（deploy.bat 会自动跑）。`]);
  return require(file);
}

/**
 * robocopy 的位置参数一律经 toCmdPath() 换回 `\`。
 * 为什么：robocopy 把以 `/` 开头的 token 当开关（`//NAS/share` 直接传会被判非法），
 * 而表里的值为了可读性一律写 `/` —— 见 docs/design/launch-paths.md §0 与计划文档的"分隔符"。
 */
function toCmdPath(p) {
  const file = path.join(ROOT, "dist-electron/shared/launchPaths.js");
  if (!fs.existsSync(file)) fail(["找不到 dist-electron/shared/launchPaths.js 的 toCmdPath() —— 先跑 npm run build。"]);
  return require(file).toCmdPath(p);
}

/** 跑 robocopy；0-7 = 成功（1 = 有复制，仍成功），>=8 = 失败。 */
function robocopy(src, dst, { excludeFiles = [], excludeDirs = [], dryRun = false } = {}) {
  const args = [toCmdPath(src), toCmdPath(dst), "/E", "/NJH", "/NJS", "/NDL", "/NP", "/R:1", "/W:1", "/MT:16"];
  if (excludeFiles.length) args.push("/XF", ...excludeFiles);
  if (excludeDirs.length) args.push("/XD", ...excludeDirs);
  if (dryRun) args.push("/L");
  // 输出抓在手里：成功时它只是"每个文件一行"的噪音（真正有用的信息我们自己统计），
  // 失败时才把它打出来当证据 —— 平时翻日志只用看结论卡。
  const r = spawnSync("robocopy", args, { encoding: "utf-8" });
  if (r.error) fail([`复制命令跑不起来：${r.error.message}`]);
  const code = r.status ?? 1;
  if (code >= 8) {
    fail([
      `复制失败（robocopy 返回码 ${code}）`,
      `   从  ${src}`,
      `   到  ${dst}`,
      "",
      "  常见原因（按概率排）：",
      "   1. 目的地里的客户端还开着 → 关掉它再重跑；",
      "   2. 目的地所在盘满了 / 网络盘断了；",
      "   3. 目标目录被别的程序占用（杀毒、资源管理器停在里面）。",
      "",
      "  robocopy 自己的最后几行：",
      ...(r.stdout ? r.stdout.trimEnd().split("\n").slice(-12).map((l) => `   ${l}`) : ["   （没有输出）"]),
    ]);
  }
}

function parseArgs(argv) {
  const has = (n) => argv.includes(n);
  const argOf = (n, dflt) => {
    const i = argv.indexOf(n);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  return {
    mode: argOf("--mode", "release"),
    dryRun: has("--dry-run"),
    force: has("--force"),
    noProgram: has("--no-program"),
    staging: argOf("--staging", STAGING),
  };
}

function relToDest(destRoot, p) {
  const rel = path.relative(destRoot, p);
  return rel && !rel.startsWith("..") ? rel : p;
}

/** 相对目的地根列出目录下所有**文件**（用来记"本次写过什么"）。 */
function listFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 前置检查
// ---------------------------------------------------------------------------

/** 客户端在跑的时候覆盖 exe 会失败（半途中断最难受）—— 先拦住并说清怎么办。 */
function assertClientNotRunning(dryRun = false) {
  const exeName = clientExeName();
  const r = spawnSync("tasklist", ["/FI", `IMAGENAME eq ${exeName}`, "/NH"], { encoding: "utf-8" });
  const running = r.stdout && r.stdout.toLowerCase().includes(exeName.toLowerCase());
  if (!running) return;
  if (dryRun) {
    say(`[deploy] ⚠️ 客户端正在运行（${exeName}）—— 真跑会被拦下，先关掉它。`);
    return;
  }
  fail([
    `客户端正在运行（${exeName}）—— 先关掉再部署。`,
    "为什么必须关：正在跑的 exe/dll 被占用，复制会中途失败，留下的是一半新一半旧的目录。",
  ]);
}

/** exe 名的唯一来源是 build.config.ts（打包成 dist-electron/build.config.js）。 */
function clientExeName() {
  try {
    const cfg = require(path.join(ROOT, "dist-electron", "build.config.js"));
    if (cfg?.CLIENT_EXE_NAME) return `${cfg.CLIENT_EXE_NAME}.exe`;
  } catch {
    /* 拿不到就用兜底名（与 electron-builder.yml 的 win.executableName 一致） */
  }
  return "PlayniteUI.exe";
}

/**
 * 目的地安全锁：**只接管"我们自己建过"或"空目录"**。
 * 理由：这里是真目录，旁边就是原版客户端与运维的数据；一个写错的根路径就够毁掉一台测试机。
 * （2026-09-17 这道锁真的拦下了一次：表里目的地曾被指到另一个 Playnite 目录。）
 */
function assertDestinationSafe(destRoot, { force, dryRun }) {
  if (!fs.existsSync(destRoot)) {
    if (dryRun) return;
    fs.mkdirSync(destRoot, { recursive: true });
    say(`[deploy] 目的地不存在 → 已新建 ${destRoot}`);
    return;
  }
  const entries = fs.readdirSync(destRoot);
  if (entries.includes(MANIFEST) || entries.length === 0) return;
  if (force) {
    say(`[deploy] ⚠️ ${destRoot} 非空且没有部署标记，但指定了 --force，继续（只动清单里记过的项）。`);
    return;
  }
  fail([
    `${destRoot} 非空、却没有部署标记（${MANIFEST}）—— 已中止。`,
    "",
    "  这是什么意思：这个目录不是 Playday 部署出来的（可能是原版客户端或运维放数据的地方）。",
    "  我拒绝往里写，是因为部署会覆盖同名文件，写错根路径等于打坏别人的安装。",
    "",
    "  确认这确实是 Playday 的目的地 → 在这个目录里建一个文件（内容随便，比如 {}）：",
    `      ${path.join(destRoot, MANIFEST)}`,
    "  然后重跑；或临时加 --force。",
  ]);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const pm = loadPathModes();
  const table = pm.readModeTable(JSON.parse(fs.readFileSync(RULE_FILE, "utf-8")));

  if (args.mode === "dev") {
    fail([
      '--mode dev 不允许部署：dev 是"就地跑"（程序跑在仓库里、用的就是仓库里的 dev-* 素材）。',
      "  要部署就用默认的 release 模式（目的地 = 表里 release 段的 defaultGameRootPath）。",
    ]);
  }
  if (!table[args.mode]) fail([`规则表里没有模式 "${args.mode}"。`]);

  const rules = table[args.mode];
  const destRaw = pm.runtimeValue(rules.defaultGameRootPath);
  const destRoot = path.resolve(path.isAbsolute(destRaw) ? destRaw : path.join(ROOT, destRaw));
  const drive = path.parse(destRoot).root;
  if (!fs.existsSync(drive)) {
    fail([`目的地所在的盘不存在：${drive}（${destRoot}）`, "  （表里 release 段的 defaultGameRootPath 写的就是它）"]);
  }

  const manifestFile = path.join(destRoot, MANIFEST);
  const prev = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf-8")) : null;

  // ---- 本次要铺的东西 ----
  const programEntries = [];
  if (!args.noProgram) {
    if (!fs.existsSync(args.staging)) {
      fail([
        `找不到程序产物：${args.staging}`,
        "  deploy.bat 会先跑 npm run build + electron-builder 生成它；手敲就先把这两步跑了。",
      ]);
    }
    programEntries.push(...fs.readdirSync(args.staging));
  }

  const items = pm.copyPlan(table, args.mode).map((it) => {
    const src = path.isAbsolute(it.src) ? it.src : path.join(ROOT, it.src);
    const dst = path.isAbsolute(it.dst) ? it.dst : path.join(destRoot, it.dst);
    if (!fs.existsSync(src)) {
      fail([`规则表声明的源不存在：${it.field}`, `   源：${src}`]);
    }
    const srcIsDir = fs.statSync(src).isDirectory();
    // 目标写成文件（有扩展名）→ 内容并入它所在目录（targetIsFile 的判据在 shared/pathModes.ts）
    const target = srcIsDir && pm.targetIsFile(it.dst) ? path.dirname(dst) : dst;
    const isLib = it.field === "libraryDir";
    return { field: it.field, src, dst, srcIsDir, target, isLib };
  });

  // ---- 本次要清理的（只限于"以前我们写过"的）----
  // 注意 --no-program：那次的语义是"只搬素材、程序原样不动"，所以**不能**把上次记的程序文件当成过期项
  //（否则会把整个程序删掉 —— 那是把一个调试开关变成事故）。
  const nowProgram = new Set(programEntries);
  const staleProgram = args.noProgram ? [] : (prev?.program ?? []).filter((n) => !nowProgram.has(n));
  const staleAssets = (prev?.assets ?? []).filter((a) => !fs.existsSync(a.src));
  const nowTargets = new Set(items.map((i) => i.target));
  const staleTargets = (prev?.targets ?? []).filter((t) => !nowTargets.has(t));

  // ---- 打印计划（人话版：要做什么、动哪些东西、会不会碰你的数据）----
  const bar = "=".repeat(72);
  const copyFields = new Set(items.map((i) => i.field));
  const inPlace = pm.PATH_FIELDS.filter((f) => !copyFields.has(f)).map(
    (f) => `   · ${f} = ${pm.runtimeValue(rules[f])}`,
  );
  say(bar);
  say(` Playday 部署测试版${args.dryRun ? "（空跑：只看不做，不会写任何东西）" : ""}`);
  say(bar);
  say(` 装到哪儿：${destRoot}`);
  say("            （path-modes.json 里 release 段的 defaultGameRootPath —— 程序、素材、config.json 都放这儿）");
  say(` 这次的程序：${args.noProgram ? "跳过（--no-program：只搬素材，不动程序）" : args.staging}`);
  if (prev) {
    say(` 这个目录上次部署过：${prev.time}`);
  } else {
    say(` ${WARN} 这是第一次接管这个目录：会先写一个标记文件 ${MANIFEST}，以后才敢往里覆盖`);
  }
  say("");
  say(` 从仓库搬过去的东西（${items.length} 项）：`);
  for (const i of items) {
    const tag = i.srcIsDir && pm.targetIsFile(i.dst) ? "（目录内容放进目标所在目录）" : "";
    say(`   ${OK} ${i.field.padEnd(17)} ${path.relative(ROOT, i.src)}  →  ${relToDest(destRoot, i.target)}${tag}`);
  }
  for (const i of items) {
    if (!i.isLib) continue;
    say(
      `      ↳ 库里这两类不跟着走：${LIBRARY_EXCLUDE_FILES.join("、")}（备份历史）、${LIBRARY_EXCLUDE_DIRS.join("、")}\\（运行时副本）`,
    );
  }
  say("");
  say(" 不搬的字段（就地用 / 只是位置声明，部署不碰它们）：");
  for (const l of inPlace) say(l);
  say("");
  say(" 会覆盖的配置：config.json（按规则表重新生成 —— 你手工改过的字段会被覆盖）");
  if (staleProgram.length || staleAssets.length || staleTargets.length) {
    say("");
    say(" 会顺手清理的（上次部署写进去、这次不再需要的；没记过的文件一个都不动）：");
    for (const n of staleProgram) say(`   · 旧程序文件 ${n}`);
    for (const a of staleAssets) say(`   · ${relToDest(destRoot, a.dst)}（仓库里已经没有这个源了）`);
    for (const t of staleTargets) say(`   · ${relToDest(destRoot, t)}（规则表里已不再声明它）`);
  } else {
    say(" 会清理的：无");
  }
  say(bar);

  // 这两条在 dry-run 里也跑：它们回答的正是"真跑会不会被拦下" —— 空跑时最想知道的就是这个。
  assertClientNotRunning(args.dryRun);
  assertDestinationSafe(destRoot, { force: args.force, dryRun: args.dryRun });

  if (args.dryRun) {
    say("[deploy] dry-run：什么都没写。");
    return;
  }

  // ---- 1) 清理 ----
  for (const n of staleProgram) fs.rmSync(path.join(destRoot, n), { recursive: true, force: true });
  for (const a of staleAssets) fs.rmSync(a.dst, { force: true });
  for (const t of staleTargets) fs.rmSync(t, { recursive: true, force: true });

  // ---- 2) 程序产物 ----
  const programFiles = [];
  if (!args.noProgram) {
    for (const name of programEntries) {
      const src = path.join(args.staging, name);
      const dst = path.join(destRoot, name);
      if (fs.statSync(src).isDirectory()) {
        robocopy(src, dst);
        for (const f of listFiles(src)) programFiles.push(path.join(name, f));
      } else {
        fs.copyFileSync(src, dst);
        programFiles.push(name);
      }
    }
    say(`   ${OK} 程序：${programFiles.length} 个文件（${programEntries.length} 个顶层项）`);
  } else if (prev?.program) {
    programFiles.push(...prev.program); // 没铺程序就别把上次的记录当成"这次写过"
  }

  // ---- 3) 素材（表里声明要搬的）----
  const assets = [];
  for (const i of items) {
    const before = assets.length;
    robocopy(i.src, i.target, {
      excludeFiles: i.isLib ? LIBRARY_EXCLUDE_FILES : [],
      excludeDirs: i.isLib ? LIBRARY_EXCLUDE_DIRS : [],
    });
    if (i.srcIsDir) {
      const skipDirs = i.isLib ? LIBRARY_EXCLUDE_DIRS : [];
      for (const f of listFiles(i.src)) {
        if (skipDirs.includes(f.split(path.sep)[0])) continue;
        if (i.isLib && /\.bak-/.test(path.basename(f))) continue;
        assets.push({ dst: path.join(i.target, f), src: path.join(i.src, f) });
      }
    } else {
      const dst = pm.targetIsFile(i.dst) ? path.join(path.dirname(i.target), path.basename(i.src)) : i.target;
      assets.push({ dst, src: i.src });
    }
    say(`   ${OK} ${i.field.padEnd(17)} → ${relToDest(destRoot, i.target)}（${assets.length - before} 个文件）`);
  }

  // ---- 4) config.json（按表重新生成；绝不做 D:→X: 字符串替换 —— 那是 promote 的事）----
  const repoConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  const { settings, changes } = pm.resolveModeSettings(repoConfig.settings, table, args.mode);
  fs.writeFileSync(path.join(destRoot, "config.json"), JSON.stringify({ settings }, null, 2) + "\n", "utf-8");
  say(`   ${OK} config.json：已按规则表重新生成（其中 ${changes.length} 个路径字段与开发态不同）`);

  // ---- 5) 部署清单 ----
  const manifest = {
    what: "Playday 部署记录。下次部署只清理这里记过的项（程序按顶层项、素材按 目的地+源 配对），其余文件一律不动。",
    mode: args.mode,
    time: new Date().toLocaleString(),
    destRoot,
    program: programFiles,
    assets,
    targets: items.map((i) => i.target),
  };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  if (!prev) warn("第一次接管这个目录：已写入标记文件，以后部署不会再提示");
  if (args.force) warn("本次用了 --force：跳过了目的地的安全锁，确认过那里不是别人放数据的地方");

  const cleared = staleProgram.length + staleAssets.length + staleTargets.length;

  say("");
  say(bar);
  say(` 结果：${OK} 部署成功${warnings.length ? `（另有 ${warnings.length} 条提醒，见下）` : "，没有任何异常"}`);
  say("-".repeat(72));
  say(`  程序    ：${args.noProgram ? "（本次跳过）" : `${programFiles.length} 个文件`}`);
  say(`  素材    ：${assets.length} 个文件（${items.length} 项）`);
  say("  配置    ：config.json 已生成（D 盘那套）");
  say(`  清理    ：${cleared ? `${cleared} 项旧文件` : "无"}`);
  say(`  装到    ：${destRoot}`);
  if (warnings.length) {
    say("");
    for (const w of warnings) say(`  ${WARN} ${w}`);
  }
  say("-".repeat(72));
  say(" 下一步：");
  say(`   1) 双击 ${path.join(destRoot, clientExeName())} 试一下：界面 / 库 / 封面 / 音乐 / 存档备份`);
  say("      （想看它到底在读哪些目录：命令行加 -log 启动，会写 data\\logs\\paths-latest.log）");
  say("   2) 都没问题 → 双击 promote.bat 发到正式机（想先只看不改就加 --dry-run）");
  say(bar);
}

main();
