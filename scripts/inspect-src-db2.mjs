import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

const SRC = "D:/AI/Code/Playnite/PlayniteTauri/release/library/library.db";
const SQL = await initSqlJs({ locateFile: (f) => path.join(process.cwd(), "node_modules", "sql.js", "dist", f) });
const db = new SQL.Database(new Uint8Array(fs.readFileSync(SRC)));

// settings 全部 key
const s = db.exec("SELECT key, substr(value,1,80) FROM settings");
console.log("settings 所有 key:");
for (const r of s[0].values) console.log("  ", r[0], "=>", String(r[1]));

// 检查 data 里是否含 gameLevel / game_library / lastSessionSeconds
const g = db.exec("SELECT data FROM games LIMIT 1");
const d = JSON.parse(g[0].values[0][0]);
console.log("\ngame(data) 顶层键:", Object.keys(d).join(", "));
console.log("含 gameLevel:", "gameLevel" in d, "| game_library:", "gameLibrary" in d, "| lastSessionSeconds:", "lastSessionSeconds" in d);

// users 样本
const u = db.exec("SELECT id, account, name, level, kind, ip_address, substr(deleted_at,1,10) FROM users LIMIT 5");
console.log("\nusers 样本:");
for (const r of u[0].values) console.log("  ", r.join(" | "));

// users 里 kind 分布
const kd = db.exec("SELECT kind, COUNT(*) FROM users GROUP BY kind");
console.log("\nusers kind 分布:", kd[0].values.map((r) => r.join("=")).join(", "));
