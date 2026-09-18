// 一次性数据迁移：把 config.json 里 settings.gameLibraries（历史遗留）灌进数据库
// game_libraries 表。之后游戏库只从数据库读（settings.ts 的 getLibraries 优先数据库）。
// 已在数据库里的跳过（以数据库为准，不重复也不覆盖）。
//
// 用法：node scripts/migrate-libs-to-db.mjs   （dry-run 打印将迁移多少条）
//       node scripts/migrate-libs-to-db.mjs --apply  （真写库）
import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

const DATA_DIR = process.env.YUNGAME_DATA_DIR || path.join(process.cwd(), "release", "data");
const DB = path.join(DATA_DIR, "library", "library.db");
const CONFIG = path.join(DATA_DIR, "config.json");
const apply = process.argv.includes("--apply");

console.log("== migrate-libs-to-db ==");
console.log("DB:   ", DB);
console.log("CONFIG", CONFIG);
console.log("模式: ", apply ? "执行" : "预览");

const SQL = await initSqlJs({ locateFile: (f) => path.join(process.cwd(), "node_modules", "sql.js", "dist", f) });
const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB)));

// 读 config.json 的 gameLibraries
const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf-8"));
const libs = cfg?.settings?.gameLibraries || [];
console.log("config.json 里游戏库数:", libs.length);

// 数据库里已有
const existing = db.exec("SELECT id FROM game_libraries")[0]?.values ?? [];
const existingIds = new Set(existing.map((r) => String(r[0])));
console.log("数据库已有游戏库数:", existingIds.size);

let toInsert = 0;
const willInsert = [];
for (const lib of libs) {
  if (!lib || !lib.id) continue;
  if (existingIds.has(String(lib.id))) continue;
  willInsert.push(lib);
  toInsert++;
}
console.log("将新插入:", toInsert);
willInsert.forEach((l) => console.log("   ", l.id, "|", l.name, "|", l.path));

if (!apply) {
  console.log("\nDRY-RUN 结束。加 --apply 才写库。");
  process.exit(0);
}

if (apply && toInsert > 0) {
  const stmt = db.prepare("INSERT INTO game_libraries (id, name, path) VALUES (?, ?, ?)");
  for (const lib of willInsert) {
    stmt.run([lib.id, lib.name ?? "", lib.path ?? ""]);
  }
  stmt.free();
  const bytes = db.export();
  fs.writeFileSync(DB, Buffer.from(bytes));
  console.log("[完成] 已写入", toInsert, "条到数据库 game_libraries 表。");
} else {
  console.log("[完成] 无新增（数据库已有全部或库为空）。");
}
