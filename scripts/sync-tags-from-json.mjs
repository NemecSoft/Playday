// 统一的标签同步脚本：把外部 games_tags.json 的标签完全覆盖进【权威库】，并兜底清理 "Tag:" 残留。
//
// 背景（来源统一决策，2026-08-16 定稿，适配"反复核查修改 tag"）：
//   games_tags.json（D:/AI/games-web/）是【临时权威源】；
//   数据库 games 表的 tags 列是【根据 json 更新后】的结果；
//   侧边栏按更新后数据库里的标签统计、显示。
//   权威库路径是 <数据根>/Admin/library.db（管理端读/改这个，改完下发）。
//   客户端每次启动会把 Admin 权威库复制到运行时副本 <数据根>/library/library.db 再使用。
//   所以标签同步必须写【权威库 Admin/library.db】，而不是运行时副本。
//   本脚本是【唯一】从 json 同步标签的入口。
//
// 匹配规则（经用户确认）：
//   - 严格相等：game.name === json.name 才算命中（不做模糊/包含匹配）。
//   - 非空才覆盖：json 里某游戏 tags 非空才覆盖库内现有标签。
//   - 空则跳过保留：json 里某游戏 tags 为空数组，或 json 里根本没有该游戏
//     → 跳过不动（保留库内现有标签）。即"库里已有的不轻易被清空"。
//   - "Tag:" 前缀：视为旧自动标签残留，一律移除。
//
// 反复核查友好：
//   - 默认 DRY-RUN（只看汇总，不改库），加 --apply 才真改。
//   - 每次 --apply 前备份成【带时间戳】的 .bak（如 library.db.bak-20260816-103000），
//     不覆盖历史备份，可随时回退到任意版本（除非 --no-backup）。
//   - 输出简洁汇总：覆盖几个 / 未变几个 / 跳过几个。
//
// 用法：
//   node scripts/sync-tags-from-json.mjs                       # dry-run（只看汇总）
//   node scripts/sync-tags-from-json.mjs --apply               # 真改权威库（时间戳备份）
//   node scripts/sync-tags-from-json.mjs --apply --no-backup   # 改库不留备份
//
// 数据目录：默认 dev-data（Playday 唯一游戏数据源），可用 YUNGAME_DATA_DIR 覆盖。
// JSON 路径：默认 D:/AI/games-web/games_tags.json，可用 TAGS_JSON 覆盖。

import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";
import { adminDbPath } from "./lib/devData.mjs";

const JSON_FILE = process.env.TAGS_JSON || "D:/AI/games-web/games_tags.json";
// 权威库位置来自规则表（scripts/lib/devData.mjs 读 path-modes.json 的 dev 段，支持
// YUNGAME_DATA_DIR 覆盖）——别在这里拼目录名：硬写的老地方在数据目录挪动后会静默读到旧库。
// 权威库：管理端读/改、客户端启动时复制下发的源头。不要把目标指向运行时副本。
const DB = adminDbPath();

const apply = process.argv.includes("--apply");
const noBackup = process.argv.includes("--no-backup");

console.log("== sync-tags-from-json ==");
console.log("JSON:    ", JSON_FILE);
console.log("DB:      ", DB);
console.log("模式:    ", apply ? "APPLY（真改库）" : "DRY-RUN（只看，不改库）");

if (!fs.existsSync(JSON_FILE)) { console.error("找不到 JSON：", JSON_FILE); process.exit(1); }
if (!fs.existsSync(DB)) { console.error("找不到数据库：", DB); process.exit(1); }

// 读入外部标签，按 name -> {tags, isEmpty} 建索引
const jsonTags = JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));
if (!Array.isArray(jsonTags)) { console.error("JSON 不是数组"); process.exit(1); }
console.log("JSON 游戏数:", jsonTags.length);

// 记录该游戏是否真的出现在 json 里（用于区分"json 无此游戏" vs "json 有此游戏但 tags 空"）
const jsonGameNames = new Set();
const nameToTags = new Map();
let badEntry = 0;
for (const e of jsonTags) {
  if (!e || typeof e.name !== "string" || !Array.isArray(e.tags)) { badEntry++; continue; }
  jsonGameNames.add(e.name);
  // 去掉空串和 "Tag:" 前缀的残留，存成干净数组
  const clean = e.tags.filter((t) => String(t).trim() !== "" && !/^Tag:\s*/i.test(String(t)));
  nameToTags.set(e.name, clean);
}
console.log("有效条目:", nameToTags.size, "  跳过坏条目:", badEntry);

const SQL = await initSqlJs();
const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB)));

const rows = db.exec("SELECT id, name, tags FROM games");
let dbCount = 0;
if (rows.length > 0) dbCount = rows[0].values.length;
console.log("数据库游戏数:", dbCount);

let matched = 0;      // json 命中且 tags 非空（会考虑覆盖）
let overwritten = 0;  // 标签有变化（将覆盖）
let unchanged = 0;    // 标签已一致（无需改）
let skippedEmpty = 0; // json 里该游戏 tags 为空 → 跳过保留
let skippedMissing = 0; // json 里根本没有该游戏 → 跳过保留
let cleanedTagPrefix = 0;

if (rows.length > 0) {
  const stmt = db.prepare("UPDATE games SET tags = ? WHERE id = ?");
  for (const r of rows[0].values) {
    const id = r[0];
    const name = r[1];
    const oldTags = r[2];
    // 先清 "Tag:" 残留（作为对比基准）
    let oldArr = [];
    try { oldArr = JSON.parse(oldTags || "[]"); } catch (e) {}
    const oldArrFiltered = oldArr.filter((t) => !/^Tag:\s*/i.test(String(t).trim()));
    cleanedTagPrefix += oldArr.length - oldArrFiltered.length;

    // 情况1：json 里根本没有该游戏 → 跳过保留
    if (!jsonGameNames.has(name)) { skippedMissing++; continue; }
    const newTags = nameToTags.get(name);
    // 情况2：json 里有该游戏但 tags 为空数组 → 跳过保留（不轻易清空库内标签）
    if (newTags.length === 0) { skippedEmpty++; continue; }

    // 情况3：非空 → 覆盖
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

// json 有但数据库没有（新增候选，未改动）
let jsonOnly = 0;
for (const n of jsonGameNames) {
  if (!rows.length || !rows[0].values.some((r) => r[1] === n)) jsonOnly++;
}

console.log("\n========== 汇总 ==========");
console.log("  将覆盖（标签有变化）      :", overwritten);
console.log("  无需改（标签已一致）      :", unchanged);
console.log("  json 命中且 tags 非空     :", matched);
console.log("  跳过（json 里该游戏 tags 空）:", skippedEmpty);
console.log("  跳过（json 里没有该游戏）   :", skippedMissing);
console.log("  json 有但库没有（新增候选） :", jsonOnly);
console.log("  顺带清理的 'Tag:' 残留     :", cleanedTagPrefix, "个");

if (apply) {
  if (!noBackup) {
    // 带时间戳备份，保留历史，不覆盖之前的备份
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
    const bak = `${DB}.bak-${stamp}`;
    fs.copyFileSync(DB, bak);
    console.log("\n已备份旧库到:", bak);
  }
  fs.writeFileSync(DB, Buffer.from(db.export()));
  console.log("已写回数据库 ✅  覆盖了", overwritten, "个游戏的标签。");
} else {
  console.log("\n这是 DRY-RUN。加 --apply 才会真正覆盖并做时间戳备份。");
}

db.close();
