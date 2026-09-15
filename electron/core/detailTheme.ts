// 详情页的「主题注入」：把主界面**当前生效**的配色写进静态详情页的 HTML，
// 让那一张张白底页面跟着我们选的主题走（不再用它自带的浅色样式）。
//
// 为什么在**服务端**注入（而不是父页面 postMessage 去改 iframe）：
//   · 详情页是跨源 iframe，父页面进不去它的 DOM；
//   · 更要紧的是**时机** —— 颜色必须在页面首次绘制之前就是对的。等父页面发消息再改，
//     一定会先闪一下它自带的浅色主题（模板就是浅色的：D:/Addons/<游戏>/css/style.css
//     里 body 是 #f6f7f9、卡片 #fff）。服务端在"发 index.html"这一步拼进去，首帧即正确。
//
// 数据从哪来（只有渲染层知道当前主题）：
//   渲染层用 IPC `set_detail_theme` 把**当前生效的 CSS 变量**送过来，存在本模块的
//   模块级状态里；服务器每次发详情页时读一次。
//   为什么由渲染层读 :root 的计算值再送，而不是服务器自己去查主题：主题的唯一权威是
//   渲染层的 themeLibrary（配色 + 风格 + 设计器微调），主进程读不到（那是一个 60KB 的 TS 数据文件，
//   只被打进前端 bundle）。读计算值还顺带覆盖了"设置当前主题的每一个入口"。
//
// 为什么**不**做成每次请求都问渲染层要：发文件是同步路径，来回一问会把它变成异步；
// 而且主题只在用户手动切换时变 —— 存一份就够了（换主题时前端会重载那个 iframe）。
//
// ⚠️ 本模块只做字符串处理（不读文件、不碰 http），便于单测。

/** 注入的 <style> 标签 id（同时用于"防重复注入"）。 */
export const THEME_STYLE_ID = "yungame-detail-theme";

export interface DetailTheme {
  /** CSS 变量名 → 值（如 `--bg-base` → `#171a1f`）。 */
  vars: Record<string, string>;
  /** 是不是深色主题 —— 决定注入 `color-scheme`（影响滚动条、表单控件、原生播放器这些系统绘制的部分）。 */
  dark: boolean;
}

/** 变量名白名单形状：只收标准 CSS 自定义属性名。 */
const VAR_NAME_RE = /^--[a-z0-9-]{1,48}$/i;
/** 单个值长度上限（`color-mix(...)` 这类能到 60+ 字符，给足余量）。 */
const MAX_VALUE_LEN = 240;
/** 变量条数上限（当前调色板约 30 个）。 */
const MAX_VARS = 96;

/**
 * 值里**不允许**出现的字符：`<` `>` `{` `}` `;` `\` 和 CSS 注释。
 * 这些字符在合法色值里都不会出现（`rgba(0,0,0,.5)`、`color-mix(in srgb, var(--x) 14%, transparent)`
 * 都不含它们），一旦出现就说明有人想**跳出这个声明块或这个 style 标签**。
 * 服务端不信任送进来的东西 —— 渲染层是自己人也要挡一道，代价极低。
 */
const UNSAFE_VALUE_RE = /[<>{};\\]|\/\*|\*\//;

/** 单个值：合法就返回 trim 后的字符串，否则 null。 */
function safeValue(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > MAX_VALUE_LEN) return null;
  if (UNSAFE_VALUE_RE.test(s)) return null;
  return s;
}

/**
 * 清洗渲染层送来的载荷。拿不到可用内容时返回 **null**（调用方据此"什么都不注入"，
 * 页面保持它自己的样子 —— 而不是注入一个半残的样式把页面搞花）。
 */
export function sanitizeDetailTheme(input: unknown): DetailTheme | null {
  if (!input || typeof input !== "object") return null;
  const raw = (input as { vars?: unknown }).vars;
  if (!raw || typeof raw !== "object") return null;
  const vars: Record<string, string> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_VARS) break;
    if (!VAR_NAME_RE.test(k)) continue;
    const value = safeValue(v);
    if (!value) continue;
    vars[k] = value;
    n += 1;
  }
  if (Object.keys(vars).length === 0) return null;
  const dark = (input as { dark?: unknown }).dark;
  return { vars, dark: typeof dark === "boolean" ? dark : true };
}

/** 当前生效的主题（null = 还没有人送过 → 详情页保持自己的颜色）。 */
let current: DetailTheme | null = null;

/** 渲染层送来的主题：清洗后存下。返回是否采纳。 */
export function setDetailTheme(input: unknown): boolean {
  const theme = sanitizeDetailTheme(input);
  current = theme;
  return theme !== null;
}

export function getDetailTheme(): DetailTheme | null {
  return current;
}

/**
 * 页面覆盖样式。
 *
 * 两条设计约束（都来自"别把页面改坏"）：
 *   1) **只动颜色**，不动布局、间距、字号、字体 —— 那些是页面自己的排版资产，
 *      而且我们看不到全部 1000+ 页面的实际结构，改版式就是在赌。
 *   2) 每条规则都用**和页面同名的选择器**（`.hero` / `.section` / `.tag` …），
 *      不靠 `!important`：我们的 <style> 插在 `</head>` 之前、也就是页面自己那个
 *      `<link rel="stylesheet">` **之后**，同优先级下后者胜 —— 靠顺序而不是蛮力。
 *      （这也是为什么不能把它插到页面顶部：那样会被页面自己的样式盖掉。）
 *
 * 原样式参考 D:/Addons/<游戏>/css/style.css。
 * ⚠️ 这段是拼进 TS 模板串的 CSS：**注释里不要出现反引号**（会截断字符串）。
 */
const OVERRIDES = `
/* 页面底色与正文色 */
html, body { background: var(--bg-base); color: var(--text-primary); }
a { color: var(--accent-hover); }
/* 顶部「返回全部游戏」那条（模板里是固定的深蓝灰底） */
.topbar { background: var(--bg-top); color: var(--text-primary); border-bottom: 1px solid var(--border); }
.topbar a { color: var(--accent); }
/* 卡片：封面+标题那张 hero，以及下面每个 section。
   原样式是白底 + 极浅投影（rgba(0,0,0,.06)）—— 深色主题下投影等于看不见，
   所以去掉投影、补一圈描边，卡片边界才还在。 */
.hero, .section { background: var(--bg-panel); border: 1px solid var(--border); box-shadow: none; }
.section h2 { color: var(--text-primary); border-left-color: var(--accent); }
.hero-title { color: var(--text-primary); }
.hero-origin { color: var(--text-dim); }
.tag { background: var(--bg-item-hover); color: var(--text-secondary); }
.desc { color: var(--text-secondary); }
.meta-table td { border-bottom-color: var(--border); color: var(--text-secondary); }
.meta-table td:first-child { color: var(--text-dim); }
.dlc-list { color: var(--text-secondary); }
.footer, .empty { color: var(--text-dim); }
/* 滚动条：iframe 里那根是系统默认的浅色，深色主题下就是一条白杠 */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: var(--bg-base); }
::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 6px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }
`.trim();

/**
 * 生成要注入的 `<style>`（没有主题时返回空串 —— 调用方据此原样发页面，等于什么都没做）。
 */
export function buildDetailThemeStyle(theme: DetailTheme | null): string {
  if (!theme) return "";
  const decls = Object.entries(theme.vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  if (!decls) return "";
  // color-scheme 让**系统绘制**的部分（滚动条、表单控件、原生 <video> 控件）也跟着选深/浅，
  // 这些地方我们的 CSS 管不到。
  const scheme = `color-scheme:${theme.dark ? "dark" : "light"};`;
  return `<style id="${THEME_STYLE_ID}">\n:root{${decls};${scheme}}\n${OVERRIDES}\n</style>`;
}

/**
 * 把主题样式插到页面里（幂等：已注入过就不再插第二遍）。
 * 插在 `</head>` 之前 —— 必须在页面自己的 `<link rel="stylesheet">` **之后**，
 * 否则同优先级的规则会被页面自己盖掉（见 OVERRIDES 的说明）。
 * 退路：没有 `</head>` → 塞到 `<body ...>` 开标签后面；连 body 都没有 → 挂到最前面。
 */
export function injectDetailTheme(html: string, style: string): string {
  if (!style) return html;
  if (html.includes(`id="${THEME_STYLE_ID}"`)) return html;
  const lower = html.toLowerCase();
  const headEnd = lower.lastIndexOf("</head>");
  if (headEnd >= 0) return html.slice(0, headEnd) + style + html.slice(headEnd);
  const bodyOpen = /<body\b[^>]*>/i.exec(html);
  if (bodyOpen) {
    const at = bodyOpen.index + bodyOpen[0].length;
    return html.slice(0, at) + style + html.slice(at);
  }
  return style + html;
}
