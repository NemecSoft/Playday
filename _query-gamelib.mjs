import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'release/data/Admin/library.db');
const SQL = await initSqlJs({ locateFile: (f) => join(__dirname, 'node_modules/sql.js/dist/', f) });
const db = new SQL.Database(readFileSync(dbPath));

// 统计 install_directory 里含 "\Gamelibrary" 或 "Gamelibrary" 的游戏数量
const q = db.exec("SELECT count(*) as c FROM games WHERE install_directory LIKE '%Gamelibrary%'");
console.log('含 Gamelibrary 的 install_directory 数量:', q[0]?.values[0]?.[0]);

// 列出几个例子
const ex = db.exec("SELECT id, name, install_directory FROM games WHERE install_directory LIKE '%Gamelibrary%' LIMIT 15");
if (ex.length) {
  console.log('columns:', ex[0].columns);
  ex[0].values.forEach(r => console.log(JSON.stringify(r)));
}

// 统计含 { 库占位符 的 install_directory 数量
const q2 = db.exec("SELECT count(*) as c FROM games WHERE install_directory LIKE '{%'");
console.log('\n含 {库占位符} 的 install_directory 数量:', q2[0]?.values[0]?.[0]);
