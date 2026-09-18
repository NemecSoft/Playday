// 给 d:\Addons 里所有游戏详情页 index.html 的标签云加"点击筛选"能力：
//   1) 每个 <span class="tag">文本</span> 加 onclick="filterByTag('文本')"
//   2) 注入一段 <script> 定义 filterByTag(tag) 用 parent.postMessage 通知主页
//   3) 给 .tag 加 cursor:pointer + hover 样式（提示可点击）
// 幂等：检测已注入 filterByTag 则跳过，重复运行安全。
// 用法：node scripts/enable-tag-filter.mjs         # dry-run
//       node scripts/enable-tag-filter.mjs --apply  # 真正修改
import * as fs from "fs";
import * as path from "path";

const ROOT = "D:/Addons";
const APPLY = process.argv.includes("--apply");

// 注入的脚本（在每个 index.html </head> 前插入）
const SCRIPT = `<script>
/* Playday 标签点击筛选：通知主页跳回并按该标签筛选（详情页是主页 iframe）。 */
function filterByTag(tag) {
  try { window.parent.postMessage({ type: "playday-filter-by-tag", tag: String(tag) }, "*"); }
  catch (e) { console.error("[filterByTag]", e); }
}
</script>`;

// .tag 可点击样式（注入到 <style> 里；若页面已有含 .tag 的样式则追加到 </style> 前）
const TAG_STYLE = `.tags .tag{cursor:pointer;transition:transform .15s,box-shadow .15s;}
.tags .tag:hover{transform:translateY(-1px);box-shadow:0 0 8px var(--accent,#2d7ff9);}`;

function escapeAttr(s) {
  return s.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

let modified = 0;
let skipped = 0;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name === "index.html") {
      processHtml(p);
    }
  }
}

function processHtml(p) {
  let c = fs.readFileSync(p, "utf8");
  // 幂等：已注入则跳过
  if (c.includes("function filterByTag")) {
    skipped++;
    return;
  }
  // 1) 给每个 <span class="tag">文本</span> 加 onclick
  const newC = c.replace(/<span class="tag">([^<]*)<\/span>/g, (whole, text) => {
    const t = escapeAttr(text.trim());
    return `<span class="tag" onclick="filterByTag('${t}')">${text}</span>`;
  });
  if (newC === c) {
    // 没有任何 tag 标签？跳过
    skipped++;
    return;
  }
  c = newC;
  // 2) 注入脚本：在 </head> 前（没有 </head> 就放 <body> 前）
  if (/<\/head>/i.test(c)) c = c.replace(/<\/head>/i, SCRIPT + "\n</head>");
  else if (/<body[^>]*>/i.test(c)) c = c.replace(/<body[^>]*>/i, (m) => m + "\n" + SCRIPT);
  else c = SCRIPT + "\n" + c;
  // 3) 注入 .tag 样式：追加到 </style> 前（若有），否则插入 <style>
  if (/<\/style>/i.test(c)) {
    c = c.replace(/<\/style>/i, TAG_STYLE + "\n</style>");
  } else if (/<head[^>]*>/i.test(c)) {
    c = c.replace(/<head[^>]*>/i, (m) => m + `\n<style>${TAG_STYLE}</style>`);
  }
  modified++;
  if (APPLY) fs.writeFileSync(p, c, "utf8");
}

walk(ROOT);
console.log(`模式: ${APPLY ? "执行" : "预览"}`);
console.log(`详情页已改造: ${modified}，跳过(已注入或无标签): ${skipped}`);
