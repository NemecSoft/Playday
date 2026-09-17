// 按 path-modes.json 的规则，为某个模式生成/校验 config.json。
//
// 三种模式（规则表里一一列出各目录）：
//   dev        —— 开发态：直接用仓库里的数据（封面/音乐/详情在 D 盘，库在仓库 dev-data）
//   prerelease —— 预发布：全 D 盘（测试环境），库直连开发机的 dev-data
//   release    —— 正式：全 X 盘（正式环境），库随包（exe 同级的 data）
//
// 用法（--out 省略时按模式取默认目录：dev → 工程根 / prerelease → release_test / release → release）：
//   node scripts/prepare-release.mjs --mode dev --check        # 校验 config.json 与规则一致（npm run check 会跑）
//   node scripts/prepare-release.mjs --mode prerelease --dry-run
//   node scripts/prepare-release.mjs --mode release                       # 写 release\config.json + 复制数据
//   node scripts/prepare-release.mjs --mode release --out release --no-data
//
// 逻辑（解析/套用/校验）在 shared/pathModes.ts（纯函数 + 单测），本脚本只做 IO。
// 之所以读 dist-electron 里的编译产物：逻辑要单测、要类型检查，只能待在 shared/*.ts，
// 而本脚本是纯 node（无 loader）。先 npm run build 即可（build-release.bat 已串好顺序）。
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RULES_FILE = path.join(ROOT, "path-modes.json");
const DEV_CONFIG = path.join(ROOT, "config.json");
const COMPILED_CANDIDATES = [path.join(ROOT, "dist-electron", "shared", "pathModes.js")];

/** release 模式随包带走的开发态数据（故意只带必要项）。 */
const RELEASE_DATA_ITEMS = [
  // 权威库：数据唯一来源，客户端启动时复制成运行时副本。
  // **不带 .bak-*** —— 那些是开发机的备份历史，塞进正式包只会让人以为"线上有备份"。
  "Admin/library.db",
  // 公告目录（announcement.html）。
  "announcements",
];
// 故意不复制 library/library.db：它由客户端首次启动时从权威库复制而来（复制关系固定），
// 带一份进去等于塞了一份"迟早会过期的副本"。

function argValue(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}
const has = (flag) => process.argv.includes(flag);

if (has("--variant")) {
  console.error("[prepare-release] 参数已改名：--variant → --mode（三种模式：dev / prerelease / release）");
  process.exit(1);
}

const mode = argValue("--mode");
if (!["dev", "release"].includes(mode || "")) {
  console.error("用法: node scripts/prepare-release.mjs --mode dev|release [--out <目录>] [--dry-run|--check] [--no-data]");
  process.exit(1);
}
const dryRun = has("--dry-run");
const check = has("--check");
// 默认输出目录按模式分开：预发布写 release_test，正式写 release —— 两个包只差 config.json
// 里的盘符（D 盘 / X 盘），默认值就分开，漏了 --out 也不会把测试配置写进正式包所在目录。
// dev 模式的默认输出还是仓库里的 config.json（即工程根）。
const DEFAULT_OUT = { dev: ".", prerelease: "release_test", release: "release" };
const outDir = path.resolve(ROOT, argValue("--out", DEFAULT_OUT[mode]));
const withData = mode === "release" && !has("--no-data");

// ---- 1. 载入纯逻辑（编译产物）----
const SRC_FILE = path.join(ROOT, "shared", "pathModes.ts");
const compiledPath = COMPILED_CANDIDATES.find((p) => fs.existsSync(p));
if (!compiledPath) {
  console.error("[prepare-release] 找不到编译产物 dist-electron/shared/pathModes.js");
  console.error("                  先跑 npm run build（或直接双击 build-release.bat / build-prerelease.bat，它们已串好顺序）");
  process.exit(1);
}
// 编译产物比源码旧 → 说明改了规则逻辑但没重新编译。这种"其实跑的是旧代码"最误导人
// （改动明明写了、结论却是旧的），所以直接拒绝运行，而不是拿旧逻辑给你一个错答案。
if (fs.existsSync(SRC_FILE) && fs.statSync(SRC_FILE).mtimeMs > fs.statSync(compiledPath).mtimeMs) {
  console.error("[prepare-release] 编译产物比源码旧（shared/pathModes.ts 改过但没重新编译）");
  console.error("                  先跑 npm run build，再重试（两个出包 bat 都会自动做这一步）");
  process.exit(1);
}

let readModeTable;
let resolveModeSettings;
let PathModeError = Error;
{
  const mod = await import(pathToFileURL(compiledPath).href);
  readModeTable = mod.readModeTable;
  resolveModeSettings = mod.resolveModeSettings;
  PathModeError = mod.PathModeError ?? Error;
}

// ---- 2. 读规则表 + 开发态配置 ----
let rules;
try {
  rules = readModeTable(JSON.parse(fs.readFileSync(RULES_FILE, "utf-8")));
} catch (e) {
  console.error(`[prepare-release] ${RULES_FILE} 有问题：\n  ${e.message}`);
  process.exit(1);
}
if (!fs.existsSync(DEV_CONFIG)) {
  console.error(`[prepare-release] 找不到开发态配置：${DEV_CONFIG}`);
  process.exit(1);
}
const devSettings = JSON.parse(fs.readFileSync(DEV_CONFIG, "utf-8")).settings ?? {};

let result;
try {
  result = resolveModeSettings(devSettings, rules, mode);
} catch (e) {
  if (e instanceof PathModeError) {
    console.error(`[prepare-release] 模式规则校验失败：\n  ${e.message}`);
    process.exit(1);
  }
  throw e;
}
const { settings, changes } = result;

// ---- 3. 打印"这个模式各目录在哪" ----
const DRIVE_LABEL = { dev: "D 盘（测试环境）+ 仓库内数据", prerelease: "D 盘（测试环境）", release: "X 盘（正式环境）" };
console.log("==============================================");
console.log(` Playday 路径模式   mode = ${mode}    ${DRIVE_LABEL[mode]}`);
console.log("==============================================");
for (const key of ["coverImagesDir", "gameDetailsDir", "musicDir", "fontsDir", "libraryDir", "defaultGameRootPath", "runtimeDir", "yungamestartDir", "YunGameConfigDir", "gameSaveHelperDir"]) {
  console.log(`  ${key.padEnd(20)} ${settings[key]}`);
}

// dev / prerelease 是 D 盘（本机就是测试环境），顺手校验目录真实存在；
// release 的 X 盘在开发机上不存在，只提示"到正式机上确认"。
// 注意 runtimeDir / yungamestartDir **故意不在这个存在性清单里**：它们"暂时不存在"是合法状态 ——
// 运行库目录没放文件时客户端会退回包内的 resources\runtime（见 electron/core/runtimeSetup.ts），
// 自启工具目录也要先编译 dev-tools\yungamestart 才有内容。把它们算成缺失只会天天报警。
if (mode !== "release") {
  const missing = [];
  for (const key of ["coverImagesDir", "gameDetailsDir", "libraryDir", "runtimeDir", "yungamestartDir", "YunGameConfigDir", "gameSaveHelperDir"]) {
    const v = String(settings[key]);
    const abs = /^[a-zA-Z]:[\\/]/.test(v) || v.startsWith("//") ? v : path.join(ROOT, v);
    if (!fs.existsSync(abs)) missing.push(`${key} = ${v}`);
  }
  if (missing.length) {
    console.warn(`  [警告] 这些目录不存在（配了但不在 = 静默失效）：\n    ${missing.join("\n    ")}`);
  } else {
    console.log("  ✓ 上面前 5 项目录都存在");
  }
} else {
  console.log("  （X 盘目录请在正式机上确认存在：封面/详情/音乐/YunGameConfig）");
}

// ---- 4. --check：只校验，不改文件 ----
if (check) {
  if (changes.length === 0) {
    console.log(`\n✓ ${mode} 模式：config.json 与路径模式表一致`);
    process.exit(0);
  }
  console.error(`\n✗ ${mode} 模式：config.json 与 path-modes.json 不一致（${changes.length} 处）：`);
  for (const c of changes) {
    console.error(`    ${c.field.replace(/^settings\./, "")}: ${c.from || "(空)"} → ${c.to}`);
  }
  console.error(
    "  修法：node scripts/prepare-release.mjs --mode " + mode + (mode === "dev" ? "（或双击 sync-config.bat）" : ""),
  );
  process.exit(1);
}

// ---- 5. 打印改动清单 ----
if (changes.length === 0) {
  console.log("\n  没有字段需要改动（配置已经与规则一致）");
} else {
  console.log(`\n  改动 ${changes.length} 个字段：`);
  for (const c of changes) {
    console.log(`    ${c.field.replace(/^settings\./, "")}: ${c.from || "(空)"} → ${c.to}`);
  }
}

if (dryRun) {
  console.log("\n[--dry-run] 未写入任何文件。");
  process.exit(0);
}

// ---- 6. 写 config.json（CRLF，与仓库其它文本文件一致）----
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "config.json");
const json = JSON.stringify({ settings }, null, 2).split("\n").join("\r\n") + "\r\n";
fs.writeFileSync(outFile, json, "utf-8");
console.log(`\n  已写入: ${outFile}`);

// ---- 7. release 模式：把数据放到 exe 同级的 data\ ----
if (withData) {
  // 数据来源 = dev 模式规则里的库根（别在脚本里写死 dev-data）。
  const devData = path.resolve(ROOT, rules.dev.libraryDir);
  if (!fs.existsSync(devData)) {
    console.error(`  [错误] 开发态数据根不存在：${devData}（无法随包带数据）`);
    process.exit(1);
  }
  const target = path.join(outDir, "data");
  fs.mkdirSync(target, { recursive: true });
  let copied = 0;
  for (const item of RELEASE_DATA_ITEMS) {
    const src = path.join(devData, item);
    if (!fs.existsSync(src)) {
      console.warn(`  [警告] 开发态数据里没有 ${item}，跳过`);
      continue;
    }
    fs.cpSync(src, path.join(target, item), { recursive: true });
    copied += 1;
  }
  console.log(`  已复制 ${copied} 项数据到: ${target}（源自 ${devData}）`);
  console.log("   （权威库 + 公告；运行时副本由客户端首次启动时自动生成）");
} else if (mode === "release") {
  console.log("  数据未复制（--no-data）：正式包启动后会去 exe 同级的 data\\ 找库，记得自己放。");
} else if (mode === "prerelease") {
  console.log(`  数据不随包：prerelease 直连开发机的 ${rules.prerelease.libraryDir}`);
}

console.log("\n  发布前自检：node scripts/prepare-release.mjs --mode " + mode + " --dry-run");
console.log("==============================================");
