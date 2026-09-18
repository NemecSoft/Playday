// 批量清理 d:\Addons 下所有 index.html / info.json 里的 xdgame 信息。
// 去掉：页脚"信息整理自 XDGAME..."、"© 2026 Game Library"、顶栏"来源：xdgame.com"链接、
//       视频 section（xdgame.com 播放器，连视频一起去掉）。
// info.json 去掉：site_url / desc_source / video_url 三个 xdgame 来源字段。
// 用法：node scripts/clean-xdgame.mjs        # dry-run，只统计不修改
//       node scripts/clean-xdgame.mjs --apply  # 真正修改
import * as fs from "fs";
import * as path from "path";

const ROOT = "D:/Addons";
const APPLY = process.argv.includes("--apply");

// ---- index.html 的替换规则（正则）----
// 1) 顶栏来源链接：<span>来源：<a href="xdgame">xdgame.com</a></span>
const TOPBAR_SRC = /\s*<span>来源：<a[^>]*>xdgame\.com<\/a><\/span>\s*/g;
// 2) 视频 section（含 h2"游戏视频" + video-wrap iframe，整段删）
const VIDEO_SECTION =
  /<div class="section">\s*<h2>游戏视频<\/h2>\s*<div class="video-wrap">[\s\S]*?<\/div>\s*<\/div>/g;
// 3) 页脚"信息整理自 XDGAME..."一行
const FOOTER_INFO =
  /\s*<p>信息整理自 <a[^>]*>[^<]*<\/a>，仅供学习与分享 · 游戏版权归原作者所有<\/p>\s*/g;
// 4) 页脚"© 2026 Game Library"一行
const FOOTER_COPY = /\s*<p>© 2026 Game Library<\/p>\s*/g;
// 5) 清理可能变空的 footer 容器（仅剩空格/换行）
const EMPTY_FOOTER = /<div class="footer">\s*<\/div>/g;

// ---- info.json 的行级规则（匹配的行整行删除，含行尾逗号）----
const JSON_LINE_RULES = [
  /^\s*"site_url":\s*".*",?\s*$/,
  /^\s*"desc_source":\s*".*",?\s*$/,
  /^\s*"video_url":\s*".*",?\s*$/,
];

let htmlModified = 0;
let jsonModified = 0;
const totalHtml = { topbar: 0, video: 0, footerInfo: 0, footerCopy: 0 };
let firstHtmlSample = null;
let firstJsonSample = null;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name === "index.html") {
      processHtml(p);
    } else if (e.isFile() && e.name === "info.json") {
      processJson(p);
    }
  }
}

function processHtml(p) {
  const content = fs.readFileSync(p, "utf8");
  const stats = {
    topbar: (content.match(TOPBAR_SRC) || []).length,
    video: (content.match(VIDEO_SECTION) || []).length,
    footerInfo: (content.match(FOOTER_INFO) || []).length,
    footerCopy: (content.match(FOOTER_COPY) || []).length,
  };
  const total =
    stats.topbar + stats.video + stats.footerInfo + stats.footerCopy;
  if (total === 0) return;
  totalHtml.topbar += stats.topbar;
  totalHtml.video += stats.video;
  totalHtml.footerInfo += stats.footerInfo;
  totalHtml.footerCopy += stats.footerCopy;
  htmlModified++;
  if (!firstHtmlSample)
    firstHtmlSample = `${path.relative(ROOT, p)} [顶栏${stats.topbar}/视频${stats.video}/整理自${stats.footerInfo}/版权${stats.footerCopy}]`;
  if (!APPLY) return;
  let out = content
    .replace(TOPBAR_SRC, "")
    .replace(VIDEO_SECTION, "")
    .replace(FOOTER_INFO, "")
    .replace(FOOTER_COPY, "")
    .replace(EMPTY_FOOTER, "");
  if (out !== content) fs.writeFileSync(p, out, "utf8");
}

function processJson(p) {
  const content = fs.readFileSync(p, "utf8");
  const lines = content.split(/\r?\n/);
  const keep = lines.filter(
    (l) => !JSON_LINE_RULES.some((re) => re.test(l)),
  );
  if (keep.length === lines.length) return;
  jsonModified++;
  if (!firstJsonSample)
    firstJsonSample = `${path.relative(ROOT, p)} 删除字段行 ${lines.length - keep.length} 行`;
  if (!APPLY) return;
  fs.writeFileSync(p, keep.join("\n"), "utf8");
}

walk(ROOT);

console.log(`模式: ${APPLY ? "执行（真正修改）" : "预览（仅统计）"}`);
console.log(`index.html 将修改: ${htmlModified} 个文件`);
console.log(`  - 顶栏来源链接: ${totalHtml.topbar} 处`);
console.log(`  - 视频 section:  ${totalHtml.video} 处`);
console.log(`  - 页脚"整理自":  ${totalHtml.footerInfo} 处`);
console.log(`  - 页脚"版权":    ${totalHtml.footerCopy} 处`);
console.log(`info.json 将修改: ${jsonModified} 个文件`);
console.log(`样例 html: ${firstHtmlSample || "-"}`);
console.log(`样例 json: ${firstJsonSample || "-"}`);
