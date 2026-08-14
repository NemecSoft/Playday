// 探查原库 games / settings 表真实字段结构。
import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

const SRC = "D:/AI/Code/Playnite/PlayniteTauri/release/library/library.db";
const SQL = await initSqlJs({
  locateFile: (f) => path.join(process.cwd(), "node_modules", "sql.js", "dist", f),
});
const db = new SQL.Database(new Uint8Array(fs.readFileSync(SRC)));

function colsOf(tbl) {
  const r = db.exec(`PRAGMA table_info(${tbl})`);
  return r[0] ? r[0].values.map((v) => v[1] + ":" + v[2]) : [];
}
console.log("games 列:", colsOf("games").join(", "));
console.log("users 列:", colsOf("users").join(", "));
console.log("platforms 列:", colsOf("platforms").join(", "));
console.log("settings 列:", colsOf("settings").join(", "));
console.log("library_plugins 列:", colsOf("library_plugins").join(", "));

// games 第一行内容（data 列可能很大，只打印前 300 字符）
const g = db.exec("SELECT * FROM games LIMIT 1");
if (g[0]) {
  const names = g[0].columns;
  const row = g[0].values[0];
  names.forEach((n, i) => {
    let v = String(row[i]);
    if (v.length > 300) v = v.slice(0, 300) + "...";
    console.log(`  games.${n} =`, v);
  });
}

// settings 样本
const s = db.exec("SELECT * FROM settings LIMIT 4");
if (s[0]) {
  console.log("settings 行数:", s[0].values.length);
  s[0].columns.forEach((n, i) => console.log(`  settings.${n} 示例:`, String(s[0].values[0][i]).slice(0, 120)));
}
