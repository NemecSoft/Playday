// 共享搜索逻辑：客户端和管理端都用这一份，避免复制两份、改一处忘另一处。
// 用"结构化类型"（只要对象有这些字段就行），不依赖客户端/管理端各自的 Game 类型，
// 所以任何满足形状的对象都能传进来。

import { pinyin } from "pinyin-pro";

/**
 * 搜索只依赖这几个字段。客户端 Game 和管理端 Game 都有这些字段，
 * 所以都能直接传进来，无需强类型耦合。
 */
export interface SearchableGame {
  name: string;
  sortName?: string | null;
  localizedNames?: { language: string; name: string }[] | null;
  alternateNames?: string[] | null;
}

const normalize = (s: string) =>
  s.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

/** 中文转拼音首字母（如"星际争霸" -> "xjzb"）。非中文字符原样保留（小写）。 */
export function pinyinInitials(text: string): string {
  if (!text) return "";
  return pinyin(text, {
    pattern: "first",
    toneType: "none",
    type: "array",
    nonZh: "consecutive",
  })
    .join("")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** 收集所有名称变体（主名 + sortName + 本地化名 + 别名），去重、去空。 */
export function gameNameVariants(game: SearchableGame): string[] {
  const variants: string[] = [game.name];
  if (game.sortName) variants.push(game.sortName);
  for (const n of game.localizedNames || []) variants.push(n.name);
  variants.push(...(game.alternateNames || []));
  return Array.from(new Set(variants.filter((v) => v)));
}

/** 显示名：优先 zh-CN，其次 zh-TW，最后回退英文主名。 */
export function displayName(game: SearchableGame): string {
  const localized = game.localizedNames || [];
  for (const lang of ["zh-CN", "zh-TW"]) {
    const hit = localized.find((ln) => ln.language === lang);
    if (hit && hit.name.trim()) return hit.name.trim();
  }
  return game.name;
}

/**
 * 匹配搜索词：空查询返回 true；否则子串匹配显示名，或拼音首字母匹配显示名。
 * 只搜"显示名"，保证搜出来的就是页面上显示的。
 */
export function matchSearch(game: SearchableGame, query: string): boolean {
  if (!query) return true;
  const q = normalize(query.trim());
  if (!q) return true;
  const shown = displayName(game);
  const shownNorm = normalize(shown);
  const initials = pinyinInitials(shown);
  return shownNorm.includes(q) || (!!initials && initials.includes(q));
}
