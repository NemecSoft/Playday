// 把「游戏内容总表」 data/game-content.json 同步进数据库（App / 网站读的就是库）。
//
// 这个文件是**人工维护的正式内容源**（简介/地区/标签），本脚本负责把它落到库里。
//
// 写哪几列：
//   intro  ← item.intro
//   region ← item.region   （库里存的是 JSON 数组文本，如 ["国产"]）
//   tags   ← item.tags     （同上，如 ["3D","恐怖"]）
//   community_score ← item.score（社区评分，**人工填**；> HOT_SCORE_MIN=100 的会在卡片
//                右上角亮"人气火爆"小火苗，见 src/utils/hotBadge.ts）
//   game_level ← item.gamelevel。它不是"关卡等级"，而是**玩这个游戏需要的权限等级**：
//                1 = 黄金版、2 = 钻石版（黄金用户只能玩 1，钻石用户 1/2 都能玩；
//                见 shared/models.ts 的 Game.gameLevel 与 docs/design/user-level-detection.md）。
//                **默认就写**。曾经把它做成 --with-level 可选（理由是"gamelist 才是权威"），
//                结果库里 1276 条 game_level 全是迁移时写死的 1，直接造成线上 bug：
//                黄金版用户能启动钻石版游戏。等级数据必须跟着内容表进库，否则门禁形同虚设。
//
// 字段写入规则（避免误清空）：
//   · 键**存在**就写（哪怕写的是空值 —— 你手动清空标签就是要清空）；
//   · 键**缺失**就跳过（不动库里原值）。
//   · intro：**默认全部写入**，不管长短。曾经有过"超过 48 字就跳过"的闸门，
//     结果把人工写的长简介（如"苏丹的游戏"77 字）悄悄漏掉了 —— 那是不对的。
//     只想先把短的那批写进库时加 --short-only。
//   region/tags 容错：写成 "#休闲#生存"、数组 ["休闲","生存"] 都行。
//
// 匹配：先按 gameid ↔ games.game_id（归一化掉 - 与大小写），再退到 name（归一化）；
//       两边都匹配不上的会列出来，绝不瞎猜。
// 安全：写库前**强制备份**（权威库 + 运行时副本各一份 .bak-<时间戳>）；默认 dry-run。
//
// 用法：
//   node scripts/apply-game-content-to-db.mjs                 # dry-run，只看会改多少
//   node scripts/apply-game-content-to-db.mjs --apply         # 真写（含备份）
//   node scripts/apply-game-content-to-db.mjs --apply --short-only    # 只写 ≤48 字的简介
// （`--with-level` 已废弃：game_level 现在默认就写 —— 见文件头说明）
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
/**
 * 简介**默认全部写入**（长的人工简介也是内容，不能漏）。
 * 只有 --short-only 时才恢复旧行为：只写 ≤48 字的，把尚未重写的爬来长文案留在库里不动。
 */
const SHORT_ONLY = has("--short-only");
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
  `模式    : ${APPLY ? "APPLY（会写盘 + 备份）" : "DRY-RUN（只看会改多少）"}｜含 game_level（权限等级）${SHORT_ONLY ? `｜简介只写 ≤${INTRO_MAX} 字` : "｜简介全部写入"}`,
);
console.log(`条目    : ${items.length}\n`);

// 界面是**纯文本**渲染的（GridView 直接输出 game.intro），markdown 记号会原样显示 ——
// 例如 "**阿尔图**" 在卡片上就是带星号的两个字。这里只提示、不阻拦，你自己决定要不要去掉。
const markdownish = items.filter((it) => typeof it.intro === "string" && /\*\*|`/.test(it.intro));
if (markdownish.length) {
  console.log(`提示：${markdownish.length} 条简介里有 markdown 记号（** 或 反引号），界面会原样显示，例如：`);
  for (const it of markdownish.slice(0, 5)) console.log(`   · ${it.name}`);
  console.log("");
}

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
  // 社区评分：只在文件里填了正数时才写。0 / 空 = "没设过" → 不动库里原值 ——
  // 否则 apply 一次就会把 1276 个 NULL 全刷成 0，制造一大片毫无意义的改动。
  { key: "score", col: "community_score", kind: "num", positiveOnly: true },
  // 权限等级（1 黄金 / 2 钻石）：门禁的判据，必须跟着内容表进库（见文件头说明）
  { key: "gamelevel", col: "game_level", kind: "num" },
];

function syncDb(dbPath, { dryRun }) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  // 取列必须覆盖 FIELDS 里要用到的每一列 —— 少取一列不会报错，只会把那一列当成
  // undefined（→ 0 / ""）从而"每次都判定要改"，白写一遍库（踩过：score 漏了 community_score）。
  const rows = db.exec(
    "SELECT id, game_id, name, intro, region, tags, game_level, community_score FROM games",
  )[0].values;
  const stats = { byId: 0, byName: 0, changed: {}, unchanged: 0, unmatched: [], skippedLongIntro: 0 };
  for (const f of FIELDS) stats.changed[f.key] = 0;

  const updates = [];
  for (const [id, gameId, name, intro, region, tags, level, communityScore] of rows) {
    const hit = byId.get(normId(gameId)) ?? byName.get(normName(name));
    if (!hit) {
      stats.unmatched.push(String(name));
      continue;
    }
    if (byId.has(normId(gameId))) stats.byId++;
    else stats.byName++;

    const cur = { intro, region, tags, gamelevel: level, score: communityScore };
    const next = {};
    let touched = false;
    for (const f of FIELDS) {
      if (!(f.key in hit)) continue; // 键缺失 → 不动库里原值
      // positiveOnly（目前只有 score）：没填（0 / 空 / 非数字）一律当"没设过"，不动库里原值
      if (f.positiveOnly && !(Number(hit[f.key]) > 0)) continue;
      // 只有 --short-only 才按长度过滤（默认长简介照样写进库）
      if (f.key === "intro" && SHORT_ONLY && String(hit[f.key] ?? "").trim().length > INTRO_MAX) {
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
      `  跳过：${s.skippedLongIntro} 条 >${INTRO_MAX} 字的简介（--short-only 模式）`,
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
