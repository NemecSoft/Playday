// 封面匹配规则的网站端实现（零依赖 .mjs）。
//
// ⚠️ 与 shared/coverMatch.ts 是**同一套语义的两份实现**（网站端不能 import TS）：
// shared/coverMatch.test.ts 里有一组 parity 用例逐项比对，改一边忘另一边会直接测失败。
//
// 为什么网站端也要匹配：`games.cover_image` 列**已废弃**（保留不删、不再写入），
// 封面来源是"运行期扫封面目录 + 按游戏名匹配同名文件"。以前网站端直接读那个废弃列，
// 于是新导入的游戏（导出时 coverImage 置空）在网站上全是空封面。

/** 会被当作封面的扩展名（与桌面端一致）。 */
export const COVER_IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];

/** 取小写扩展名（不带点）。 */
export function extOf(file) {
  const base = String(file).replace(/\\/g, "/").split("/").pop() ?? "";
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i + 1).toLowerCase();
}

/** 名称规范化：转小写、全角转半角、去掉空格与标点括号（与桌面端逐字一致）。 */
export function normalizeCoverName(s) {
  const stripped = new Set(
    " \t\r\n　、，。：；！？·•（）【】《》「」『』〈〉()[]{}<>-_.,｜|&+'\"/`＊*＃#".split(""),
  );
  let out = "";
  for (const ch of s) {
    let c = ch;
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

/** 同名图片的格式优先级（与桌面端一致）。 */
export function coverFormatPriority(ext, isApng) {
  if (ext === "png" && isApng) return 100;
  if (ext === "webp") return 80;
  if (ext === "gif") return 60;
  if (ext === "jpg" || ext === "jpeg") return 40;
  if (ext === "png") return 20;
  if (ext === "bmp") return 10;
  return 0;
}

/** 新候选是否比当前选中的更好（同优先级保持先到者）。 */
export function isBetterCover(candidate, current) {
  return (
    coverFormatPriority(extOf(candidate.file), candidate.isApng) >
    coverFormatPriority(extOf(current.file), current.isApng)
  );
}

/** 候选名顺序：中文名 → 其它多语言名 → 别名 → 主名（与桌面端一致）。 */
export function coverCandidateNames(game) {
  const seen = new Set();
  const candidates = [];
  const push = (raw) => {
    const t = (raw ?? "").trim();
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
