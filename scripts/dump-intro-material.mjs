// 导出"写简介用的素材"：游戏名 + 详情页标签 + 爬来的介绍。
//
// 为什么要这一步：最终要的简介是**玩家视角的极简一句话**（"当大学校长，建校园，管师生，开各种奇葩专业，模拟经营。"），
// 爬来的 marketing 文案直接当简介不合格（太长、不在玩家视角、还常重复游戏名）。
// 所以按批导出素材 → 人/AI 据此重写 → 写成 data/batches/*.json → 再由
// merge-authored-intros.mjs 合并进 data/library/games.json（整库 JSON 的简介列）。
// 合并完还要 npm run db:import（或双击 libraryjson-importto-librarydb.bat）才落到库里。
//
// 用法：
//   node scripts/dump-intro-material.mjs                      # 前 40 条
//   node scripts/dump-intro-material.mjs --offset 40 --limit 60
import fs from "fs";
import path from "path";
import { LIBRARY_JSON_DIR } from "./lib/libraryJson.mjs";

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const TABLE = argOf("--table", path.join(process.cwd(), LIBRARY_JSON_DIR, "games.json"));
const DETAILS = argOf("--details", "D:/Addons");
const OFFSET = Number(argOf("--offset", "0")) || 0;
const LIMIT = Number(argOf("--limit", "40")) || 40;
// --brief：只输出 名字 + 标签（不输出爬来的长介绍）。批量写的时候用这个，
// 一屏能看几百个游戏，只有遇到"看名字看不出来"的才回头看它的 desc。
const BRIEF = argv.includes("--brief");

const rows = JSON.parse(fs.readFileSync(TABLE, "utf-8"));
const slice = rows.slice(OFFSET, OFFSET + LIMIT);
console.log(`素材 ${OFFSET + 1}..${OFFSET + slice.length} / 共 ${rows.length} 条\n`);

for (const r of slice) {
  const f = path.join(DETAILS, r.name, "info.json");
  let tags = [];
  let desc = "";
  let origin = "";
  try {
    const j = JSON.parse(fs.readFileSync(f, "utf-8"));
    tags = j.local_tags || j.tags || [];
    desc = j.description || "";
    origin = j.origin_name || "";
  } catch {
    /* 没有 info.json 或不是 JSON：留空，靠游戏名判断 */
  }
  console.log(`### ${r.name}${origin ? `  (${origin})` : ""}   [L${r.gamelevel}]`);
  // 只取前 8 个标签：够判断"是什么类型/怎么玩"，又不会让一屏素材重到读不动
  if (tags.length) console.log(`tags: ${tags.slice(0, 8).join("、")}`);
  if (!BRIEF) console.log(`desc: ${String(desc).replace(/\s+/g, " ").slice(0, 220) || "(无)"}`);
  console.log("");
}
