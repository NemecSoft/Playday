// 一次性数据修补：把 games.cover_image 里旧的 "PlayniteTauri\release\CoverImages" 路径
// 改成新工程 "<数据根>/CoverImages" 路径。
//
// 为什么要做这件事：
//   之前 migrate-from-release.mjs 迁移数据时，把 games.data 里的 cover_image 字段原样拷过来了，
//   里面的路径指向上一个工程（Rust 版）的目录。新工程的 coverImagesDir() 解析到
//   "<数据根>/CoverImages"，IPC 白名单 isAllowed() 会拒绝旧路径，导致前端拿到 null、显示占位符。
//
// 为什么不改代码（isAllowed 白名单 / paths.ts）：
//   这是历史包袱的一次性数据迁移，做一次就好。如果放宽白名单，反而把"主进程只能读数据根"的
//   安全语义破了个口子。
//
// 迁移规则（成熟方案参照：Playnite SDK 的 GameIdReindex / Steam 库文件夹迁移）：
//   1. 旧的 Release 路径：D:\AI\Code\Playnite\PlayniteTauri\release\CoverImages\<file>
//   2. 新的 数据根 路径：<YUNGAME_DATA_DIR 或 cwd/data>/CoverImages/<file>
//   3. 把整条 cover_image 字符串里的旧前缀替换成新前缀；文件名部分（basename）保持不动。
//   4. 替换后用 fs.existsSync 验证目标文件：
//        - 文件存在：保留新路径
//        - 文件不存在：把 cover_image 设为 NULL（让运行时的 applyCoversToDb() 后续按文件名自动匹配）
//   5. 任何不含旧前缀的行（如已是新路径、或新加进来的游戏）：原样保留。
//
// 默认是 DRY-RUN：只打印将影响多少行 / 多少会变更路径 / 多少会变 NULL，真正改库加 --apply。
//
// 用法：
//   node scripts/migrate-cover-paths.mjs                # dry-run
//   node scripts/migrate-cover-paths.mjs --apply        # 真改库（备份留 .bak）
//   node scripts/migrate-cover-paths.mjs --apply --no-backup  # 改库不留备份

import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

const OLD_PREFIX_WIN = "D:\\AI\\Code\\Playnite\\PlayniteTauri\\release\\CoverImages\\";
const OLD_PREFIX_FWD = "D:/AI/Code/Playnite/PlayniteTauri/release/CoverImages/";
// 历史数据里还有可能混着带末尾不同分隔符的情况，做几个常见变体的兜底
const OLD_PREFIX_VARIANTS = [
  OLD_PREFIX_WIN,
  OLD_PREFIX_FWD,
  // 偶尔出现双反斜杠或大小写错也兼容
  OLD_PREFIX_WIN.replace("\\", "\\\\"),
  "D:\\AI\\Code\\Playnite\\PlayniteTauri\\release\\CoverImages\\",
];

const DATA_DIR = process.env.YUNGAME_DATA_DIR || path.join(process.cwd(), "data");
const DB = path.join(DATA_DIR, "library", "library.db");
const COVER_DIR = path.join(DATA_DIR, "CoverImages");

const apply = process.argv.includes("--apply");
const noBackup = process.argv.includes("--no-backup");

console.log("== migrate-cover-paths ==");
console.log("DB:       ", DB);
console.log("CoverDir: ", COVER_DIR, "(exists?", fs.existsSync(COVER_DIR), ")");
console.log("模式:     ", apply ? "APPLY（真改库）" : "DRY-RUN（只看，不改库）");

if (!fs.existsSync(DB)) {
  console.error("找不到数据库：", DB);
  process.exit(1);
}
if (!fs.existsSync(COVER_DIR)) {
  console.error("找不到 CoverImages 目录：", COVER_DIR);
  process.exit(1);
}

// 备份
if (apply && !noBackup) {
  const bk = DB + ".bak-" + new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(DB, bk);
  console.log("[备份] -> ", bk);
}

const SQL = await initSqlJs({
  locateFile: (f) => path.join(process.cwd(), "node_modules", "sql.js", "dist", f),
});
const dbBytes = fs.readFileSync(DB);
const db = new SQL.Database(new Uint8Array(dbBytes));

// 把所有 cover_image 读出来
const rows = db.exec(
  "SELECT id, name, cover_image FROM games WHERE cover_image IS NOT NULL AND cover_image != ''"
)[0].values;

let totalChanged = 0; // 会改成新路径
let totalNulled = 0; // 旧路径但目标文件缺失，要置 NULL
let totalUnchanged = 0; // 没有旧前缀，无需动
const sampleChanged = [];
const sampleNulled = [];

for (const [id, name, oldPath] of rows) {
  let prefixMatched = null;
  for (const p of OLD_PREFIX_VARIANTS) {
    if (oldPath.startsWith(p)) {
      prefixMatched = p;
      break;
    }
  }
  if (!prefixMatched) {
    totalUnchanged++;
    continue;
  }
  const fileName = oldPath.slice(prefixMatched.length);
  const newPath = path.join(COVER_DIR, fileName);
  if (fs.existsSync(newPath)) {
    totalChanged++;
    if (sampleChanged.length < 5) sampleChanged.push({ id, name, old: oldPath, neu: newPath });
  } else {
    totalNulled++;
    if (sampleNulled.length < 5) sampleNulled.push({ id, name, old: oldPath });
  }
}

console.log("\n[扫描结果]");
console.log("旧路径总数:      ", totalChanged + totalNulled);
console.log("  将改成新路径:  ", totalChanged);
console.log("  将置 NULL:     ", totalNulled);
console.log("无须动:          ", totalUnchanged);
console.log("\n样本（将改路径）:");
for (const s of sampleChanged) console.log("  ", s.neu, " ← ", s.old);
console.log("样本（将置 NULL，缺失图）:");
for (const s of sampleNulled) console.log("  ", s.name, " | ", s.old);

if (!apply) {
  console.log("\nDRY-RUN 结束。要真改库请加 --apply（会自动留 .bak）。");
  process.exit(0);
}

// 真正改库
console.log("\n[开始改库] …");
db.run("BEGIN");
try {
  let nUpdated = 0, nNulled = 0;
  for (const [id, , oldPath] of rows) {
    let prefixMatched = null;
    for (const p of OLD_PREFIX_VARIANTS) {
      if (oldPath.startsWith(p)) { prefixMatched = p; break; }
    }
    if (!prefixMatched) continue;
    const fileName = oldPath.slice(prefixMatched.length);
    const newPath = path.join(COVER_DIR, fileName);
    if (fs.existsSync(newPath)) {
      // 路径里 反斜杠用 \\ 在 SQL 字符串里转义
      const esc = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "''");
      db.run("UPDATE games SET cover_image = ? WHERE id = ?", [newPath, id]);
      // SQL.js 参数化形式更稳
      nUpdated++;
    } else {
      db.run("UPDATE games SET cover_image = NULL WHERE id = ?", [id]);
      nNulled++;
    }
  }
  db.run("COMMIT");
  // 写回磁盘
  const newBytes = db.export();
  fs.writeFileSync(DB, Buffer.from(newBytes));
  console.log("[完成] UPDATE 成功:", nUpdated, "条；置 NULL:", nNulled, "条");
} catch (e) {
  db.run("ROLLBACK");
  console.error("[失败] 回滚。原因:", e);
  process.exit(1);
}
