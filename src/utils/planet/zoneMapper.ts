// 把游戏按类型归到固定分区（恐怖谷/射击场/赛车场…）。
// 分区的划分是"固定 7 类 + 关键词映射"：先看游戏的 genre 字段，再结合游戏名
// 里的关键词（中文/英文）来判断。一个游戏只进一个分区，按 ZONE_ORDER 从上到
// 下先命中先归属；都不命中就归到"未分类"。这样观感统一、好控制。

import type { Game } from "../../types/models";
import { ZONE_ORDER, type Zone, type ZoneId } from "./types";

// 每个分区对应一组关键词。游戏名或 genre 里出现任一关键词就算命中。
// 注意：关键词统一转小写比较，英文用子串匹配，中文直接子串匹配。
const ZONE_KEYWORDS: Record<ZoneId, string[]> = {
  horror: ["恐怖", "horror", "惊悚", "僵尸", "zombie", "末日", "血腥", "scary"],
  shooter: ["射击", "shooter", "fps", "枪战", "第一人称", "第三人称", "tps"],
  racing: ["赛车", "racing", "竞速", "driving", "卡丁", "拉力"],
  rpg: ["rpg", "角色扮演", "arpg", "开放世界", "open world"],
  puzzle: ["解谜", "puzzle", "益智", "休闲", "casual", "音乐", "节奏", "rhythm"],
  sports: ["体育", "sports", "足球", "篮球", "fifa", "格斗", "fighting", "拳皇"],
  other: [], // 兜底分区，不匹配任何关键词
};

/** 判断一个游戏属于哪个分区。 */
export function matchZone(game: Game): ZoneId {
  // 把所有要匹配的文本拼到一起（小写），先 genre 后名字。
  // 防御：DB 来钱的 genre 可能不是数组（脏数据/null/JSON 字符串），统一清洗为字符串数组。
  const texts: string[] = [];
  const genres = Array.isArray(game.genre) ? game.genre : [];
  for (const g of genres) {
    if (typeof g === "string") texts.push(g);
  }
  texts.push(game.name);
  for (const ln of game.localizedNames ?? []) texts.push(ln.name);
  for (const alt of game.alternateNames ?? []) texts.push(alt);
  const hay = texts.join(" ").toLowerCase();

  for (const id of ZONE_ORDER) {
    if (id === "other") continue;
    const hit = ZONE_KEYWORDS[id].some((kw) => hay.includes(kw.toLowerCase()));
    if (hit) return id;
  }
  return "other";
}

/** 把整个游戏列表按分区归好类，返回 7 个 Zone（含空区）。 */
export function mapGamesToZones(games: Game[]): Zone[] {
  const zones: Zone[] = ZONE_ORDER.map((id) => ({
    id,
    labelKey: `planet_zone_${id}`,
    games: [],
    minLat: 0,
    maxLat: 0,
  }));
  for (const g of games) {
    const z = zones.find((z) => z.id === matchZone(g))!;
    z.games.push(g);
  }
  return zones;
}
