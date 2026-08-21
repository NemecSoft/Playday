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
  originName?: string | null;
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

/** 收集所有名称变体（主名 + originName + 本地化名 + 别名），去重、去空。 */
export function gameNameVariants(game: SearchableGame): string[] {
  const variants: string[] = [game.name];
  // 原始英文名也进搜索变体：搜英文原名也能命中（如搜 "GTA5" 命中中文名游戏）。
  if (game.originName) variants.push(game.originName);
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
 * 匹配搜索词：空查询返回 true；否则子串或拼音首字母匹配**任意名称变体**。
 *
 * 名称变体 = 主名 + originName(原始英文名) + 本地化名(localized_names) + 别名(alternate_names)，
 * 所以给游戏加的多名称（如 GTA5 的别名"车枪大战5"）也能用拼音首字母搜到
 * （如搜"cqdz5"）。每个变体都同时做"子串包含"和"拼音首字母包含"两种匹配。
 */
export function matchSearch(game: SearchableGame, query: string): boolean {
  if (!query) return true;
  const q = normalize(query.trim());
  if (!q) return true;
  for (const v of gameNameVariants(game)) {
    const vNorm = normalize(v);
    // 子串匹配（中英文直接包含）
    if (vNorm.includes(q)) return true;
    // 拼音首字母匹配（如"车枪大战5" -> "cqdz5"）
    const initials = pinyinInitials(v);
    if (initials && initials.includes(q)) return true;
  }
  return false;
}
