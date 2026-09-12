// 把「游戏内容总表」 data/game-content.json 同步进数据库（App / 网站读的就是库）。
//
// 这个文件是**人工维护的正式内容源**（简介/地区/标签），本脚本负责把它落到库里。
//
// 写哪几列：
//   intro  ← item.intro
//   region ← item.region   （库里存的是 JSON 数组文本，如 ["国产"]）
//   tags   ← item.tags     （同上，如 ["3D","恐怖"]）
//   game_level ← item.gamelevel（**默认不写**：关卡等级以 YunGame_Gamelist.json 为准；
//                确实想用内容表覆盖时加 --with-level）
//
// 字段写入规则（避免误清空）：
//   · 键**存在**就写（哪怕写的是空值 —— 你手动清空标签就是要清空）；
//   · 键**缺失**就跳过（不动库里原值）。
//   region/tags 容错：写成数组 ["国产"] 或逗号分隔字符串 "国产,日本" 都行。
//
// 匹配：先按 gameid ↔ games.game_id（归一化掉 - 与大小写），再退到 name（归一化）；
//       两边都匹配不上的会列出来，绝不瞎猜。
// 安全：写库前**强制备份**（权威库 + 运行时副本各一份 .bak-<时间戳>）；默认 dry-run。
//
// 用法：
//   node scripts/apply-game-content-to-db.mjs                 # dry-run，只看会改多少
//   node scripts/apply-game-content-to-db.mjs --apply         # 真写（含备份）
//   node scripts/apply-game-content-to-db.mjs --apply --with-level   # 连 game_level 一起写
import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const root = process.cwd();
const CONTENT = argOf("--in", path.join(root, "data/game-content.json"));
const ADMIN = argOf("--admin", path.join(root, "release/data/Admin/library.db"));
const RUNTIME = argOf("--runtime", path.join(root, "release/data/library/library.db"));
const APPLY = has("--apply");
const WITH_LEVEL = has("--with-level");
/**
 * 默认只同步"已重写过的简介"（≤48 字，与 merge-authored-intros 的风格校验 6..48 一致），
 * 超长的视为**尚未重写的爬来文案**，跳过不写进库 —— 否则一条 --apply 就会把
 * 844 条营销文案推上界面（用户明确说过那种不行）。要连它们一起写：--all-intros。
 */
const ALL_INTROS = has("--all-intros");
const INTRO_MAX = 48;

const normId = (s) => String(s ?? "").trim().toLowerCase().replace(/-/g, "");
const normName = (s) =>
  String(s ?? "")
    .replace(/[\u200b-\u200f\ufeff\u00a0]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * 地区 / 标签的文本 → 字符串数组。
 *
 * 约定的手写格式是 **`#` 分隔**（写起来最省事）：
 *     "#休闲#生存#卡通#烧脑"  →  ["休闲","生存","卡通","烧脑"]
 * 容错：开头/结尾/连续多写的 `#` 只会产生空段，自动丢弃（"#休闲##生存#" 同样得到两个标签）。
 *
 * 为什么"有 `#` 就只按 `#` 拆"：标签本身可能含逗号/斜杠（如 `即时战略/塔防`），
 * 混着拆会把它切成两个错标签。只有在**没有 `#`** 时才退化为按 `, ， 、 /` 拆，
 * 照顾手写 "休闲,生存" 的人。数组形式照样接受（历史数据/程序生成）。
 */
const asArr = (v) => {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return [];
  const parts = s.includes("#") ? s.split("#") : s.split(/[,，、/]/);
  return parts.map((x) => x.trim()).filter(Boolean);
};
/** 库里这几列存 JSON 数组文本（空值就是 "[]"）。 */
const arrText = (v) => JSON.stringify(asArr(v));

const items = JSON.parse(fs.readFileSync(CONTENT, "utf-8"));
console.log("== 同步 游戏内容总表 → 数据库 ==");
console.log("内容文件:", path.relative(root, CONTENT));
console.log("权威库  :", path.relative(root, ADMIN));
console.log("运行时库:", path.relative(root, RUNTIME));
console.log(
  `模式    : ${APPLY ? "APPLY（会写盘 + 备份）" : "DRY-RUN（只看会改多少）"}${WITH_LEVEL ? "｜含 game_level" : "｜不写 game_level"}${ALL_INTROS ? "｜简介不过滤长度" : `｜简介只写 ≤${INTRO_MAX} 字（未重写的长文案跳过）`}`,
);
console.log(`条目    : ${items.length}\n`);

const byId = new Map();
const byName = new Map();
for (const it of items) {
  const name = String(it.name ?? "").trim();
  if (!name) continue;
  byName.set(normName(name), it);
  if (it.gameid) byId.set(normId(it.gameid), it);
}

const SQL = await initSqlJs({
  locateFile: (f) => path.join(root, "node_modules", "sql.js", "dist", f),
});

const FIELDS = [
  { key: "intro", col: "intro", kind: "text" },
  { key: "region", col: "region", kind: "array" },
  { key: "tags", col: "tags", kind: "array" },
];
if (WITH_LEVEL) FIELDS.push({ key: "gamelevel", col: "game_level", kind: "num" });

function syncDb(dbPath, { dryRun }) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  const rows = db.exec("SELECT id, game_id, name, intro, region, tags, game_level FROM games")[0].values;
  const stats = { byId: 0, byName: 0, changed: {}, unchanged: 0, unmatched: [], skippedLongIntro: 0 };
  for (const f of FIELDS) stats.changed[f.key] = 0;

  const updates = [];
  for (const [id, gameId, name, intro, region, tags, level] of rows) {
    const hit = byId.get(normId(gameId)) ?? byName.get(normName(name));
    if (!hit) {
      stats.unmatched.push(String(name));
      continue;
    }
    if (byId.has(normId(gameId))) stats.byId++;
    else stats.byName++;

    const cur = { intro, region, tags, gamelevel: level };
    const next = {};
    let touched = false;
    for (const f of FIELDS) {
      if (!(f.key in hit)) continue; // 键缺失 → 不动库里原值
      // 长简介 = 尚未重写的爬来文案 → 默认不写进库（见上方 INTRO_MAX 说明）
      if (f.key === "intro" && !ALL_INTROS && String(hit[f.key] ?? "").trim().length > INTRO_MAX) {
        stats.skippedLongIntro++;
        continue;
      }
      const want =
        f.kind === "array"
          ? arrText(hit[f.key])
          : f.kind === "num"
            ? Number(hit[f.key]) || 0
            : String(hit[f.key] ?? "").replace(/\s+/g, " ").trim();
      const now = f.kind === "array" ? String(cur[f.key] ?? "[]") : f.kind === "num" ? Number(cur[f.key]) || 0 : String(cur[f.key] ?? "");
      if (want === now) continue;
      next[f.col] = want;
      stats.changed[f.key]++;
      touched = true;
    }
    if (!touched) {
      stats.unchanged++;
      continue;
    }
    updates.push([next, id]);
  }

  if (!dryRun && updates.length) {
    const bk = `${dbPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(dbPath, bk);
    console.log(`  [备份] ${path.relative(root, bk)}`);
    for (const [next, id] of updates) {
      const cols = Object.keys(next);
      const stmt = db.prepare(
        `UPDATE games SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
      );
      stmt.run([...cols.map((c) => next[c]), id]);
      stmt.free();
    }
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
  }

  db.close();
  return stats;
}

for (const dbPath of [ADMIN, RUNTIME]) {
  if (!fs.existsSync(dbPath)) {
    console.log(`(跳过，文件不存在) ${path.relative(root, dbPath)}\n`);
    continue;
  }
  console.log(`--- ${path.relative(root, dbPath)} ---`);
  const s = syncDb(dbPath, { dryRun: !APPLY });
  console.log(`  匹配：按 gameid ${s.byId} 条 / 按名字 ${s.byName} 条；已一致无需改 ${s.unchanged} 条`);
  console.log(
    `  将写入：` + FIELDS.map((f) => `${f.key} ${s.changed[f.key]}`).join(" / "),
  );
  if (s.skippedLongIntro) {
    console.log(
      `  跳过：${s.skippedLongIntro} 条简介还是长文案（>${INTRO_MAX} 字，视为未重写）—— 确认要写加 --all-intros`,
    );
  }
  console.log(`  库里有、内容表没有的 ${s.unmatched.length} 条`);
  if (s.unmatched.length) {
    console.log(`    ${s.unmatched.slice(0, 6).join("、")}${s.unmatched.length > 6 ? " …" : ""}`);
  }
  console.log("");
}

console.log(
  APPLY
    ? "✓ 已写入。App 重启后（启动时从权威库复制运行时副本）即可在界面看到。"
    : "（DRY-RUN 结束。确认无误后加 --apply 真写。）",
);
