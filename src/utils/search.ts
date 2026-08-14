// 搜索辅助。基础函数（拼音、名称变体、显示名、匹配）统一复用 shared/search.ts，
// 这里只保留客户端特有的"完整搜索串 + 缓存"逻辑。

import { pinyin } from "pinyin-pro";
import type { Game } from "../types/models";
import {
  pinyinInitials,
  gameNameVariants,
  displayName,
  matchSearch,
} from "../../shared/search";

// 重新导出共享基础函数，让现有调用方（selectors、测试）照旧 import。
export { pinyinInitials, gameNameVariants, displayName, matchSearch };

const normalize = (s: string) =>
  s.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

/**
 * 一段归一化的"完整搜索串"：包含所有名称变体 + 每个中文变体的拼音首字母 + 全拼
 * + 元数据（类型、开发商、发行商、标签、平台、系列）。
 */
export function gameSearchHaystack(game: Game): string {
  const parts: string[] = [];
  const variants = gameNameVariants(game);

  for (const v of variants) {
    parts.push(v);
    const initials = pinyinInitials(v);
    if (initials && initials !== normalize(v)) parts.push(initials);
    const full = pinyin(v, { toneType: "none", type: "array", nonZh: "consecutive" })
      .join("")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (full && full !== normalize(v) && full !== initials) parts.push(full);
  }

  parts.push(...game.genre, ...game.developer, ...game.publisher, ...game.tags);
  parts.push(...game.platform, ...game.series);

  return normalize(parts.join(" "));
}

/** 记忆化搜索串缓存，避免每次按键都重算拼音。 */
const cache = new Map<string, string>();

export function getSearchHaystack(game: Game): string {
  const cached = cache.get(game.id);
  if (cached) return cached;
  const hay = gameSearchHaystack(game);
  if (cache.size > 2000) cache.clear();
  cache.set(game.id, hay);
  return hay;
}
