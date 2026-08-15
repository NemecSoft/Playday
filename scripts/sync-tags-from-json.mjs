// 统一的标签同步脚本：把外部 games_tags.json 的标签完全覆盖进【权威库】，并兜底清理 "Tag:" 残留。
//
// 背景（来源统一决策，2026-08-16 修正）：
//   games_tags.json（D:/AI/games-web/）是【临时权威源】；
//   数据库 games 表的 tags 列是【根据 json 更新后】的结果；
//   侧边栏按更新后数据库里的标签统计、显示。
//   权威库路径是 <数据根>/Admin/library.db（管理端读/改这个，改完下发）。
//   客户端每次启动会把 Admin 权威库复制到运行时副本 <数据根>/library/library.db 再使用。
//   所以标签同步必须写【权威库 Admin/library.db】，而不是运行时副本。
//   本脚本是【唯一】从 json 同步标签的入口。
//
// 匹配规则（沿用之前用户确认的决策）：
//   - 完全覆盖：json 的 tags 直接替换权威库现有 tags。
//   - 严格相等：game.name === json.name 才算命中（不做模糊/包含匹配）。
//   - 命中不了：权威库有此游戏但 json 没有 → 跳过不动（保留现有标签）。
//   - "Tag:" 前缀：视为旧自动标签残留，一律移除。
//
// 默认 DRY-RUN（只看匹配率和将覆盖多少，不改库），真正改库加 --apply。
// 改库前自动备份 .bak（除非 --no-backup）。
//
// 用法：
//   node scripts/sync-tags-from-json.mjs                       # dry-run
//   node scripts/sync-tags-from-json.mjs --apply               # 真改权威库（备份 .bak）
//   node scripts/sync-tags-from-json.mjs --apply --no-backup   # 改库不留备份
//
// 数据目录：默认 release/data（Playday 唯一游戏数据源），可用 YUNGAME_DATA_DIR 覆盖。
// JSON 路径：默认 D:/AI/games-web/games_tags.json，可用 TAGS_JSON 覆盖。

import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

const JSON_FILE = process.env.TAGS_JSON || "D:/AI/games-web/games_tags.json";
const DATA_DIR = process.env.YUNGAME_DATA_DIR || path.join(process.cwd(), "release", "data");
// 权威库：管理端读/改、客户端启动时复制下发的源头。不要把目标指向运行时副本。
const DB = path.join(DATA_DIR, "Admin", "library.db");

const apply = process.argv.includes("--apply");
const noBackup = process.argv.includes("--no-backup");

console.log("== sync-tags-from-json ==");
console.log("JSON:    ", JSON_FILE);
console.log("DB:      ", DB);
console.log("模式:    ", apply ? "APPLY（真改库）" : "DRY-RUN（只看，不改库）");

if (!fs.existsSync(JSON_FILE)) { console.error("找不到 JSON：", JSON_FILE); process.exit(1); }
if (!fs.existsSync(DB)) { console.error("找不到数据库：", DB); process.exit(1); }

// 读入外部标签，按 name -> tags 建索引
const jsonTags = JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));
if (!Array.isArray(jsonTags)) { console.error("JSON 不是数组"); process.exit(1); }
console.log("JSON 游戏数:", jsonTags.length);

const nameToTags = new Map();
let badEntry = 0;
for (const e of jsonTags) {
  if (!e || typeof e.name !== "string" || !Array.isArray(e.tags)) { badEntry++; continue; }
  nameToTags.set(e.name, e.tags.filter((t) => String(t).trim() !== "" && !/^Tag:\s*/i.test(String(t))));
}
console.log("有效条目:", nameToTags.size, "  跳过坏条目:", badEntry);

const SQL = await initSqlJs();
const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB)));

const rows = db.exec("SELECT id, name, tags FROM games");
let dbCount = 0;
if (rows.length > 0) dbCount = rows[0].values.length;
console.log("数据库游戏数:", dbCount);

let matched = 0;
let overwritten = 0;
let unchanged = 0;
let cleanedTagPrefix = 0;
const missing = []; // 数据库里匹配不到 json 的游戏名

if (rows.length > 0) {
  const stmt = db.prepare("UPDATE games SET tags = ? WHERE id = ?");
  for (const r of rows[0].values) {
    const id = r[0];
    const name = r[1];
    const oldTags = r[2];
    // 先清 "Tag:" 残留
    let oldArr = [];
    try { oldArr = JSON.parse(oldTags || "[]"); } catch (e) {}
    const oldArrFiltered = oldArr.filter((t) => !/^Tag:\s*/i.test(String(t).trim()));
    cleanedTagPrefix += oldArr.length - oldArrFiltered.length;

    if (!nameToTags.has(name)) { missing.push(name); continue; } // 库有 json 无 → 跳过保留
    const newTags = nameToTags.get(name);
    matched++;
    const newJson = JSON.stringify(newTags);
    const oldJson = JSON.stringify(oldArrFiltered);
    if (oldJson !== newJson) {
      if (apply) stmt.run([newJson, id]);
      overwritten++;
    } else {
      unchanged++;
    }
  }
  if (apply) stmt.free();
}

console.log("\n匹配结果:");
console.log("  数据库游戏能匹配到 json 的:", matched);
console.log("  其中标签有变化（将覆盖）:", overwritten);
console.log("  标签已一致（无需改）  :", unchanged);
console.log("  数据库有但 json 没有（跳过，保留原标签）:", missing.length);
console.log("  顺带清理的 'Tag:' 残留:", cleanedTagPrefix, "个");

// json 有但数据库没有
let jsonOnly = 0;
for (const n of nameToTags.keys()) {
  if (!rows.length || !rows[0].values.some((r) => r[1] === n)) jsonOnly++;
}
console.log("  json 有但数据库没有（跳过）:", jsonOnly);

if (missing.length > 0 && missing.length <= 200) {
  console.log("\n数据库有、json 没有的游戏（前 200 个，未改动）:");
  missing.slice(0, 200).forEach((n) => console.log("  -", n));
}

if (apply) {
  if (!noBackup) {
    const bak = DB + ".bak";
    fs.copyFileSync(DB, bak);
    console.log("\n已备份旧库到:", bak);
  }
  fs.writeFileSync(DB, Buffer.from(db.export()));
  console.log("已写回数据库 ✅  覆盖了", overwritten, "个游戏的标签。");
} else {
  console.log("\n这是 DRY-RUN。加 --apply 才会真正覆盖并备份。");
}

db.close();
