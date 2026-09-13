// 强制给所有游戏填简介（测试数据）脚本。
//
// 背景（2026-08-17）：瀑布流视图需要卡片简介，但数据库 description 全空，
// 且详情页 HTML 只有 3 个游戏有简介。用户要求"先强制填数据测试"——
// 给所有游戏填一个占位简介：即【游戏名重复 3 次的连续字符串】，
// 例如游戏"祖玛豪华版" → "祖玛豪华版祖玛豪华版祖玛豪华版"。
//
// 规则：
//   - 遍历权威库（<数据根>/Admin/library.db）所有游戏，强制覆盖 description。
//   - 重复游戏名（同名多个条目）的每个条目都填（都设为 游戏名重复3次）。
//   - 默认 DRY-RUN，加 --apply 才真写库并做时间戳备份。
//
// 用法：
//   node scripts/force-fill-descriptions.mjs                       # dry-run
//   node scripts/force-fill-descriptions.mjs --apply               # 真写权威库（时间戳备份）
//   node scripts/force-fill-descriptions.mjs --apply --no-backup   # 改库不留备份
//
// 数据目录：默认 dev-data，可用 YUNGAME_DATA_DIR 覆盖。

import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";
import { adminDbPath } from "./lib/devData.mjs";

// 权威库位置来自规则表（scripts/lib/devData.mjs，读 path-modes.json 的 dev 段）。
const DB = adminDbPath();

const apply = process.argv.includes("--apply");
const noBackup = process.argv.includes("--no-backup");

console.log("== force-fill-descriptions ==");
console.log("DB:      ", DB);
console.log("模式:    ", apply ? "APPLY（真改库）" : "DRY-RUN（只看，不改库）");

if (!fs.existsSync(DB)) { console.error("找不到数据库：", DB); process.exit(1); }

const SQL = await initSqlJs();
const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB)));

const rows = db.exec("SELECT id, name, description FROM games");
let dbCount = 0;
if (rows.length > 0) dbCount = rows[0].values.length;
console.log("数据库游戏数:", dbCount);

let willFill = 0;       // 将写入（简介有变化）
let unchanged = 0;      // 已是 游戏名x3，无需改
let hasDesc = 0;        // 当前已有简介（非空）

if (rows.length > 0) {
  const stmt = db.prepare("UPDATE games SET description = ? WHERE id = ?");
  for (const r of rows[0].values) {
    const id = r[0];
    const name = r[1];
    const oldDesc = r[2];
    // 占位简介 = 游戏名重复 3 次的连续字符串
    const placeholder = name + name + name;
    if (oldDesc && oldDesc.trim().length > 0) hasDesc++;
    if (oldDesc === placeholder) { unchanged++; continue; }
    willFill++;
    if (apply) stmt.run([placeholder, id]);
  }
  if (apply) stmt.free();
}

console.log("\n========== 汇总 ==========");
console.log("  将写入占位简介（游戏名x3）:", willFill);
console.log("  已是目标简介（无需改）    :", unchanged);
console.log("  当前已有非空简介（将被覆盖）:", hasDesc);

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
