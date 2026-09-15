// 详情页「主题注入」真引擎探针。
//
// 为什么必须跑真引擎：单测只能证明"注入的字符串里有那些规则"，证明不了**页面上真的变了色** ——
// 页面自己那份 style.css 会不会盖掉我们、同优先级谁赢、CSS 变量有没有解析出来，只有真浏览器能回答。
//
// 它做三件事：
//   ① 拿**真实**详情页（D:/Addons/<游戏>/index.html + 它自己的 css/style.css + 图片），
//      拷进本目录的 site/ 下（保持相对路径），用**真实的注入函数**生成带主题的页面；
//   ② 起一个真 Electron 窗口加载它，量一批元素的计算样式；
//   ③ 判定：卡片/正文/标签是不是真的换成了主题色（而不是页面原来的白底黑字），并算对比度。
//
// 跑法（仓库根目录）：
//   npx vite-node -c vitest.config.mts _probe-detail-theme/run.mts
// 换一页再验：npx vite-node -c vitest.config.mts _probe-detail-theme/run.mts -- "艾尔登法环-联机版"

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { buildVideoSection, injectVideoSection } from "../electron/core/gameDetailInject";
import { buildDetailThemeStyle, injectDetailTheme } from "../electron/core/detailTheme";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const DETAILS_ROOT = "D:/Addons";
const GAME = process.argv.slice(2).filter((a) => !a.startsWith("-"))[0] || "30XX";

// 探针用的主题 = 界面首屏的深色默认值（src/styles/tokens.css）。
// 为什么不用 themeLibrary 里的某个配色：那要 import 渲染层模块（会牵进 api/client 与 window），
// 而这里要验的是"注入后页面会不会变色"，跟具体是哪个配色无关。
const V: Record<string, string> = {
  "--background": "#0e0e16",
  "--foreground": "#e6e7ee",
  "--card": "#15161f",
  "--card-foreground": "#e6e7ee",
  "--primary": "#6d5df6",
  "--primary-foreground": "#ffffff",
  "--border": "#262734",
  "--ring": "#6d5df6",
  "--bg-base": "#0e0e16",
  "--bg-top": "#15161f",
  "--bg-panel": "#15161f",
  "--bg-sidebar": "#12131b",
  "--bg-item-hover": "#1f2130",
  "--bg-item-active": "#262838",
  "--bg-input": "#191a24",
  "--border-strong": "#343647",
  "--text-primary": "#e6e7ee",
  "--text-secondary": "#a6a8bc",
  "--text-dim": "#7a7d92",
  "--accent": "#6d5df6",
  "--accent-hover": "#7f72ff",
  "--accent-soft": "rgba(109, 93, 246, 0.18)",
};

/** #rrggbb → 浏览器计算样式的写法（`rgb(r, g, b)`），好直接比字符串。 */
function rgb(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return `（解析不了 ${hex}）`;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return `rgb(${r}, ${g}, ${b})`;
}

// —— ① 素材：真实页面 + 它自己的样式表 + 图片 ——
const srcDir = path.join(DETAILS_ROOT, GAME);
if (!fs.existsSync(path.join(srcDir, "index.html"))) {
  console.error(`✗ 找不到 ${srcDir}\\index.html`);
  process.exit(1);
}
const siteDir = path.join(HERE, "site");
// 只覆盖、不删除：这个目录里的文件名是固定的（index/plain/css），每次重写就行。
// （另外实测：本机 IDE 把 fs.rmSync 接到了"移到回收站"的 shim 上，递归删目录会直接抛错 ——
//  没必要跟它较劲。零星残留（换游戏跑时多出来的几张图）不影响判定。）
fs.mkdirSync(path.join(siteDir, "css"), { recursive: true });
fs.mkdirSync(path.join(siteDir, "images"), { recursive: true });
fs.copyFileSync(path.join(srcDir, "css", "style.css"), path.join(siteDir, "css", "style.css"));
for (const f of fs.readdirSync(path.join(srcDir, "images")).slice(0, 3)) {
  fs.copyFileSync(path.join(srcDir, "images", f), path.join(siteDir, "images", f));
}
const rawHtml = fs.readFileSync(path.join(srcDir, "index.html"), "utf-8");
// 用**真实的注入链**：视频区块（也带上一个，验它的卡片是不是跟着主题走）+ 主题样式。
const injected = injectDetailTheme(
  injectVideoSection(
    rawHtml,
    buildVideoSection({
      scan: { root: ["假视频.mp4"], dirs: [] },
      lang: "zh-CN",
      accent: V["--accent"],
    })
  ),
  buildDetailThemeStyle({ vars: V, dark: true })
);
fs.writeFileSync(path.join(siteDir, "index.html"), injected, "utf-8");
// 对照组：同一个页面、什么都不注入（证明"变了的是我们注入的那部分"，而不是源页面本来就深色）
fs.writeFileSync(path.join(siteDir, "plain.html"), rawHtml, "utf-8");

// —— ② 真引擎 ——
const electron = path.join(REPO, "node_modules", "electron", "dist", "electron.exe");
const r = spawnSync(electron, [path.join(HERE, "probe.js")], { stdio: "inherit" });
if (r.error) {
  console.error("✗ 起 Electron 失败:", r.error.message);
  process.exit(1);
}
const outFile = path.join(HERE, "result.txt");
if (!fs.existsSync(outFile)) {
  console.error("✗ 探针没写出 result.txt");
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as {
  error?: string;
  themed?: Record<string, Record<string, string>>;
  plain?: Record<string, Record<string, string>>;
  contrast?: Record<string, number>;
};
if (report.error) {
  console.error("✗ 页面测量失败:", report.error);
  process.exit(1);
}
const themed = report.themed ?? {};
const plain = report.plain ?? {};
const contrast = report.contrast ?? {};

// —— ③ 判定 ——
let fail = 0;
function line(ok: boolean, label: string, got: string, want: string) {
  if (!ok) fail += 1;
  console.log(`${ok ? "✓" : "✗"} ${label.padEnd(24)} ${got}${ok ? "" : `   期望 ${want}`}`);
}
const got = (m: Record<string, Record<string, string>>, sel: string, prop: string) =>
  m[sel]?.[prop] ?? "(无)";

/** [标签, 选择器, 属性, 期望值] —— 全部来自上面那份调色板。 */
const CASES: [string, string, string, string][] = [
  ["body 底色", "body", "bg", rgb(V["--bg-base"])],
  ["body 文字色", "body", "color", rgb(V["--text-primary"])],
  ["卡片 .section 底色", ".section", "bg", rgb(V["--bg-panel"])],
  ["卡片 .hero 底色", ".hero", "bg", rgb(V["--bg-panel"])],
  ["卡片描边", ".section", "border", rgb(V["--border"])],
  ["h2 左侧色条", ".section h2", "borderLeft", rgb(V["--accent"])],
  ["正文 .desc 颜色", ".desc", "color", rgb(V["--text-secondary"])],
  ["标签 .tag 底色", ".tag", "bg", rgb(V["--bg-item-hover"])],
  ["标签 .tag 文字色", ".tag", "color", rgb(V["--text-secondary"])],
  ["次要 .hero-origin 色", ".hero-origin", "color", rgb(V["--text-dim"])],
  ["表格分隔线", ".meta-table td", "borderBottom", rgb(V["--border"])],
  ["顶栏 .topbar 底色", ".topbar", "bg", rgb(V["--bg-top"])],
  ["顶栏链接色", ".topbar a", "color", rgb(V["--accent"])],
  ["视频卡片底色", ".yungame-video-card", "bg", rgb(V["--bg-panel"])],
  ["视频标题色", ".yungame-video-title", "color", rgb(V["--text-primary"])],
];

console.log(`\n===== 注入后（真实详情页：${GAME}）=====`);
for (const [label, sel, prop, want] of CASES) {
  const g = got(themed, sel, prop);
  line(g === want, label, g, want);
}

console.log(`\n===== 对照组（不注入 → 应保持页面原生浅色）=====`);
line(got(plain, "body", "bg") === "rgb(246, 247, 249)", "body 原生底色", got(plain, "body", "bg"), "rgb(246, 247, 249)");
line(got(plain, ".section", "bg") === "rgb(255, 255, 255)", ".section 原生底色", got(plain, ".section", "bg"), "rgb(255, 255, 255)");

console.log(`\n===== 可读性（WCAG）=====`);
// 阈值口径与仓库里主题对比度守卫（src/utils/__tests__/themeContrast.test.ts）一致：
// 正文 4.5、次要 3.0、弱化(dim) 2.6。
const MIN: Record<string, number> = {
  "正文 .desc（卡片上）": 4.5,
  "标题 .hero-title（卡片上）": 4.5,
  "标签 .tag（自身底上）": 3.0,
  "次要 .hero-origin（卡片上）": 2.6,
  "表格字段名 .meta-table td:first-child": 2.6, // 我们刻意用 dim 色的那一列
  "表格数值 .meta-table td:last-child": 4.5,
  "视频标题（视频卡片上）": 4.5,
};
for (const [label, value] of Object.entries(contrast)) {
  const min = MIN[label];
  if (min === undefined) {
    // 探针自己的漂移保护：probe.js 里加了新的一组对比度，这里却忘了给阈值。
    line(false, label, `${value.toFixed(2)}:1`, "补一个阈值");
    continue;
  }
  line(value >= min, label, `${value.toFixed(2)}:1`, `≥ ${min}:1`);
}

console.log(fail === 0 ? "\n全部通过 ✓" : `\n${fail} 项不通过 ✗`);
process.exit(fail === 0 ? 0 : 1);
