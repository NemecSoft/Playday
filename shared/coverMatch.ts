// 封面"按文件名匹配"的规则 —— 纯函数，零 import。
//
// 背景（务必读懂，`cover_image` 列已废弃）：
//   封面**不再存数据库**。`games.cover_image` 是历史遗留列（保留不删、不再写入），
//   真正的封面来源是"运行期扫封面目录 + 按游戏名匹配同名文件"：
//     桌面端 electron/core/covers.ts（applyCoversToLibrary：只算不写）
//     网站端 server/server.mjs（同样只算不写，见 server/coverMatch.mjs）
//   所以匹配规则必须是**唯一一份**，否则桌面能看到封面、网站看不到（或反过来）。
//   网站端是零依赖 .mjs、不能 import TS，所以那边有一份同语义镜像 +
//   shared/coverMatch.test.ts 里的 parity 用例逐项比对。

/** 会被当作封面的扩展名（小写，不带点）。 */
export const COVER_IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];

/** 取小写扩展名（不带点）。 */
export function extOf(file: string): string {
  const base = String(file).replace(/\\/g, "/").split("/").pop() ?? "";
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i + 1).toLowerCase();
}

/**
 * 名称规范化：转小写、全角转半角、去掉空格与标点括号。
 * 这样"星际争霸 (2)"、"星际争霸-2"、"星际争霸"都落到同一个键。
 */
export function normalizeCoverName(s: string): string {
  const stripped = new Set(
    " \t\r\n　、，。：；！？·•（）【】《》「」『』〈〉()[]{}<>-_.,｜|&+'\"/`＊*＃#".split(""),
  );
  let out = "";
  for (const ch of s) {
    let c = ch;
    // 全角数字/字母转半角
    if (c >= "０" && c <= "９") {
      c = String.fromCharCode(c.charCodeAt(0) - "０".charCodeAt(0) + "0".charCodeAt(0));
    } else if (c >= "Ａ" && c <= "Ｚ") {
      c = String.fromCharCode(c.charCodeAt(0) - "Ａ".charCodeAt(0) + "A".charCodeAt(0));
    } else if (c >= "ａ" && c <= "ｚ") {
      c = String.fromCharCode(c.charCodeAt(0) - "ａ".charCodeAt(0) + "a".charCodeAt(0));
    }
    if (stripped.has(c)) continue;
    out += c.toLocaleLowerCase();
  }
  return out;
}

/** 同名图片的格式优先级：动图 > webp > gif > jpg > png > bmp。 */
export function coverFormatPriority(ext: string, isApng: boolean): number {
  if (ext === "png" && isApng) return 100;
  if (ext === "webp") return 80;
  if (ext === "gif") return 60;
  if (ext === "jpg" || ext === "jpeg") return 40;
  if (ext === "png") return 20;
  if (ext === "bmp") return 10;
  return 0;
}

/** 新候选是否比当前选中的更好（同优先级保持先到者，保证结果稳定）。 */
export function isBetterCover(
  candidate: { file: string; isApng: boolean },
  current: { file: string; isApng: boolean },
): boolean {
  return (
    coverFormatPriority(extOf(candidate.file), candidate.isApng) >
    coverFormatPriority(extOf(current.file), current.isApng)
  );
}

/** 结构化入参：桌面端传 Game，网站端传 rowToGame 的结果，两边字段名一致。 */
export interface CoverNameSource {
  name?: string;
  localizedNames?: Array<{ language: string; name: string }>;
  alternateNames?: string[];
}

/**
 * 按优先级给出"该去封面目录里找哪些名字"：
 *   1) 中文名（zh-CN 优先，再 zh-TW）
 *   2) 其它多语言名
 *   3) 别名
 *   4) 主名
 * 去重（按 trim 后的原文），顺序即优先级。
 */
export function coverCandidateNames(game: CoverNameSource): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];
  const push = (raw: string | undefined) => {
    const t = (raw ?? "").trim();
    // 注意不能写成 `if (t && seen.add(t))`：Set.add 返回 Set（恒真），去重会失效。
    if (t && !seen.has(t)) {
      seen.add(t);
      candidates.push(t);
    }
  };

  const localized = game.localizedNames ?? [];
  for (const lang of ["zh-CN", "zh-TW"]) {
    push(localized.find((n) => n.language === lang)?.name);
  }
  for (const ln of localized) push(ln.name);
  for (const a of game.alternateNames ?? []) push(a);
  push(game.name);

  return candidates;
}
