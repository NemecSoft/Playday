// 临时检查数据库 description 字段使用情况
import fs from "fs";
import initSqlJs from "sql.js";
import { adminDbPath } from "./lib/devData.mjs";

const DB = adminDbPath();
const SQL = await initSqlJs();
const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB)));

const total = db.exec("SELECT COUNT(*) FROM games")[0].values[0][0];
const hasDesc = db.exec("SELECT COUNT(*) FROM games WHERE description IS NOT NULL AND description != ''")[0].values[0][0];
console.log("总游戏数:", total);
console.log("有 description 的游戏数:", hasDesc);

const s = db.exec("SELECT name, description FROM games WHERE description IS NOT NULL AND description != '' LIMIT 6");
if (s.length && s[0].values.length) {
  for (const x of s[0].values) {
    console.log("---", x[0], "---");
    console.log(String(x[1] || "").slice(0, 100));
  }
}
db.close();
