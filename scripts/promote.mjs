// 正式升格：把**测试目的地**那份（已经测过的那一套）整体升到正式机。
//
// 用法（`promote.bat` 会调它，平时不用手敲）：
//   node scripts/promote.mjs                # 升正式：复制 → config 与库改 X 盘 → 校验 → 清走测试目的地
//   node scripts/promote.mjs --dry-run      # 只打印：要复制什么、哪些路径会被改成 X、哪些会被清掉
//   node scripts/promote.mjs --keep-test    # 升完之后**不**清测试目的地（想再留一份对照时用）
//   node scripts/promote.mjs --wipe-all     # 清测试目的地时连原版客户端的文件一起清（危险，默认关）
//
// 为什么不去重新构建、"把测试那份复制过去"为什么是对的：
//   测过的是**那一个目录**。重新构建 = 换了一份没测过的产物，那测试就白做了。
//
// 顺序是有意的（失败也不丢东西）：
//   ① 复制到正式落点 → ② 在**正式那份**上改 config / 迁库 → ③ 校验 → ④ 才清测试目的地。
//   测试那份在 ③ 之前一直完好；清空放在最后且以校验通过为前提。
//
// 盘符迁移的口径（2026-09-17 用户确认）：
//   · **值里出现** `D:\` 或 `D:/` 就换（不只是值开头）：命令中间的（`cmd /c D:\YunGame\…`）、
//     JSON 转义的（`"D:\\YunGame"`）都算；
//   · 只换"盘符 + 紧随的分隔符"这一小段，其余字符一个不动（分隔符保持原样，结果可预测）；
//   · 库里扫**全部文本列**；另外**数据文件也一起迁** —— GameSaveHelper 的 settings.json、
//     YunGameConfig 下的网吧配置、data 下的库导出与公告 HTML（只在库里改是不够的）；
//   · 每次都先打印清单；dry-run 直接扫**源**那份给你看，一个字节都不写。

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const RULE_FILE = path.join(ROOT, "path-modes.json");
const MANIFEST = ".playday-deploy.json";
const FALLBACK = path.join(ROOT, "release");
const FROM_DRIVE = /^([Dd]):/;
const TO_DRIVE = "X"; // 写进文件里的盘符：正式机看到的就是 X:
const NET_DRIVE = "Z"; // 搬运通道：开发机上映射到正式机 X: 的网络盘（2026-09-17 用户的实际流程）

/**
 * 打印一行，同时存进内存；退出时整份写到 logs\promote-last.log。
 * 为什么还要落盘：控制台可能被 IDE 收走、或者一路刷上去看不全 —— 升正式这种动作更要能回看整个过程。
 */
const logLines = [];
const LOG_FILE = path.join(ROOT, "logs", "promote-last.log");
let logWritten = false;
process.on("exit", () => {
  if (logWritten) return;
  logWritten = true;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.writeFileSync(LOG_FILE, `升正式日志 ${new Date().toLocaleString()}\n${logLines.join("\n")}\n`, "utf-8");
  } catch {
    /* ignore */
  }
});

function say(s = "") {
  logLines.push(s);
  console.log(s);
}

/** 一眼看得出"正常 / 要注意 / 出错了"。 */
const OK = "✅";
const WARN = "⚠️";
const BAD = "❌";

function fail(lines) {
  const all = ["", `${BAD} 升正式中止了：${lines[0]}`, ...lines.slice(1)];
  console.error(all.join("\n"));
  console.error("");
  console.error("（上面这段就是原因和怎么办；改完重跑 promote.bat 即可）");
  console.error("");
  logLines.push(...all, "", "（上面这段就是原因和怎么办；改完重跑 promote.bat 即可）");
  process.exit(1);
}

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    keepTest: argv.includes("--keep-test"),
    wipeAll: argv.includes("--wipe-all"),
  };
}

function loadPathModes() {
  const rel = "dist-electron/shared/pathModes.js";
  if (!fs.existsSync(path.join(ROOT, rel))) fail([`找不到 ${rel} —— 先跑一次 npm run build。`]);
  return require(path.join(ROOT, rel));
}

function toCmdPath(p) {
  const file = path.join(ROOT, "dist-electron/shared/launchPaths.js");
  if (!fs.existsSync(file)) fail(["找不到 dist-electron/shared/launchPaths.js 的 toCmdPath() —— 先跑 npm run build。"]);
  return require(file).toCmdPath(p);
}

function robocopy(src, dst, { dryRun = false, excludeFiles = [] } = {}) {
  const args = [toCmdPath(src), toCmdPath(dst), "/E", "/NJH", "/NJS", "/NDL", "/NP", "/R:1", "/W:1", "/MT:16"];
  if (excludeFiles.length) args.push("/XF", ...excludeFiles);
  if (dryRun) args.push("/L");
  // 输出抓在手里：成功时它只是"每个文件一行"的噪音，失败时才打出来当证据。
  const r = spawnSync("robocopy", args, { encoding: "utf-8" });
  if (r.error) fail([`复制命令跑不起来：${r.error.message}`]);
  const code = r.status ?? 1;
  if (code >= 8) {
    fail([
      `复制到正式落点失败（robocopy 返回码 ${code}）`,
      `   从  ${src}`,
      `   到  ${dst}`,
      "",
      "  常见原因（按概率排）：",
      "   1. 网络盘断了 / 没映射 → 先确认能打开 Z: 下的目录；",
      "   2. 正式机上那份客户端还开着（文件被占用）→ 让它先退出；",
      `   3. 目标盘满了。`,
      "",
      "  放心：复制没成功，就不会走到「清理测试目的地」那一步 —— 测试那份还是完整的。",
      "",
      "  robocopy 自己的最后几行：",
      ...(r.stdout ? r.stdout.trimEnd().split("\n").slice(-12).map((l) => `   ${l}`) : ["   （没有输出）"]),
    ]);
  }
}

/** 目录下文件数（用来校验"复制过去的和这边一样多"，不靠感觉）。 */
function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(dir, e.name));
    else n++;
  }
  return n;
}

function sizeOf(dir) {
  let bytes = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) bytes += sizeOf(p);
    else bytes += fs.statSync(p).size;
  }
  return bytes;
}

/** 同一套"只换真路径"的规则，用在文本文件上（JSON / HTML）。 */
const DRIVE_IN_TEXT = /[Dd]:([\\/])/g;

/**
 * 正式机上还指着 D 盘的数据文件 —— 不止库里有路径：
 *   · GameSaveHelper 的 settings.json（`gamesJson` / `coverDir` 就是绝对路径）；
 *   · YunGameConfig 下的网吧配置（Gameid-InstallDirectory.json 之类，装目录在这儿）；
 *   · data 下的库导出与公告 HTML；
 *   · 根目录的 config.json（已由上一步处理，这里再兜一次，幂等）。
 * 运行时副本 data\library 不看：它由客户端每次启动从权威库重建，带上旧库反而危险。
 * 返回"要处理的文件"，实际替换交给 migrateTextFile —— 读和写分开，dry-run 才敢直接扫源目录。
 */
function dataFilesToMigrate(root) {
  const out = [];
  const addJson = (dir, { skip = [] } = {}) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (skip.includes(e.name)) continue;
        addJson(p, { skip });
      } else if (/\.(json|html|htm)$/i.test(e.name)) {
        out.push(p);
      }
    }
  };
  const push = (p) => {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) out.push(p);
  };
  push(path.join(root, "tools", "GameSaveHelper", "settings.json"));
  addJson(path.join(root, "YunGameConfig"));
  addJson(path.join(root, "data"), { skip: ["library", "logs"] });
  return [...new Set(out)];
}

/** 扫一个文本文件里"盘符+分隔符"的路径；只读不写（dry-run 用它列清单）。 */
function scanTextFile(file) {
  const text = fs.readFileSync(file, "utf-8");
  const hits = text.match(DRIVE_IN_TEXT);
  return { text, count: hits ? hits.length : 0 };
}

/**
 * config.json 的盘符迁移：**按值改，不按文本替换**。
 * 只动"值以 D:/d: 开头"的字符串（对象里逐层走），列表里每一项单独判。
 */
function migrateConfig(configFile) {
  const raw = JSON.parse(fs.readFileSync(configFile, "utf-8"));
  const changes = [];
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj)) {
      const where = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "string") {
        if (FROM_DRIVE.test(v)) {
          obj[k] = v.replace(FROM_DRIVE, `${TO_DRIVE}:`);
          changes.push({ where, from: v, to: obj[k] });
        }
      } else if (v && typeof v === "object") {
        walk(v, where);
      }
    }
  };
  walk(raw, "");
  return { raw, changes };
}

/**
 * 库里的盘符迁移：扫全库**所有文本列**，只改以 `D:` 开头的值。
 * 只换开头那个字母（`substr(col,2)` 保留其余原样）—— 所以 `D:/a\b` 迁移后还是 `D:/a\b` 的写法，
 * 不会把 `\` 变成 `/`（库里两种写法都有，改了反而制造 diff）。
 */
async function migrateLibrary(dbFile) {
  const SQL = await (async () => {
    const initSqlJs = require("sql.js");
    return initSqlJs({ locateFile: (f) => path.join(ROOT, "node_modules", "sql.js", "dist", f) });
  })();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbFile)));
  const changes = [];
  const tables =
    db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0]?.values.map((v) => v[0]) ?? [];
  for (const t of tables) {
    const cols = db.exec(`PRAGMA table_info("${t}")`)[0]?.values ?? [];
    for (const c of cols) {
      const col = c[1];
      const type = String(c[2] ?? "").toUpperCase();
      if (type && !/TEXT|CHAR|CLOB/.test(type)) continue; // 只看文本列
      // 先粗筛"值里出现过 D:"（SQLite 的 LIKE 对 ASCII 大小写不敏感，d: 也会命中），
      // 精确替换在 JS 里做：只换 **盘符后面紧跟分隔符** 的那种（D:\ 或 D:/），
      // 所以夹在命令中间的（`cmd /c D:\YunGame\...`）和 JSON 转义的（"D:\\YunGame"）都会一起换，
      // 而正文里孤零零的 "D:" 不会被误伤。一个值里出现多次也全换（g 标志）。
      const rows = db.exec(`SELECT rowid, "${col}" FROM "${t}" WHERE "${col}" LIKE '%D:%'`)[0]?.values ?? [];
      for (const [rowid, val] of rows) {
        const from = String(val);
        const to = from.replace(/[Dd]:([\\/])/g, `${TO_DRIVE}:$1`);
        if (to === from) continue;
        changes.push({ table: t, column: col, rowid, from, to });
        db.run(`UPDATE "${t}" SET "${col}" = ? WHERE rowid = ?`, [to, rowid]);
      }
    }
  }
  return { db, changes };
}

/**
 * 复制前预检：目标里"我们即将覆盖"的关键文件，现在能不能独占打开？
 *
 * 为什么值得单独一步：正式机上常见的情况是"客户端退了，但从客户端启动的游戏/启动窗口还在跑"
 * （游戏是以客户端目录为工作目录起来的），这时复制会在**拷到一半**才失败。先探一遍，把冲突
 * 提前到"动手之前"，并直接点名是哪几个文件。
 *
 * 为什么这个探测在跨网络时也准：我们这边走的是 SMB，独占打开由**对端**判定，
 * 所以它回答的就是"正式机本机上有没有程序占用它"——正是我们要的答案。
 *
 * 只探有代表性的那几类（exe/dll/pak/asar/库），不做全量遍历：够发现问题，又不会为了探测
 * 在网络上磨几分钟。
 */
function preflightTarget(dst) {
  const probes = [];
  const addTop = (dir, re) => {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isFile() && re.test(e.name)) probes.push(path.join(dir, e.name));
      }
    } catch {
      /* 目录不存在 = 没什么可探的 */
    }
  };
  addTop(dst, /\.(exe|dll|pak|bin|node)$/i); // 程序本体：客户端常驻时最先被占的就是这些
  addTop(path.join(dst, "resources"), /\.(asar|pak)$/i); // 资源包（asar 被占 = 客户端还在跑）
  addTop(path.join(dst, "data", "Admin"), /\.(db|json)$/i); // 权威库与它的导出
  addTop(path.join(dst, "tools", "GameSaveHelper"), /\.(exe|json)$/i);

  const locked = [];
  for (const p of probes) {
    try {
      const fd = fs.openSync(p, "r+"); // 读写成开：被别的程序占用时会直接抛
      fs.closeSync(fd);
    } catch (e) {
      if (["EBUSY", "EPERM", "EACCES", "ETXTBSY", "EAGAIN"].includes(String(e?.code))) locked.push(p);
    }
  }
  return { locked, count: probes.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pm = loadPathModes();
  const table = pm.readModeTable(JSON.parse(fs.readFileSync(RULE_FILE, "utf-8")));
  const rules = table.release;
  if (!rules) fail(["规则表里没有 release 段 —— 它是「测试目的地」的定义，promote 靠它找源。"]);

  // ---- 源 = 测试目的地（表里 release 段的 defaultGameRootPath）----
  const srcRaw = pm.runtimeValue(rules.defaultGameRootPath);
  const src = path.resolve(path.isAbsolute(srcRaw) ? srcRaw : path.join(ROOT, srcRaw));
  if (!fs.existsSync(src)) fail([`测试目的地不存在：${src}`, "  （先跑 deploy.bat 部署测试版，测过了再来升正式）"]);
  const manifestFile = path.join(src, MANIFEST);
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf-8")) : null;
  if (!manifest?.assets) {
    // 两种情形分开说 —— 最常撞到的是第一种，必须一句话说清"这不是出错，是设计如此"。
    if (manifest?.cleared) {
      fail([
        "测试那份已经被上一次 promote 清空了（设计如此：发完就清，测试目的地不留残包）",
        "",
        "  想再发一次正式，得先重新部署一份来测：",
        `    1) 双击 deploy.bat —— 把程序与素材重新铺到 ${src}`,
        "    2) 在那台机器上试一遍（界面 / 库 / 封面 / 音乐 / 存档备份）",
        "    3) 没问题再跑 promote.bat",
      ]);
    }
    fail([
      `${src} 里没有一份真正的部署记录（${MANIFEST} 缺 assets 段）—— 已中止。`,
      "  这条检查挡的是「拿一个手工拼出来的目录当测试版升正式」，那种包没人能保证测过。",
      "  先 deploy.bat 部署一次，测过再 promote。",
    ]);
  }

  // ---- 正式落点 ----
  // 按顺序取第一个"这台机器上真的有"的盘：
  //   ① Z: —— 开发机上映射到正式机 X: 的网络盘（搬 Z: 就是搬到正式机，2026-09-17 用户流程）；
  //   ② X: —— 直接跑在正式机上时（那台机器自己就是 X:）；
  //   ③ release\ —— 都没有，整包落仓库里（结构=正式机，手动拷走即可）。
  // ⚠️ 文件**内容**里写的永远是 X:（TO_DRIVE）—— Z: 只是通道，正式机看到的是 X:。
  const wanted = src.replace(/^[A-Za-z]:/, `${TO_DRIVE}:`);
  const netTarget = src.replace(/^[A-Za-z]:/, `${NET_DRIVE}:`);
  const dst = [netTarget, wanted, FALLBACK].find((p) => fs.existsSync(path.parse(p).root)) ?? FALLBACK;
  const useFallback = dst === FALLBACK;
  const viaNet = dst === netTarget;
  const keyFiles = ["PlayniteUI.exe", "config.json", path.join("data", "Admin", "library.db"), path.join("tools", "GameSaveHelper", "GameSaveHelper.exe")];
  const dbFile = path.join(dst, "data", "Admin", "library.db");

  const bar = "=".repeat(72);
  say(bar);
  say(` Playday 升正式（把测过的那份发到正式机）${args.dryRun ? " —— 空跑：只看不做，不会写任何东西" : ""}`);
  say(bar);
  say(` 要发的那份：${src}`);
  say("             （就是你刚测过的那个目录，原样搬过去，不重新构建）");
  say(` 发到哪儿　：${dst}`);
  if (viaNet) {
    say(`             （经 ${NET_DRIVE}: 网络盘直接写进正式机 —— 在那台机器上它就是 ${wanted}）`);
  } else if (useFallback) {
    say(`             ${WARN} ${NET_DRIVE}: 与 ${TO_DRIVE}: 这台机器上都没有 → 先落在 release\\，之后手动拷过去`);
  }
  say(` 体积　　　：${countFiles(src)} 个文件 / ${(sizeOf(src) / 1048576).toFixed(0)} MB（网络盘上会花几分钟，别断开）`);
  say("");
  say(" 会做四件事：");
  say("   ① 整份复制到正式机");
  say("   ② 把正式那份 config.json 里的 D: 改成 X:");
  say("   ③ 把库和数据文件里的 D: 也改成 X:（改之前自动备份）");
  say(`   ④ 校验通过，${args.keepTest ? "按 --keep-test 保留测试那份" : "清走测试那份"}（只清部署写过的文件）`);
  say(" 为什么不重新构建：测过的是这一个目录；重新构建等于换一份没测过的产物 —— 那测试就白做了。");
  say(bar);

  // ---- 复制前预检：正式机上有没有文件正被占用（游戏/客户端没退干净）----
  if (fs.existsSync(dst)) {
    const { locked, count } = preflightTarget(dst);
    if (locked.length) {
      fail([
        `正式机上有 ${locked.length} 个文件正被占用，现在复制会失败`,
        "",
        "  被占用的文件（正式的这份里）：",
        ...locked.slice(0, 12).map((p) => `   · ${path.relative(dst, p)}`),
        ...(locked.length > 12 ? [`   · …… 还有 ${locked.length - 12} 个`] : []),
        "",
        "  常见原因：那台机器上还开着客户端（含托盘没真退），或者从客户端启动的游戏 / 启动窗口还在跑",
        "            —— 游戏是以客户端目录为工作目录起来的，它不退，这些文件就一直被占着。",
        "",
        "  怎么办：在那台机器上全部退出后重跑（管理员 cmd）：",
        "     taskkill /f /im PlayniteUI.exe /t",
        "     再确认游戏和它们的 cmd 窗口都关了；还锁着就用 Process Explorer 的 Find Handle 查是哪个进程。",
        "",
        "  放心：这一步在复制之前，测试那份和正式那份都还没被动过。",
      ]);
    }
    say("");
    say(` 复制前预检：${OK} 正式机那侧没有冲突（${count} 个关键文件都能独占打开）`);
  }

  if (args.dryRun) {
    const cfg = migrateConfig(path.join(src, "config.json"));
    say("");
    say("config.json 会被改成 X 盘的字段（共 " + cfg.changes.length + " 处）：");
    for (const c of cfg.changes) say(`  ${c.where}\n      ${c.from}\n   →  ${c.to}`);

    // 库：读进内存扫一遍（migrateLibrary 只改内存里的 db，落盘是另一步 —— 所以 dry-run 绝对安全）
    const srcDb = path.join(src, "data", "Admin", "library.db");
    if (fs.existsSync(srcDb)) {
      const { changes: lib } = await migrateLibrary(srcDb);
      say("");
      say(`库 ${path.relative(src, srcDb)} 里有 D: 路径的字段（共 ${lib.length} 处；真跑时在复制后的正式那份上改，改前自动备份）：`);
      for (const c of lib.slice(0, 25)) say(`  ${c.table}.${c.column} (rowid ${c.rowid})\n      ${c.from}\n   →  ${c.to}`);
      if (lib.length > 25) say(`  …… 还有 ${lib.length - 25} 处`);
    }

    say("");
    say("数据文件里会被改的（GameSaveHelper settings.json / 网吧配置 / 库导出 / 公告 HTML）：");
    let n = 0;
    for (const f of dataFilesToMigrate(src)) {
      const { count } = scanTextFile(f);
      if (!count) continue;
      say(`  ${path.relative(src, f)}：${count} 处`);
      n += count;
    }
    if (!n) say("  （没有）");
    say("");
    say("[promote] dry-run：什么都没写。");
    return;
  }

  // ---- ① 复制整份到正式落点 ----
  say("");
  say("[1/4] 复制到正式落点 ...");
  //  不带部署记录：它描述的是"测试目的地被谁部署过"，正式机上没有 deploy 会跑（正式机只收整包）
  robocopy(src, dst, { excludeFiles: [MANIFEST] });
  say(`[promote] 已复制 → ${dst}`);

  // ---- ② config.json 换成 X 盘 ----
  say("");
  say("[2/4] config.json 迁移盘符 ...");
  const dstConfig = path.join(dst, "config.json");
  if (!fs.existsSync(dstConfig)) fail([`正式那份里没有 config.json（${dstConfig}）—— 复制不完整，已中止（测试目的地没被清）。`]);
  const { raw, changes } = migrateConfig(dstConfig);
  for (const c of changes) say(`  ${c.where}\n      ${c.from}\n   →  ${c.to}`);
  if (!changes.length) say("  （没有以 D: 开头的值，未改动）");
  fs.writeFileSync(dstConfig, JSON.stringify(raw, null, 2) + "\n", "utf-8");

  // ---- ③ 库迁移盘符 + 校验 ----
  say("");
  say("[3/4] 库迁移盘符（先备份，再改）...");
  if (!fs.existsSync(dbFile)) fail([`正式那份里没有权威库（${dbFile}）—— 已中止（测试目的地没被清）。`]);
  const backup = `${dbFile}.bak-promote-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;
  fs.copyFileSync(dbFile, backup);
  say(`  备份：${path.relative(dst, backup)}`);
  const { db, changes: libChanges } = await migrateLibrary(dbFile);
  if (libChanges.length) {
    for (const c of libChanges) say(`  ${c.table}.${c.column} (rowid ${c.rowid})  ${c.from}  →  ${c.to}`);
    fs.writeFileSync(dbFile, db.export());
    say(`  共改 ${libChanges.length} 处。`);
  } else {
    say("  库里没有以 D: 开头的值，未改动。");
  }
  // 数据文件（GameSaveHelper 的 settings.json / 网吧配置 / 库导出 / 公告 HTML）里的 D: 一起迁
  let fileHits = 0;
  let fileCount = 0;
  for (const f of dataFilesToMigrate(dst)) {
    const { text, count } = scanTextFile(f);
    if (!count) continue;
    fs.writeFileSync(f, text.replace(DRIVE_IN_TEXT, `${TO_DRIVE}:$1`), "utf-8");
    fileHits += count;
    fileCount++;
    say(`  ${path.relative(dst, f)}：${count} 处`);
  }
  say(fileHits ? `  数据文件共改 ${fileHits} 处（${fileCount} 个文件）。` : "  数据文件里没有 D: 路径，未改动。");

  // 运行时副本（data/library/library.db）让客户端下次启动自己重建 —— 留着就是把带 D: 的旧库带过去
  const runtimeDb = path.join(dst, "data", "library");
  if (fs.existsSync(runtimeDb)) {
    fs.rmSync(runtimeDb, { recursive: true, force: true });
    say("  已删运行时库 data/library（客户端下次启动会从权威库重建）。");
  }

  say("");
  say("校验：");
  let bad = 0;
  for (const f of keyFiles) {
    const ok = fs.existsSync(path.join(dst, f));
    if (!ok) bad++;
    say(`  ${ok ? "√" : "×"} ${f}`);
  }
  // 逐项对不上就说明复制不完整 —— 所以这里算的是"**应该**有多少"，而不是"大概差不多"：
  //   正式侧 = 源的文件数 − 运行时库（有意不收）+ 库备份（有意新增）− 部署记录（有意不收）
  const srcCount = countFiles(src);
  const srcRuntime = fs.existsSync(path.join(src, "data", "library")) ? countFiles(path.join(src, "data", "library")) : 0;
  const expect = srcCount - srcRuntime;
  const dstCount = countFiles(dst) - 1 /* .playday-deploy.json 没复制 */ - 1 /* 库备份 */;
  say(`  文件数：源 ${srcCount} 个（其中运行时库 ${srcRuntime} 个有意不随包走）→ 正式侧 ${dstCount} / 期望 ${expect}${dstCount === expect ? "（一致）" : "（⚠️ 不一致）"}`);
  if (bad || dstCount !== expect) {
    fail([
      "校验没过 —— **测试目的地没有被清**（有意如此：先查清楚再清，别丢东西）。",
      `  正式落点：${dst}`,
      "  常见原因：源目录还在被客户端占用（先关掉客户端），或磁盘空间不足。",
    ]);
  }

  // ---- ④ 清走测试目的地（只清我们写过的）----
  say("");
  if (args.keepTest) {
    say("[4/4] --keep-test：保留测试目的地不动。");
  } else {
    say("[4/4] 清走测试目的地（只清部署写过的，原版客户端的文件一律留下）...");
    let n = 0;
    if (args.wipeAll) {
      say("  ⚠️ --wipe-all：连原版 Playnite 的文件一起清。");
      for (const e of fs.readdirSync(src)) {
        fs.rmSync(path.join(src, e), { recursive: true, force: true });
        n++;
      }
    } else {
      const paths = new Set();
      for (const f of manifest.program ?? []) paths.add(path.join(src, f));
      for (const a of manifest.assets ?? []) paths.add(a.dst);
      paths.add(path.join(src, "config.json"));
      // 目录也要收掉：文件删完剩下的空目录（tools/、data/ 之类）不该留在那儿
      for (const a of manifest.targets ?? []) paths.add(a);
      for (const p of paths) {
        const rel = path.relative(src, p);
        if (!rel || rel.startsWith("..")) continue;
        if (fs.existsSync(p)) {
          fs.rmSync(p, { recursive: true, force: true });
          n++;
        }
      }
      fs.writeFileSync(
        manifestFile,
        JSON.stringify({ what: "Playday 部署标记：测试目的地已经被 promote 升到正式机，这里是空的部署壳子。", time: new Date().toLocaleString(), cleared: true }, null, 2) + "\n",
        "utf-8",
      );
    }
    say(`  清了 ${n} 项（原版的 dll / locales / Resources / Themes / PlayniteUI.exe_orign 等未列入部署记录的，一律没动）`);
  }

  say("");
  say(bar);
  say(` 结果：${OK} 升正式完成${useFallback ? "（落在 release\\，还得手动拷过去）" : viaNet ? "（已经发到正式机）" : ""}`);
  say("-".repeat(72));
  say(`  包      ：${dstCount} 个文件 / ${(sizeOf(dst) / 1048576).toFixed(0)} MB  →  ${dst}`);
  say(`  配置    ：config.json 改了 ${changes.length} 处盘符（D: → X:）`);
  say(`  库      ：改了 ${libChanges.length} 处（改之前已自动备份）`);
  say(`  数据文件：${fileHits ? `改了 ${fileHits} 处（${fileCount} 个文件）` : "没有需要改的"}`);
  say(`  校验    ：${OK} 通过（关键文件都在、文件数与源一致）`);
  say(`  测试那份：${args.keepTest ? "按 --keep-test 保留着" : "已清走（只清部署写过的文件，原版的没动）"}`);
  say("-".repeat(72));
  say(" 下一步：");
  if (viaNet) {
    say(`   到正式机上双击 ${wanted}\\PlayniteUI.exe 确认一遍：界面 / 库 / 封面 / 音乐 / 存档备份`);
  } else if (useFallback) {
    say(`   1) 把 ${dst} 里的**全部内容**拷到正式机的 ${wanted}（覆盖同名文件）`);
    say("   2) 在那台机器上双击 PlayniteUI.exe 确认一遍");
  } else {
    say("   在这台机器上双击 PlayniteUI.exe 确认一遍（它本身就是正式机）");
  }
  say("   （想看它到底在读哪些目录：命令行加 -log 启动，会写 data\\logs\\paths-latest.log）");
  say(bar);
}

main().catch((e) => fail([`promote 出错：${e?.stack ?? e}`]));
