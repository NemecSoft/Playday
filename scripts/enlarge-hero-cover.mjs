// 把每份游戏详情页的封面放大成"整行 banner"（2026-09-18 用户要求："封面再大一些，左右占满"）。
//
// 为什么改这里、不改主题注入：
//   这 1000+ 份详情页用的是同一套模板（实测 1326 份 css/style.css 的 .hero-cover 完全一致），
//   而**版式属于页面自己的排版资产** —— electron/core/detailTheme.ts 的注入只动颜色，
//   那边还有一条单测明确禁止出现布局属性（`display:` / `font-size:` / `margin`），
//   docs/design/game-details.md 也把"版式、间距、字号一律不动"写成了约定。
//   所以封面尺寸落在页面自己的 css/style.css 里，桌面端和网站端一起生效。
//
// 改哪三条（模板里原本是"封面 240px 固定在左边、信息在右"的横排）：
//   .hero          → 改成竖排（flex-direction: column），封面独占一行
//   .hero-cover    → 从固定 240px 改成占满整行
//   .hero-cover img→ 宽度 100%，并加高度上限 + object-fit: cover（竖版封面不至于撑出几屏高）
//
// 用法：
//   node scripts/enlarge-hero-cover.mjs                     # 预览（默认，不写盘）
//   node scripts/enlarge-hero-cover.mjs --apply             # 真正修改
//   node scripts/enlarge-hero-cover.mjs --revert --apply    # 改回原样
//   node scripts/enlarge-hero-cover.mjs --dir D:/Somewhere  # 换目录（默认取 path-modes.json）
//
// 幂等：按"当前是新版还是旧版"判断，改过的文件再跑不会叠加、也不会被 --revert 之外的规则碰。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

const APPLY = process.argv.includes("--apply");
const REVERT = process.argv.includes("--revert");

/** 封面高度上限（px）。竖版封面按 2:3 算，占满整行后会到 1300+ px —— 给个上限，
 *  再用 object-fit: cover + 顶部对齐裁掉多余部分。嫌高嫌矮改这一个数。 */
const MAX_HEIGHT = 560;

const OLD = [
  ".hero { display: flex; gap: 24px; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 1px 6px rgba(0,0,0,.06); }",
  ".hero-cover { flex: 0 0 240px; }",
  ".hero-cover img { width: 100%; border-radius: 8px; display: block; box-shadow: 0 4px 14px rgba(0,0,0,.18); }",
];

const NEW = [
  ".hero { display: flex; flex-direction: column; gap: 18px; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 1px 6px rgba(0,0,0,.06); }",
  ".hero-cover { flex: 0 0 auto; width: 100%; }",
  `.hero-cover img { width: 100%; max-height: ${MAX_HEIGHT}px; object-fit: cover; object-position: center top; border-radius: 8px; display: block; box-shadow: 0 4px 14px rgba(0,0,0,.18); }`,
];

/** 目标根目录：默认读 path-modes.json 的 dev.gameDetailsDir（"路径不许写死"是硬约定）。 */
function detailsRoot() {
  const i = process.argv.indexOf("--dir");
  if (i >= 0 && process.argv[i + 1]) return path.resolve(process.argv[i + 1]);
  const modes = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "path-modes.json"), "utf8"));
  const v = modes?.modes?.dev?.gameDetailsDir;
  const dir = Array.isArray(v) ? v[0] : v;
  if (!dir) throw new Error("path-modes.json 里没有 modes.dev.gameDetailsDir");
  return path.resolve(REPO_ROOT, dir);
}

const ROOT = detailsRoot();

const stats = { scanned: 0, changed: 0, already: 0, noPattern: 0, sample: [] };

/** 一次替换：把 from 的那些行换成 to（整行匹配，避免碰到别的规则）。 */
function swap(css, from, to) {
  let out = css;
  for (let i = 0; i < from.length; i++) {
    if (!out.includes(from[i])) return null;
    out = out.replace(from[i], to[i]);
  }
  return out;
}

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(p);
    } else if (e.isFile() && e.name === "style.css" && path.basename(path.dirname(p)) === "css") {
      processCss(p);
    }
  }
}

function processCss(file) {
  stats.scanned++;
  const css = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);

  const next = REVERT ? swap(css, NEW, OLD) : swap(css, OLD, NEW);
  if (next === null) {
    // 已经是目标状态 → 幂等跳过；两边都不匹配 → 模板不一样，单独报出来
    const isNew = OLD.every((l) => !css.includes(l)) && NEW.every((l) => css.includes(l));
    if (isNew) stats.already++;
    else {
      stats.noPattern++;
      if (stats.sample.length < 5) stats.sample.push(`  模板不同: ${rel}`);
    }
    return;
  }
  stats.changed++;
  if (stats.sample.length < 5) stats.sample.push(`  ${rel}`);
  if (APPLY) fs.writeFileSync(file, next, "utf8");
}

walk(ROOT);

const action = REVERT ? "改回原样" : "封面放大成整行";
console.log(`目标目录: ${ROOT}`);
console.log(`模式: ${APPLY ? "执行（真正修改）" : "预览（不写盘）"} ｜ 动作: ${action}`);
console.log(`扫到 style.css: ${stats.scanned} 个`);
console.log(`  ${APPLY ? "已修改" : "将修改"}: ${stats.changed} 个`);
console.log(`  已是目标样式（跳过）: ${stats.already} 个`);
console.log(`  模板不同（跳过）: ${stats.noPattern} 个`);
if (stats.sample.length) {
  console.log("--- 样例 ---");
  stats.sample.forEach((s) => console.log(s));
}
if (!APPLY) console.log("\n确认没问题就加 --apply 真正写入。");
