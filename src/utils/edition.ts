// Resolves the "edition" suffix (黄金版 / 钻石版) shown next to a user's name,
// based on the user's access level. Enterprise cafe names sometimes carry both
// candidate editions separated by `|` (e.g. "YunGame——+黄金版|钻石版"); we keep
// only the one matching the current level:
//   level 1 -> 黄金版
//   level 2 -> 钻石版
// If the name has no edition candidates, it's returned unchanged.

const EDITION_GOLD = "黄金版";
const EDITION_DIAMOND = "钻石版";

/** Edition label for a given user level (1=黄金, 2=钻石, else empty). */
export function editionForLevel(level: number): string {
  if (level === 1) return EDITION_GOLD;
  if (level === 2) return EDITION_DIAMOND;
  return "";
}

/**
 * Reduce a name that may contain edition candidates to the one matching `level`.
 * Handles forms like "YunGame——+黄金版|钻石版", "黄金版|钻石版", "X黄金版Y钻石版".
 */
export function resolveEditionName(name: string, level: number): string {
  if (!name) return name;
  const want = editionForLevel(level);
  if (!want) return name;

  const hasGold = name.includes(EDITION_GOLD);
  const hasDiamond = name.includes(EDITION_DIAMOND);
  if (!hasGold && !hasDiamond) {
    // No edition tokens -> nothing to reduce.
    return name;
  }

  // Keep only the token that matches the current level.
  const drop = want === EDITION_GOLD ? EDITION_DIAMOND : EDITION_GOLD;
  let out = name.split(drop).join("");
  // Clean up leftover separators (| / ——+ / -- / etc.) around the removed slot,
  // and drop any stray "+" that was part of a "——+" separator.
  out = out
    .replace(/\|/g, "")
    .replace(/[｜]/g, "")
    .replace(/——\+/g, "——")
    .replace(/——+/g, "——")
    .replace(/——\s*$/, "");
  return out.trim();
}
