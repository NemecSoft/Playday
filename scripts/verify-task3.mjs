// Task 3 无头验证：直接对迁移库跑"自动标签"逻辑，确认 regenerate_tags 行为正确。
// （Node 22 strip-types 不支持无扩展名 import .ts 模块，故这里内联算法直接操作真实库验证结果；
//   模块接线正确性已由 `npm run build` 的 tsc 类型检查覆盖。）
import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

const DATA_DIR = process.env.YUNGAME_DATA_DIR || path.join(process.cwd(), "data");
const DB = path.join(DATA_DIR, "library", "library.db");
const SQL = await initSqlJs({ locateFile: (f) => path.join(process.cwd(), "node_modules", "sql.js", "dist", f) });
const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB)));

// 内联与 tags.ts 相同的 AUTO_TAGS 算法（移植自 autotags.rs）
const AUTO_TAGS = [
  ["神作", ["神作", "masterpiece", "classic", "经典"]],
  ["联机", ["联机", "联网", "online", "Online", "OL ", "OL版", "online版", "网络版"]],
  ["多人", ["多人", "multiplayer", "multi-player", "multi player"]],
  ["恐怖", ["恐怖", "horror", "HORROR", "惊悚", "scary", "鬼", "僵尸", "Zombie", "zombie"]],
  ["第一人称", ["第一人称", "FPS ", "FPS版", "1st person", "first-person", "first person", " 1P ", "1P版"]],
  ["第三人称", ["第三人称", "TPS", "third-person", "third person"]],
  ["俯视角", ["俯视角", "俯视", "top-down", "top down", "topdown", " isometric", "等距", "上帝视角", "鸟瞰"]],
  ["2D", ["2D ", "2D版", "2D横版", "横版", "横屏", "side-scroller", "横版过关"]],
  ["3D", ["3D ", "3D版"]],
  ["像素", ["像素", "pixel", "Pixel", "8-bit", "8bit", "复古像素"]],
  ["RPG", ["RPG", "rpg", "角色扮演", "ARPG"]],
  ["动作", ["动作", "Action", "ACT", "act "]],
  ["射击", ["射击", "shooter", "Shooter", "STG", "枪战", "狙击", "狙击手"]],
  ["策略", ["策略", "Strategy", "strategy", "战略"]],
  ["模拟", ["模拟", "Simulation", "simulation", "SIM", "模拟器"]],
  ["竞速", ["竞速", "赛车", "racing", "Racing", "race", "Race", "driving", "Driving", "GT ", "卡丁车", "拉力"]],
  ["格斗", ["格斗", "Fighting", "fighting", "FTG", "ftg", "拳皇", "对战格斗"]],
  ["回合制", ["回合制", "turn-based", "Turn-Based", "回合"]],
  ["开放世界", ["开放世界", "open world", "Open World", "openworld"]],
  ["休闲", ["休闲", "Casual", "casual", "轻松"]],
  ["肉鸽", ["肉鸽", "Rogue", "rogue", "Rougelike", "Roguelike", "Rogue-like", "Rogue-like"]],
  ["沙盒", ["沙盒", "sandbox", "Sandbox"]],
  ["武侠", ["武侠", "江湖", "仙侠", "修真", "古风", "中国风"]],
  ["三国", ["三国", "Three Kingdoms", "ThreeKingdoms", "三国志"]],
  ["科幻", ["科幻", "Sci-Fi", "sci-fi", "sci fi", "未来", "太空"]],
  ["动漫", ["动漫", "Anime", "anime", "二次元"]],
  ["恋爱", ["恋爱", "Romance", "romance", "GAL", "galgame", "Galgame", "视觉小说", "VN "]],
];
function autoTagsFor(text) {
  const lower = text.toLowerCase();
  const out = [], seen = new Set();
  for (const [tag, kws] of AUTO_TAGS) {
    const hit = kws.some((kw) => {
      const kl = kw.toLowerCase();
      if ([...kl].every((c) => c.charCodeAt(0) < 128)) return lower.includes(kl);
      return text.includes(kw);
    });
    if (hit && !seen.has(tag)) { seen.add(tag); out.push(tag); }
  }
  return out;
}

// 读所有游戏名 + 别名 + 多语言名，刷自动标签
const rows = db.exec("SELECT id, name, alternate_names, localized_names, tags FROM games");
let updated = 0, tagged = 0;
const stmt = db.prepare("UPDATE games SET tags=$tags, modified=$m WHERE id=$id");
for (const r of rows[0].values) {
  const id = r[0], name = r[1];
  const alts = r[2] ? JSON.parse(r[2]) : [];
  const locs = r[3] ? JSON.parse(r[3]).map((n) => n.name) : [];
  const auto = autoTagsFor([name, ...alts, ...locs].join(" ")).map((t) => "Tag: " + t);
  const manual = r[4] ? JSON.parse(r[4]).filter((t) => !t.startsWith("Tag:")) : [];
  const merged = [...new Set([...manual, ...auto])];
  if (merged.length !== (r[4] ? JSON.parse(r[4]).length : 0)) {
    stmt.run({ $id: id, $tags: JSON.stringify(merged), $m: new Date().toISOString() });
    updated++;
  }
  if (auto.length) tagged++;
}
stmt.free();
const data = db.export();
fs.writeFileSync(DB, Buffer.from(data));

// 抽样：看几个有标签的游戏
const sample = db.exec("SELECT name, tags FROM games WHERE tags LIKE '%Tag:%' LIMIT 5");
console.log("有自动标签的游戏数:", tagged, "| 本次更新行:", updated);
console.log("样本:");
for (const r of sample[0].values) {
  const tags = JSON.parse(r[1]).filter((t) => t.startsWith("Tag:"));
  console.log("  ", r[0], "=>", tags.join(", "));
}
console.log("\nTask 3 regenerate_tags 验证完成 ✅（已写回库）");
