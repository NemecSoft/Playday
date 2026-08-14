// 一次性数据修补：把 release/data/library/library.db 里指向"工程根 data"的封面路径，
// 改成"release/data"下真实存在的封面路径。
//
// 背景：用户手动把工程根 data 目录整个移到了 release/data（打包发布用的）。
// 但数据库里 cover_image 字段存的还是旧路径 D:\AI\Code\Playnite\Playday\data\CoverImages\...
// 现在工程根 data 已经空了，这些路径全部失效。封面文件实际在 release/data/CoverImages。
// 所以把旧的"工程根 data"前缀替换成"release/data"前缀，让封面能找到真实文件。
//
// 替换规则：
//   旧前缀 D:\AI\Code\Playnite\Playday\data\CoverImages\  →  新前缀 D:\AI\Code\Playnite\Playday\release\data\CoverImages\
//   替换后验证目标文件是否存在：存在就保留新路径，不存在就置 NULL（让运行时 applyCoversToDb 自动按名匹配）。
//
// 默认 DRY-RUN，加 --apply 才真正改库（自动留 .bak 备份）。
//
// 用法：
//   node scripts/migrate-cover-to-release.mjs              # dry-run
//   node scripts/migrate-cover-to-release.mjs --apply      # 真改，留备份

import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

// 旧前缀的各种写法（windows 反斜杠 / 正斜杠）
const OLD_PREFIXES = [
  "D:\\AI\\Code\\Playnite\\Playday\\data\\CoverImages\\",
  "D:/AI/Code/Playnite/Playday/data/CoverImages/",
  "D:\\\\AI\\\\Code\\\\Playnite\\\\Playday\\\\data\\\\CoverImages\\\\",
];

const DB = path.join(process.cwd(), "release", "data", "library", "library.db");
const COVER_DIR = path.join(process.cwd(), "release", "data", "CoverImages");
const NEW_PREFIX = path.join(process.cwd(), "release", "data", "CoverImages") + "\\";

const apply = process.argv.includes("--apply");

console.log("== migrate-cover-to-release ==");
console.log("DB:      ", DB);
console.log("CoverDir:", COVER_DIR, "(exists?", fs.existsSync(COVER_DIR), ")");
console.log("模式:    ", apply ? "APPLY" : "DRY-RUN");

if (!fs.existsSync(DB) || !fs.existsSync(COVER_DIR)) {
  console.error("数据库或封面目录不存在，中止。");
  process.exit(1);
}

if (apply) {
  const bk = DB + ".bak-" + new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(DB, bk);
  console.log("[备份] ->", bk);
}

const SQL = await initSqlJs({ locateFile: (f) => path.join(process.cwd(), "node_modules", "sql.js", "dist", f) });
const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB)));
const rows = db.exec("SELECT id, name, cover_image FROM games WHERE cover_image IS NOT NULL AND cover_image != ''")[0].values;

let changed = 0, nulled = 0, untouched = 0;
const samples = [];
for (const [id, name, oldPath] of rows) {
  let matchedPrefix = null;
  for (const p of OLD_PREFIXES) {
    if (oldPath.startsWith(p)) { matchedPrefix = p; break; }
  }
  if (!matchedPrefix) { untouched++; continue; }
  const fileName = oldPath.slice(matchedPrefix.length);
  const newPath = path.join(COVER_DIR, fileName);
  if (fs.existsSync(newPath)) {
    changed++;
    if (samples.length < 5) samples.push({ name, old: oldPath, neu: newPath });
  } else {
    nulled++;
  }
}

console.log("\n[结果]");
console.log("改路径:", changed, "  置NULL:", nulled, "  不动:", untouched);
for (const s of samples) console.log("  ", s.neu, " <- ", s.old);

if (!apply) {
  console.log("\nDRY-RUN 结束，加 --apply 才真改。");
  process.exit(0);
}

console.log("\n[改库中]…");
db.run("BEGIN");
try {
  let nUpd = 0, nNull = 0;
  for (const [id, , oldPath] of rows) {
    let matchedPrefix = null;
    for (const p of OLD_PREFIXES) {
      if (oldPath.startsWith(p)) { matchedPrefix = p; break; }
    }
    if (!matchedPrefix) continue;
    const fileName = oldPath.slice(matchedPrefix.length);
    const newPath = path.join(COVER_DIR, fileName);
    if (fs.existsSync(newPath)) {
      db.run("UPDATE games SET cover_image = ? WHERE id = ?", [newPath, id]);
      nUpd++;
    } else {
      db.run("UPDATE games SET cover_image = NULL WHERE id = ?", [id]);
      nNull++;
    }
  }
  db.run("COMMIT");
  fs.writeFileSync(DB, Buffer.from(db.export()));
  console.log("[完成] 改路径:", nUpd, " 置NULL:", nNull);
} catch (e) {
  db.run("ROLLBACK");
  console.error("[失败] 回滚:", e);
  process.exit(1);
}
