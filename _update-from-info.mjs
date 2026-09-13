// 根据 D:/AI/games-web/games_info.json 更新权威库 Admin/library.db：
//   - origin_name    <- json.origin_name
//   - description    <- json.intro
//   - save_paths     <- json.savepaths (JSON 数组，元素 SavePath {id,path})
// 匹配键：json.name == db.games.name（中文名）。
// 用法：
//   node _update-from-info.mjs          # dry-run 预览汇总
//   node _update-from-info.mjs --apply  # 真改（带时间戳备份）
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { adminDbPath, runtimeDbPath } from './scripts/lib/devData.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INFO = 'D:/AI/games-web/games_info.json';
const ADMIN = adminDbPath();
const RUNTIME = runtimeDbPath();
const APPLY = process.argv.includes('--apply');

const SQL = await initSqlJs({ locateFile: (f) => join(__dirname, 'node_modules/sql.js/dist/', f) });
const info = JSON.parse(readFileSync(INFO, 'utf8'));

const db = new SQL.Database(readFileSync(ADMIN));
// 列存在性检查
const cols = db.exec('PRAGMA table_info(games)')[0].values.map(r => r[1]);
console.log('Admin 列: origin_name=', cols.includes('origin_name'),
  '| description=', cols.includes('description'),
  '| save_paths=', cols.includes('save_paths'));

// name -> id 映射（去重，取第一条）
const nameToId = new Map();
for (const [id, name] of db.exec('SELECT id, name FROM games')[0].values) {
  if (!nameToId.has(name)) nameToId.set(name, id);
}

// 生成稳定的存档路径 id：游戏id前8位 + 索引
function savePathId(gameId, i) {
  return `sp-${gameId.slice(0, 8)}-${i + 1}`;
}

let matched = 0;
const stats = { origin: 0, intro: 0, savepaths: 0 };
const samples = [];

if (APPLY) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  copyFileSync(ADMIN, `${ADMIN}.bak-${ts}`);
  console.log('已备份权威库 ->', `${ADMIN}.bak-${ts}`);
}

for (const g of info) {
  const id = nameToId.get(g.name);
  if (!id) continue;
  matched++;
  const sets = [];
  const params = [];

  if (g.origin_name) {
    sets.push('origin_name = ?'); params.push(g.origin_name); stats.origin++;
  }
  if (g.intro) {
    sets.push('description = ?'); params.push(g.intro); stats.intro++;
  }
  if (g.savepaths && g.savepaths.length) {
    const sp = g.savepaths.map((p, i) => ({ id: savePathId(id, i), path: p }));
    sets.push('save_paths = ?'); params.push(JSON.stringify(sp)); stats.savepaths++;
  }

  if (!sets.length) continue;
  params.push(new Date().toISOString());
  const sql = `UPDATE games SET ${sets.join(', ')}, modified = ? WHERE id = ?`;
  params.push(id);
  db.run(sql, params);
}

if (APPLY) {
  writeFileSync(ADMIN, Buffer.from(db.export()));
  copyFileSync(ADMIN, RUNTIME); // 同步运行时副本
  console.log(`✅ 已更新 ${matched} 条，并同步运行时副本`);
} else {
  console.log(`(dry-run) 将更新 ${matched} 条`);
}

console.log('统计: origin_name=', stats.origin, '| intro=', stats.intro, '| savepaths=', stats.savepaths);
