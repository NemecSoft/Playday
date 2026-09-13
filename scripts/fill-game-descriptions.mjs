// 批量填充游戏"简要介绍"（games.description）脚本。
//
// 背景（2026-08-17，瀑布流视图需要卡片简介）：
//   数据库 games 表本来就有 description 字段，但当前全空。本脚本从一个 JSON
//   （[{ name, description }]）读取简介，按游戏名严格相等匹配权威库
//   （<数据根>/Admin/library.db）并写入 description。
//   权威库：管理端读/改、客户端启动时复制下发的源头。不要指向运行时副本。
//
// 匹配规则（沿用标签同步脚本的口径）：
//   - 严格相等：game.name === json.name 才算命中。
//   - 只写非空：json 里 description 为空串则跳过（保留库内现有值）。
//   - 库有 json 无 → 跳过（不动）。
//   - 默认 DRY-RUN，加 --apply 才真写库并做时间戳备份。
//
// 用法：
//   node scripts/fill-game-descriptions.mjs                       # dry-run（只看匹配）
//   node scripts/fill-game-descriptions.mjs --apply               # 真写权威库（时间戳备份）
//   node scripts/fill-game-descriptions.mjs --apply --no-backup   # 改库不留备份
//
// JSON 路径：默认 D:/AI/games-web/games_descriptions.json，可用 DESC_JSON 覆盖。
// 数据目录：默认 dev-data，可用 YUNGAME_DATA_DIR 覆盖。

import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";
import { adminDbPath } from "./lib/devData.mjs";

const JSON_FILE = process.env.DESC_JSON || "D:/AI/games-web/games_descriptions.json";
// 权威库位置来自规则表（scripts/lib/devData.mjs，读 path-modes.json 的 dev 段）。
const DB = adminDbPath();

const apply = process.argv.includes("--apply");
const noBackup = process.argv.includes("--no-backup");

console.log("== fill-game-descriptions ==");
console.log("JSON:    ", JSON_FILE);
console.log("DB:      ", DB);
console.log("模式:    ", apply ? "APPLY（真改库）" : "DRY-RUN（只看，不改库）");

if (!fs.existsSync(JSON_FILE)) {
  console.error("找不到 JSON：", JSON_FILE);
  console.error("请创建它，格式：[{ name: \"游戏名\", description: \"简介文字\" }]");
  process.exit(1);
}
if (!fs.existsSync(DB)) { console.error("找不到数据库：", DB); process.exit(1); }

const entries = JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));
if (!Array.isArray(entries)) { console.error("JSON 不是数组"); process.exit(1); }
console.log("JSON 条目数:", entries.length);

// 按 name -> description 建索引（只保留非空）
const nameToDesc = new Map();
const jsonNames = new Set();
let bad = 0;
for (const e of entries) {
  if (!e || typeof e.name !== "string" || typeof e.description !== "string") { bad++; continue; }
  jsonNames.add(e.name);
  if (e.description.trim().length > 0) nameToDesc.set(e.name, e.description.trim());
}
console.log("有效条目:", jsonNames.size, "  其中含非空简介:", nameToDesc.size, "  坏条目:", bad);

const SQL = await initSqlJs();
const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB)));

const rows = db.exec("SELECT id, name, description FROM games");
let dbCount = 0;
if (rows.length > 0) dbCount = rows[0].values.length;
console.log("数据库游戏数:", dbCount);

let matched = 0;        // 命中且将写入
let skippedEmpty = 0;   // json 里简介为空 → 跳过
let skippedMissing = 0; // json 里没有该游戏 → 跳过
let unchanged = 0;      // 已有相同简介 → 无需改

if (rows.length > 0) {
  const stmt = db.prepare("UPDATE games SET description = ? WHERE id = ?");
  for (const r of rows[0].values) {
    const id = r[0];
    const name = r[1];
    const oldDesc = r[2];

    if (!jsonNames.has(name)) { skippedMissing++; continue; }
    const newDesc = nameToDesc.get(name);
    if (newDesc === undefined) { skippedEmpty++; continue; }

    matched++;
    if (oldDesc === newDesc) { unchanged++; continue; }
    if (apply) stmt.run([newDesc, id]);
  }
  if (apply) stmt.free();
}

console.log("\n========== 汇总 ==========");
console.log("  将写入简介（命中）        :", matched);
console.log("  其中已有相同简介（无需改）:", unchanged);
console.log("  跳过（json 里简介为空）   :", skippedEmpty);
console.log("  跳过（json 里没有该游戏） :", skippedMissing);

if (apply) {
  if (!noBackup) {
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
    const bak = `${DB}.bak-${stamp}`;
    fs.copyFileSync(DB, bak);
    console.log("\n已备份旧库到:", bak);
  }
  fs.writeFileSync(DB, Buffer.from(db.export()));
  console.log("已写回数据库 ✅");
} else {
  console.log("\n这是 DRY-RUN。加 --apply 才会真正写入并备份。");
}

db.close();
