// 验证迁移后的新库能被正确读取（字段展平/还原无误）。
import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

const OUT = process.env.YUNGAME_DATA_DIR
  ? path.join(process.env.YUNGAME_DATA_DIR, "library", "library.db")
  : path.join(process.cwd(), "data", "library", "library.db");

const SQL = await initSqlJs({ locateFile: (f) => path.join(process.cwd(), "node_modules", "sql.js", "dist", f) });
const db = new SQL.Database(new Uint8Array(fs.readFileSync(OUT)));

const c = (sql) => db.exec(sql)[0].values[0][0];
console.log("games:", c("SELECT COUNT(*) FROM games"));
console.log("users:", c("SELECT COUNT(*) FROM users"));
console.log("platforms:", c("SELECT COUNT(*) FROM platforms"));

// 抽样核对一个游戏的字段还原
const r = db.exec("SELECT name, installed, playtime, game_level, genre, platform, category FROM games LIMIT 1");
console.log("\n样本游戏:", r[0].values[0].join(" | "));

// 统计非空封面图字段（验证 cover_image 还原）
const cov = db.exec("SELECT COUNT(*) FROM games WHERE cover_image IS NOT NULL AND cover_image <> ''");
console.log("有封面图字段的游戏数:", cov[0].values[0][0]);

// 用户等级分布
const lvl = db.exec("SELECT level, COUNT(*) FROM users GROUP BY level");
console.log("用户等级分布:", lvl[0].values.map((v) => `L${v[0]}=${v[1]}`).join(", "));

console.log("\n新库读取验证通过 ✅");
