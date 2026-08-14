// 无头环境下验证 sql.js（SQLite wasm）在 Node 22 下能正常：
//  1) 初始化 wasm
//  2) 建表 + 插入一条游戏
//  3) 读出并校验字段
//  4) export 成二进制写文件（模拟持久化）
// 这只是验收"选型可行性"的探针，真正逻辑在 electron/core/db.ts（已被 tsc 检查）。
import fs from "fs";
import os from "os";
import path from "path";
import initSqlJs from "sql.js";

const tmp = path.join(os.tmpdir(), "yungame-verify");
fs.mkdirSync(tmp, { recursive: true });
const dbFile = path.join(tmp, "test.db");

const SQL = await initSqlJs({
  locateFile: (f) => path.join(process.cwd(), "node_modules", "sql.js", "dist", f),
});

const db = new SQL.Database();
db.run(`CREATE TABLE games (id TEXT PRIMARY KEY, name TEXT, game_level INTEGER, tags TEXT);`);

const game = { id: "g1", name: "测试游戏", game_level: 2, tags: JSON.stringify(["rpg", "中文"]) };
db.run(
  "INSERT INTO games (id, name, game_level, tags) VALUES ($id, $name, $level, $tags) " +
    "ON CONFLICT(id) DO UPDATE SET name=$name, game_level=$level, tags=$tags",
  { $id: game.id, $name: game.name, $level: game.game_level, $tags: game.tags }
);

// 读回
const stmt = db.prepare("SELECT * FROM games WHERE id = $id");
stmt.bind({ $id: "g1" });
let row = null;
while (stmt.step()) row = stmt.getAsObject();
stmt.free();

// 持久化
const data = db.export();
fs.writeFileSync(dbFile, Buffer.from(data));

// 重新从文件打开验证
const buf = fs.readFileSync(dbFile);
const db2 = new SQL.Database(new Uint8Array(buf));
const stmt2 = db2.prepare("SELECT count(*) c FROM games");
let count = 0;
while (stmt2.step()) count = stmt2.getAsObject().c;
stmt2.free();

const ok = row && row.name === "测试游戏" && row.game_level === 2 && count === 1 && fs.existsSync(dbFile);
console.log("验证结果:", ok ? "通过 ✅" : "失败 ❌");
console.log("  读回:", JSON.stringify(row));
console.log("  重新打开后行数:", count);
console.log("  落盘文件:", dbFile, fs.statSync(dbFile).size, "bytes");
process.exit(ok ? 0 : 1);
