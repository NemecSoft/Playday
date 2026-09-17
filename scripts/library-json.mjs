#!/usr/bin/env node
/**
 * library-json.mjs — 整库 ↔ JSON（**一表一文件**）的双向工具。
 *
 * 为什么有它（2026-09-16 需求）："直接把库导出成 json，我改 json 再回写回去，这样管理数据库。
 * 不用 game-content.json 了 —— 免得一会加这个字段一会加那个字段。"
 * 旧链（人工内容表 game-content.json → apply 脚本 → 库）是**按固定键重建**的：加一个字段要改
 * 生成脚本、apply 脚本、守卫的必需键列表三处。这个工具是 **schema 驱动、零字段清单**：
 * 表和列都从库里现发现（sqlite_master / PRAGMA table_info），**加一列、加一张表都不用改代码**。
 *
 * 用法：
 *   node scripts/library-json.mjs export [--tables games,users] [--dir data/library] [--db <库>]
 *   node scripts/library-json.mjs import [--apply] [--merge] [--force] [--add-columns] [--dir data/library] [--db <库>]
 *   node scripts/library-json.mjs find <关键字>     # 在 games.json 里找游戏，报行号（12 万行别肉眼翻）
 *   node scripts/library-json.mjs backup            # 只备份权威库（不碰库），想手动留个回退点就用它
 *
 * 规则（每一条都有原因，改之前先读）：
 *   1. **只认权威库**（<数据根>/Admin/library.db）。运行时副本是"每次启动从权威库复制"的可丢弃
 *      文件，改它等于白改 —— 下次启动就被覆盖（见 shared/pathConfig.ts 的双库机制说明）。
 *      回写后**重启客户端即生效**，不需要手动删副本（复制判定看"大小 + 时间"）。
 *   2. **导出永不改库**（只读）—— 但导出会**覆盖 JSON 文件**，所以当某个文件与库不一致
 *      （= 改了还没回写）时**默认拒绝导出**，要 `--force` 才覆盖。这个坑是实测踩出来的：
 *      合并完人工内容后顺手又跑了一次 export，库里的旧值把刚合并的内容直接抹掉了
 *      （指纹只防"拿旧 JSON 回写"这个方向，导出方向原本没有任何保护）。
 *   3. **导入默认 dry-run**，加 `--apply` 才写 —— 与项目里其它写库脚本一致（sync-tags / apply）。
 *   4. **只替换"有 JSON 文件"的表**：没导出的表（比如没导 users）绝不动。这样"只导 games"
 *      也不会误删 users / game_libraries。
 *   5. **不按 db.ts 的 SCHEMA 重建新库**，而是"复制现库 → 清空目标表 → 插回去"：
 *      权威库的真实列与 SCHEMA 并不一致（实测多一列 description_alt、且没有 show_bat_console），
 *      重建会整列丢数据。
 *   6. **写库前强制备份**（`library.db.bak-<本地时间戳 YYYYMMDD-HHMMSS>`，替代原 UTC ISO 命名）+
 *      **写进临时文件、校验通过再原子改名**（失败不动原库）。备份**没法绕过**（没有 --no-backup），
 *      因为它是最后一道回退手段；想手动留点另有独立入口：`backup` 子命令 / 双击 librarydb-backup.bat。
 *   7. **指纹保护**：`_meta.json` 记下导出时的库指纹，导入时对不上就拒绝（要 `--force`）——
 *      拦住"拿三天前的导出回写"，那会把期间的改动悄悄抹掉。
 *   8. 空表**不导出**（并删掉它残留的旧 json 文件，免得下次导入把旧数据"复活"）。
 *   9. **默认只管 `games` 一张表**（2026-09-16 用户决定）：`users` 不用了（等级/门店沿用旧系统的
 *      YunGame_UserList.json）、`game_libraries` 设计已废弃。要别的表用 `--tables users,xxx`。
 *      ⚠️ 停用某张表时要**删掉它的 json 文件** —— 导入会把"有 json 文件的表"整表替换。
 *      ⚠️ 反过来说：**没导出的表绝不会被动**（这就是"只导 games 不会误删 users"的保证）。
 *  10. 列名拼错 = 报错（防"静默写回 NULL"）；**真要新增列**得显式加 `--add-columns`。
 *     为什么要有这个口子：权威库的真实列比 electron/core/db.ts 的 SCHEMA **少**（实测没有
 *     show_bat_console —— 那列原来是 apply 脚本在某次同步时顺手 ALTER 加上的）。旧链一退，
 *     就没人能加列了，而"加字段"正是这套整库管理要解决的问题。默认仍从严：**打错一个字母
 *     就静静多出一列**比报错难查得多。
 *     新增列**不声明类型**（SQLite 的"无类型 = 按写入值原样存"）：声明成 INTEGER/TEXT 会带来
 *     类型亲和性转换 —— 比如把 `0` 存进 TEXT 列会变成字符串 '0'，而代码里 `installed ? … : …`
 *     判断遇到 '0' 是**真**，于是"未安装"变"已安装"，静默出错。
 */
import fs from "fs";
import path from "path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
// 纯逻辑在 scripts/lib/libraryJson.mjs（零 import、可单测）；这里只做 IO。
// ⚠️ 别 import shared/*.ts —— 脚本是纯 node 跑的（没有 TS 编译这一环），
//    网站端 server/paths.mjs 走的是"同名 .mjs + 手写 .d.mts"，同一个道理。
import {
  LIBRARY_JSON_DIR,
  LIBRARY_JSON_META,
  arrayColumnsOf,
  checkArrayColumns,
  diffRows,
  fileFingerprint,
  isEmptyKey,
  localStamp,
  metaMatchesLibrary,
  missingKeysOf,
  rowToDb,
  rowToJson,
  searchRows,
  tableFileOf,
  tableOfFilesIn,
  validateRows,
} from "./lib/libraryJson.mjs";
import { adminDbPath } from "./lib/devData.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const cmd = argv[0];
const DIR = path.resolve(ROOT, argOf("--dir", LIBRARY_JSON_DIR));
// 库路径的唯一来源：scripts/lib/devData.mjs（别在这儿拼目录名）。
const DB = path.resolve(argOf("--db", adminDbPath()));
/**
 * 默认**只管 games 表**（2026-09-16 用户决定）：
 *   · `users` —— 不用了。等级/门店现在沿用**旧系统的 YunGame_UserList.json**
 *     （见 electron/core/auth.ts 的 resolveCurrentUserLevel）；库里那份是先留着的历史数据，
 *     等新系统稳定运行后再重新设计。
 *   · `game_libraries` —— 该设计已废弃。
 *   · `platforms` / `platform` / `library_plugins` —— 迁移残留或空表。
 * 要管别的表就用 `--tables users,xxx` 显式指名（表/列仍是现发现的，不需要改代码）。
 */
const DEFAULT_TABLES = ["games"];
const TABLES_ARG = argOf("--tables", "");
const ONLY_TABLES = TABLES_ARG
  ? TABLES_ARG.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : DEFAULT_TABLES;
const APPLY = has("--apply");
const MERGE = has("--merge");
const FORCE = has("--force");
const ADD_COLUMNS = has("--add-columns");

// ─── 小工具 ───────────────────────────────────────────────────────────────
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const quote = (name) => `"${name.replace(/"/g, '""')}"`;
/** 备份/库文件的大小（MB，一位小数）—— 报出来让人能确认"这真是整库那一份"。 */
const mbOf = (file) => (fs.statSync(file).size / 1024 / 1024).toFixed(1);
/** 表名要当文件名用：挡住带路径分隔符的名字（防写出目录外）。 */
function assertSafeTableName(table) {
  if (/[\\/]/.test(table) || table === "." || table === "..") {
    throw new Error(`表名不能当文件名用: ${table}`);
  }
}

async function openSqlite(file) {
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs({ locateFile: (f) => path.join(ROOT, "node_modules", "sql.js", "dist", f) });
  return new SQL.Database(new Uint8Array(fs.readFileSync(file)));
}

function listTables(db) {
  const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return res.length ? res[0].values.map((r) => String(r[0])) : [];
}

function columnsOf(db, table) {
  const res = db.exec(`PRAGMA table_info(${quote(table)})`);
  return res.length ? res[0].values.map((r) => String(r[1])) : [];
}

function readRows(db, table) {
  const st = db.prepare(`SELECT * FROM ${quote(table)}`);
  const rows = [];
  while (st.step()) rows.push(st.getAsObject());
  st.free();
  return rows;
}

function countRows(db, table) {
  const res = db.exec(`SELECT count(*) FROM ${quote(table)}`);
  return res.length ? Number(res[0].values[0][0]) : 0;
}

// ─── 备份 ─────────────────────────────────────────────────────────────────
/**
 * 备份权威库 —— **只复制，不写库**，返回备份文件的绝对路径。
 *
 * 回写（import --apply）与独立的 `backup` 子命令**共用这一份**：备份名规则一分裂，
 * 出事时就得分清"哪种名字才是回退点"（而那是你最不想思考的时刻）。
 *
 * 同一秒内连备两次时加 `-2`、`-3` 后缀，**绝不覆盖已有备份** —— 覆盖备份等于把回退点弄丢，
 * 而这正是备份唯一要防的事。
 */
function backupDb() {
  const stamp = localStamp();
  let bak = `${DB}.bak-${stamp}`;
  for (let i = 2; fs.existsSync(bak); i++) bak = `${DB}.bak-${stamp}-${i}`;
  fs.copyFileSync(DB, bak);
  return bak;
}

/** `backup` 子命令：手动给权威库留一个回退点（**不碰库**，随时可跑）。 */
function doBackup() {
  if (!fs.existsSync(DB)) {
    console.error(`[错误] 权威库不存在: ${rel(DB)}\n       权威库是数据的唯一来源，先解决它再备份。`);
    process.exit(1);
  }
  console.log("== 备份权威库（只复制，不写库）==");
  console.log(`权威库 : ${rel(DB)}`);
  const bak = backupDb();
  console.log(`[备份] ${rel(bak)}（${mbOf(bak)} MB）`);
  console.log(`\n✔ 完成。回退方法：把上面这个文件复制回 ${path.basename(DB)} 覆盖即可。`);
}

// ─── 导出 ─────────────────────────────────────────────────────────────────
async function doExport() {
  if (!fs.existsSync(DB)) {
    console.error(`[错误] 权威库不存在: ${rel(DB)}\n       权威库是数据的唯一来源，先解决它再导出。`);
    process.exit(1);
  }
  const db = await openSqlite(DB);
  const allTables = listTables(db);
  const tables = ONLY_TABLES.length ? ONLY_TABLES : allTables;
  const unknown = tables.filter((t) => !allTables.includes(t));
  if (unknown.length) {
    db.close();
    console.error(`[错误] 库里没有这些表: ${unknown.join(", ")}\n       现有表: ${allTables.join(", ")}`);
    process.exit(1);
  }

  fs.mkdirSync(DIR, { recursive: true });
  console.log("== 整库导出 JSON ==");
  console.log(`权威库: ${rel(DB)}`);
  console.log(`输出到: ${rel(DIR)}（本次导出: ${tables.join(", ")}）`);
  if (!TABLES_ARG) {
    console.log("       （默认只管 games —— 要导别的表用 --tables users,xxx）");
  }
  console.log("");

  const tableRows = {};
  // 每张表里"哪些列是数组列"（导出时现看，不靠手写清单）—— 写进 _meta.json，
  // 导入时用它拦住"把数组写成了字符串"（App 会静默读成空数组，等于丢值）。
  const tableArrayColumns = {};
  const written = [];
  const removed = [];
  const dirty = []; // 文件与库不一致的表（= 有人改了 JSON 还没回写）
  const outputs = []; // 先算完再落盘：这样"发现不一致"时可以整体不动
  for (const table of tables) {
    assertSafeTableName(table);
    const file = path.join(DIR, tableFileOf(table));
    const n = countRows(db, table);
    if (n === 0) {
      // 空表不导出（否则一个 0 行的文件会让下次导入"把这张表清空" —— 虽然结果一样，
      // 但更糟的是它会让**过时的旧文件**继续参与导入、把旧数据复活，所以顺手删掉残留文件）。
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        removed.push(table);
      }
      console.log(`  ${table.padEnd(16)} ${String(n).padStart(6)} 行  → 空表，跳过${removed.includes(table) ? "（已删掉残留的旧 json）" : ""}`);
      continue;
    }
    const columns = columnsOf(db, table);
    const rows = readRows(db, table).map(rowToJson);
    outputs.push({ table, file, columns, rows, n });
  }
  db.close();

  // ---- 保护：导出会**无条件覆盖** JSON，所以先看"现有文件与库是否一致" ----
  // 这一个坑是实测踩出来的：合并完人工内容后顺手又跑了一次 export，库里的旧值把刚合并的内容
  // 直接抹掉了（导出方向没有任何保护 —— 指纹只防"拿旧 JSON 回写"）。
  // 判据要带上"文件里多出来的键"：那可能是用户按 --add-columns 新增、还没回写的列。
  for (const o of outputs) {
    if (!fs.existsSync(o.file)) continue;
    let existing = null;
    try {
      existing = JSON.parse(fs.readFileSync(o.file, "utf8"));
    } catch {
      dirty.push({ ...o, note: "文件不是合法 JSON（解析失败）", diff: null });
      continue;
    }
    if (!Array.isArray(existing)) {
      dirty.push({ ...o, note: "顶层不是数组", diff: null });
      continue;
    }
    const keys = [...new Set([...o.columns, ...existing.flatMap((r) => (r && typeof r === "object" ? Object.keys(r) : []))])];
    const diff = diffRows({ table: o.table, columns: keys, pk: "id" }, existing, o.rows);
    if (diff.added || diff.removed || diff.changed) dirty.push({ ...o, note: null, diff, existing });
  }
  if (dirty.length && !FORCE) {
    console.error(`✗ 拒绝导出：${dirty.length} 张表的 JSON 与库**不一致**（改了还没回写？）——`);
    for (const d of dirty) {
      const what = d.diff
        ? `库里这 ${d.rows.length} 行 vs 文件 ${d.diff.added + d.diff.changed + d.diff.removed} 处不同（新增 ${d.diff.added} / 删除 ${d.diff.removed} / 修改 ${d.diff.changed}）`
        : d.note;
      console.error(`  - ${tableFileOf(d.table)}：${what}`);
    }
    console.error(
      "\n  导出会用库里的值**覆盖**这些文件、把你的改动丢掉。两种处理：\n" +
        "    ① 先把改动写进库（推荐）：npm run db:import -- --apply\n" +
        "    ② 确认要丢弃 JSON 里的改动：重跑并加 --force",
    );
    process.exit(1);
  }
  for (const d of dirty) {
    console.log(`[--force] ${tableFileOf(d.table)} 与库不一致，仍按库里的值覆盖`);
  }

  for (const o of outputs) {
    tableRows[o.table] = o.rows.length;
    tableArrayColumns[o.table] = arrayColumnsOf(o.rows);
    fs.writeFileSync(o.file, JSON.stringify(o.rows, null, 2) + "\n", "utf8");
    written.push(o.table);
    console.log(`  ${o.table.padEnd(16)} ${String(o.n).padStart(6)} 行  → ${tableFileOf(o.table)}`);
  }

  // 元数据：导出时的库指纹（导入时用它拦住"拿旧导出回写"）。
  const stat = fs.statSync(DB);
  const meta = {
    exportedAt: new Date().toISOString(),
    dbPath: rel(DB),
    ...fileFingerprint(stat),
    tableRows,
    arrayColumns: tableArrayColumns,
  };
  fs.writeFileSync(path.join(DIR, LIBRARY_JSON_META), JSON.stringify(meta, null, 2) + "\n", "utf8");

  // 目录里残留的、**不归本次导出管**的表文件：导入时"有 json 文件的表都会被替换"，
  // 所以这些旧文件不是"不管它就行"——它们仍会被写回库。不再维护就删掉。
  const stale = tableOfFilesIn(fs.readdirSync(DIR)).filter((t) => !tables.includes(t));
  if (stale.length) {
    console.log(
      `\n[注意] ${rel(DIR)} 里还有不归本次导出管的表文件：${stale.map(tableFileOf).join("、")}`,
    );
    console.log(
      "       导入会把「有 json 文件的表」整表替换 —— 不再维护这些表的话，请把对应文件删掉，别再让它参与回写。",
    );
  }

  console.log(`\n✔ 已导出 ${written.length} 张表 → ${rel(DIR)}（库**未改动**）`);
  console.log(`  元数据: ${LIBRARY_JSON_META}（记录导出时的库指纹，防"拿旧 JSON 回写"）`);
  console.log(`  改完 JSON 后回写: npm run db:import  → 双击 libraryjson-importto-librarydb.bat（会先预览再确认）`);
}

// ─── 查找（不读库：找的就是你正在改的那份 JSON） ───────────────────────────
/**
 * 在 `data/library/games.json` 里按关键字找游戏，报出**行号**与关键列。
 * 为什么需要：这文件 3.5MB / 12 万行，编辑器里 Ctrl+F 又慢又容易搜不到
 * （搜索框带了隐藏字符，或者名字带后缀 —— 比如找「消防模拟」而库里叫
 * 「消防模拟：火苗燃动-网吧联机版」）。
 */
async function doFind() {
  const keyword = argv.slice(1).filter((a) => !a.startsWith("--")).join(" ");
  if (!keyword.trim()) {
    console.error("用法: node scripts/library-json.mjs find <关键字>\n例：npm run db:find -- 消防");
    process.exit(1);
  }
  const file = path.join(DIR, tableFileOf("games"));
  if (!fs.existsSync(file)) {
    console.error(`[错误] 找不到 ${rel(file)} —— 先导出：npm run db:export`);
    process.exit(1);
  }
  const text = fs.readFileSync(file, "utf8");
  const rows = JSON.parse(text);
  // 除身份字段外也查 tags/region（它们是数组，searchRows 会拼成字符串再比）。
  const hits = searchRows(rows, keyword, ["name", "id", "game_id", "origin_name", "tags", "region"]);
  console.log(`== 在 ${rel(file)} 里找「${keyword}」==`);
  console.log(`共 ${rows.length} 行，命中 ${hits.length} 个\n`);
  if (!hits.length) {
    console.log("（没找到）提示：库里常带后缀，比如「消防模拟」实际叫「消防模拟：火苗燃动-网吧联机版」；");
    console.log("  可以只搜两个字（如「消防」）、或换用别的字段关键字（game_id / 英文名）。");
    return;
  }
  for (const { index, row } of hits) {
    // 行号：按该行 id 的锚点算（导出格式固定 `"id": "…",`），方便直接跳过去改。
    const anchor = `"id": ${JSON.stringify(row.id)}`;
    const pos = row.id ? text.indexOf(anchor) : -1;
    const line = pos >= 0 ? text.slice(0, pos).split("\n").length : null;
    const intro = String(row.intro ?? "").replace(/\s+/g, " ");
    console.log(
      `${line ? `第 ${String(line).padStart(6)} 行` : "  行号未知"}  #${String(index).padStart(4)}  ${row.name}`,
    );
    console.log(
      `           id=${row.id ?? "(空)"}  game_id=${row.game_id ?? "(空)"}  level=${row.game_level ?? "(空)"}  installed=${row.installed ?? "(空)"}`,
    );
    if (Array.isArray(row.tags) && row.tags.length) console.log(`           tags=${row.tags.join(" / ")}`);
    if (intro) console.log(`           intro=${intro.slice(0, 50)}${intro.length > 50 ? "…" : ""}`);
    console.log("");
  }
  console.log("改完记得回写：npm run db:import -- --apply（或双击 libraryjson-importto-librarydb.bat）");
}

// ─── 导入 ─────────────────────────────────────────────────────────────────
/** 读目录里所有表文件（跳过 `_` 开头的元数据/杂项）。 */
function readTableFiles() {
  if (!fs.existsSync(DIR)) {
    console.error(`[错误] 目录不存在: ${rel(DIR)}\n       先导出一次：npm run db:export`);
    process.exit(1);
  }
  const files = tableOfFilesIn(fs.readdirSync(DIR));
  if (!files.length) {
    console.error(`[错误] ${rel(DIR)} 里没有任何表文件（*.json）\n       先导出一次：npm run db:export`);
    process.exit(1);
  }
  return files.map((table) => {
    assertSafeTableName(table);
    const file = path.join(DIR, tableFileOf(table));
    let rows;
    try {
      rows = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      console.error(`[错误] ${tableFileOf(table)} 不是合法 JSON：${e.message}\n       手改时多半是括号/逗号/引号写坏了。`);
      process.exit(1);
    }
    return { table, file, rows };
  });
}

async function doImport() {
  console.log("== 整库 JSON 回写 ==");
  console.log(`JSON   : ${rel(DIR)}`);
  console.log(`权威库 : ${rel(DB)}`);
  console.log(`模式   : ${APPLY ? "APPLY（会写库 + 备份）" : "DRY-RUN（只看会改多少）"}${MERGE ? "｜合并（不删库里的行）" : "｜整表替换"}\n`);

  // 指纹：拦住"拿旧导出回写"。
  const metaFile = path.join(DIR, LIBRARY_JSON_META);
  let meta = null;
  if (fs.existsSync(metaFile)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    } catch {
      console.error(`[错误] ${LIBRARY_JSON_META} 不是合法 JSON。`);
      process.exit(1);
    }
  }
  const stat = fs.existsSync(DB) ? fs.statSync(DB) : null;
  // 文案随 --force 变：带着 --force 时说"[拒绝]…然后又写进去了"会让人以为程序在胡来
  // （2026-09-16 实测踩过这个读感问题）。
  if (!meta) {
    console.error(
      (FORCE ? "[--force] 没有 " : "[拒绝] 没有 ") +
        `${LIBRARY_JSON_META}（无法确认这批 JSON 是从哪个库导出的）。\n` +
        (FORCE
          ? "       按 --force 继续（跳过指纹检查）。"
          : "       先跑一次 npm run db:export 生成它；确实要跳过检查就加 --force。"),
    );
    if (!FORCE) process.exit(1);
  } else if (stat && !metaMatchesLibrary(meta, stat)) {
    console.error(
      (FORCE
        ? "[--force] 权威库在导出之后被改过（指纹不一致），按 --force 继续 —— "
        : "[拒绝] 权威库在导出之后被改过（指纹不一致）—— ") +
        "现在回写会把那些改动抹掉。\n" +
        `       导出时间: ${meta.exportedAt}｜导出时: ${meta.dbBytes} 字节 @ ${new Date(meta.dbMtimeMs).toISOString()}\n` +
        `       当前    : ${stat.size} 字节 @ ${new Date(stat.mtimeMs).toISOString()}\n` +
        (FORCE
          ? "       ⚠️ 这是你明确要求的：库在导出之后的那部分改动会被这批 JSON 覆盖。"
          : "       处理办法：① 先 npm run db:export 重新导出、把你的改动合并进去（推荐）；" +
            "② 确认要覆盖就加 --force。"),
    );
    if (!FORCE) process.exit(1);
  }

  const files = readTableFiles();
  const db = await openSqlite(DB);
  const dbTables = listTables(db);

  // ---- 校验阶段：任何一项不过就整体不动（避免"改了一半"）----
  const problems = [];
  const warnings = [];
  const addedColumns = []; // --add-columns 新建的列（下面报出来 + 一并写进库）
  const plans = [];
  for (const { table, file, rows } of files) {
    if (!dbTables.includes(table)) {
      problems.push(`${tableFileOf(table)}: 库里没有表 ${table}（库比 JSON 旧？还是文件名写错了？）`);
      continue;
    }
    const columns = columnsOf(db, table);
    // --add-columns：JSON 里有、库里没有的列 —— 真的新增列（而不是打错）时才允许。
    // 只在内存里 ALTER；下面的 dry-run / 报错路径都不会把它写进磁盘。
    let effective = columns;
    if (ADD_COLUMNS) {
      const extra = [];
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        for (const k of Object.keys(row)) if (!columns.includes(k) && !extra.includes(k)) extra.push(k);
      }
      for (const col of extra) {
        if (!col.trim()) throw new Error(`${table}.json: 有空列名，无法新增`);
        // 不声明类型：SQLite 的"无类型列"按写入值原样存，避免类型亲和性把 0 变成 '0'
        // （那会让 `installed ? …` 这类判断从"假"变成"真"，静默出错）。
        db.run(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(col)}`);
      }
      if (extra.length) {
        addedColumns.push(`${table}: ${extra.join("、")}`);
        effective = [...columns, ...extra];
      }
    }
    const spec = { table, columns: effective, pk: "id", unique: table === "games" ? ["name"] : [] };
    const errs = validateRows(spec, rows);
    if (errs.length) {
      problems.push(...errs);
      continue;
    }
    // 数组列被写成普通字符串 → App 静默读成空数组。用导出时记下的数组列清单拦（不是手写字段表）。
    const arrErrs = checkArrayColumns(spec, rows, meta?.arrayColumns?.[table] ?? []);
    if (arrErrs.length) {
      problems.push(...arrErrs);
      continue;
    }
    // 无主键的行不拦，但要说出来（权威库里本来就有这种空壳行，见 libraryJson.mjs）。
    const noKey = missingKeysOf(spec, rows);
    if (noKey.length) {
      warnings.push(
        `${tableFileOf(table)}: ${noKey.length} 行没有 id（${noKey
          .slice(0, 3)
          .map((x) => x.label)
          .join("、")}${noKey.length > 3 ? " …" : ""}）—— 建议补个 id 或删掉这行；` +
          (MERGE ? "本次**合并模式会跳过**它们（没法按主键匹配）" : "本次会原样写回"),
      );
    }
    const current = readRows(db, table).map(rowToJson);
    // ⚠️ 写入用的是 `effective`（含 --add-columns 新建的列），不是 `columns` ——
    // 用错会让新列的值全被写成 NULL（预览却显示"修改 N 行"，看着像成功了）。
    plans.push({ table, file, rows, columns: effective, spec, current, diff: diffRows(spec, current, rows) });
  }
  if (problems.length) {
    db.close();
    console.error(`✗ 校验未通过（${problems.length} 项）—— 库未被改动：`);
    for (const p of problems) console.error("  - " + p);
    if (problems.some((p) => p.includes("不存在的列"))) {
      console.error(
        "\n提示：如果那些列是**真要新增**（不是打错），加 --add-columns 让它自动建列（不声明类型，按写入值原样存）。",
      );
    }
    process.exit(1);
  }
  for (const w of warnings) console.log(`[注意] ${w}`);
  for (const c of addedColumns) console.log(`[新增列] ${c}（不声明类型，按写入值原样存）`);

  // ---- 预览 ----
  console.log("每张表的变化（库现在的行 → JSON 里的行）：");
  for (const p of plans) {
    const d = p.diff;
    const extra = MERGE
      ? `新增 ${d.added} / 修改 ${d.changed} / 已一致 ${d.unchanged}（合并模式：库里的 ${d.removed} 行删不掉）`
      : `新增 ${d.added} / 删除 ${d.removed} / 修改 ${d.changed} / 已一致 ${d.unchanged}`;
    console.log(`  ${p.table.padEnd(16)} ${String(p.current.length).padStart(6)} → ${String(p.rows.length).padStart(6)} 行  ｜ ${extra}`);
  }

  const totalChanged = plans.reduce((s, p) => s + p.diff.added + p.diff.changed + p.diff.removed, 0);
  // 0 处变化 = 没有要写的东西。**这句提示必须写明白**：库的 mtime 不变、也不产生新备份，
  // 于是"按 Y 之后什么都没发生"极易被读成"脚本没起作用"（2026-09-16 实测就是这么误判的）。
  // 顺带把最常见的坑写进提示：有两个 games.json，改错了那个（仓库根、给存档工具用的）不会影响库。
  const NOTHING_TO_WRITE =
    "库与 JSON 已完全一致 —— **没有要回写的改动**（真写也不会改动库、不产生备份）。\n" +
    "  若你确实改过 JSON 却没看到差异，检查两点：\n" +
    `    1) 改的是 ${rel(DIR)}/games.json（整库镜像）—— 仓库根那个 games.json 是给存档工具看的只读导出，改它不影响库；\n` +
    "    2) 文件确实保存了，且改的是**库里有这一列**的字段（拼错的列名会被拦下，不会静默生效）。";
  if (!APPLY) {
    db.close();
    if (totalChanged === 0) {
      console.log(`\n（DRY-RUN 结束，共 0 处变化）${NOTHING_TO_WRITE}`);
      return;
    }
    console.log(`\n（DRY-RUN 结束，共 ${totalChanged} 处变化。确认无误后加 --apply 真写。）`);
    console.log("  回写后**重启客户端**即生效（启动时会从权威库复制运行时副本）。");
    return;
  }
  if (totalChanged === 0) {
    db.close();
    console.log(`\n✔ 无需写库：${NOTHING_TO_WRITE}`);
    return;
  }

  // ---- 写入阶段：先在内存里改完 → 导出成临时文件 → 校验 → 备份 → 原子改名 ----
  const tmp = `${DB}.tmp-library-json`;
  let skippedNoKey = 0; // 合并模式下被跳过的无主键行（下面会报出来）
  try {
    db.run("BEGIN");
    for (const p of plans) {
      const cols = p.columns;
      const insertSql = `INSERT INTO ${quote(p.table)} (${cols.map(quote).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      const updateSql = `UPDATE ${quote(p.table)} SET ${cols.filter((c) => c !== "id").map((c) => `${quote(c)} = ?`).join(", ")} WHERE id = ?`;
      const existingIds = new Set(p.current.map((r) => String(r.id)));
      if (!MERGE) db.run(`DELETE FROM ${quote(p.table)}`);
      const insert = db.prepare(insertSql);
      for (const row of p.rows) {
        const record = rowToDb(row, cols);
        const values = cols.map((c) => record[c]);
        // 无主键的行没法按主键匹配 —— 合并模式不碰它们（整表替换模式照常插回去）。
        if (MERGE && isEmptyKey(row.id)) {
          skippedNoKey++;
          continue;
        }
        if (MERGE && existingIds.has(String(row.id))) {
          db.run(updateSql, [...cols.filter((c) => c !== "id").map((c) => record[c]), record.id]);
        } else {
          insert.run(values);
        }
      }
      insert.free();
    }
    db.run("COMMIT");
  } catch (e) {
    try {
      db.run("ROLLBACK");
    } catch {
      /* 回滚失败也继续，下面不会写盘 */
    }
    db.close();
    console.error(`✗ 写库失败（库未被改动）：${e.message}`);
    process.exit(1);
  }

  fs.writeFileSync(tmp, Buffer.from(db.export()));
  db.close();

  // 复验：把临时文件重新打开、逐表数行数（与 JSON 里的行数对齐）——写坏了就别盖真库。
  const check = await openSqlite(tmp);
  const mismatched = [];
  for (const p of plans) {
    if (MERGE) continue; // 合并模式下"库里多出来的行"本来就允许存在
    const got = countRows(check, p.table);
    if (got !== p.rows.length) mismatched.push(`${p.table}: JSON ${p.rows.length} 行，写出来 ${got} 行`);
  }
  check.close();
  if (mismatched.length) {
    fs.unlinkSync(tmp);
    console.error(`✗ 写出的库行数对不上，已放弃（库未被改动）：\n  - ${mismatched.join("\n  - ")}`);
    process.exit(1);
  }

  // 备份必须在**原子替换之前**：这份就是"回退点"，内容必须是写库前的原库。
  // 名字规则与 `backup` 子命令共用一份（见 backupDb）→ `library.db.bak-20260916-043012`。
  const bak = backupDb();
  fs.renameSync(tmp, DB);
  console.log(`\n[备份] ${rel(bak)}（${mbOf(bak)} MB —— 写库**之前**的原库，回退就是把它拷回来）`);
  console.log(`[写入] ${rel(DB)}（${plans.map((p) => p.table).join(", ")}）`);

  // 指纹要跟着更新，否则下次导入会误报"库被改过"（这次改的就是我们自己）。
  const statAfter = fs.statSync(DB);
  fs.writeFileSync(
    metaFile,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        dbPath: rel(DB),
        ...fileFingerprint(statAfter),
        tableRows: Object.fromEntries(plans.map((p) => [p.table, p.rows.length])),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log("\n✔ 已写回。**重启客户端即生效**（启动时会从权威库复制运行时副本）。");
  if (MERGE) console.log("  提示：合并模式下你在 JSON 里删掉的行没有真的删掉 —— 要删行请不带 --merge 跑。");
  if (skippedNoKey) console.log(`  提示：合并模式跳过了 ${skippedNoKey} 行没有 id 的空壳行（整表替换模式下会照常写回）。`);
  console.log(`  回退：把 ${rel(bak)} 复制回 library.db 覆盖即可。`);
}

async function main() {
  if (cmd === "export") await doExport();
  else if (cmd === "import") await doImport();
  else if (cmd === "find") await doFind();
  else if (cmd === "backup") doBackup();
  else {
    console.error(
      "用法:\n" +
        "  node scripts/library-json.mjs export [--tables games,users] [--dir data/library] [--db <库>]\n" +
        "  node scripts/library-json.mjs import [--apply] [--merge] [--force] [--add-columns] [--dir data/library] [--db <库>]\n" +
        "  node scripts/library-json.mjs find <关键字>   （在 games.json 里找游戏，报行号）\n" +
        "  node scripts/library-json.mjs backup          （只备份权威库，不写库）\n" +
        "    --apply       真写（默认只预览）      --merge    只合并不删行（默认整表替换）\n" +
        "    --force       库被改过也照样写        --add-columns  允许按 JSON 新建列（默认拼错列名会报错）\n" +
        "详见 docs/design/library-json.md",
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("失败:", e);
  process.exit(1);
});
