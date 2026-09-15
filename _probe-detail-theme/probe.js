// 真引擎探针的 Electron 部分：加载 run.mts 生成的两个页面（注入过的 / 没注入的），
// 量一批元素的计算样式，把结果写成 result.txt。判定在 run.mts 里做（那边有期望值）。
//
// 用真 Electron（不是 jsdom）：要验的正是"页面自己那份 style.css 会不会盖掉我们注入的样式"，
// 这需要真实层叠与变量解析 —— jsdom 两样都没有，量出来一定是自欺欺人。

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

// 要量的选择器 → 页面里用哪个元素。键名同时用于 result.txt（run.mts 按这些键判定）。
const SELECTORS = [
  "body",
  ".topbar",
  ".topbar a",
  ".hero",
  ".hero-title",
  ".hero-origin",
  ".tag",
  ".section",
  ".section h2",
  ".desc",
  ".meta-table td",
  ".yungame-video-card",
  ".yungame-video-title",
];

// 对比度：[标签, 文字元素, 取哪个元素的底色]
// 阈值在 run.mts 里给（那边同时是判定方），口径沿用仓库的主题对比度守卫：
// 正文 4.5、次要 3.0、弱化（dim）2.6。
// ⚠️ 表格特意拆成两行：第一列是我们定为 dim 的字段名，第二列才是正文级的值 ——
// 混成一行为会按正文 4.5 判，把"刻意弱化的那一列"误判成不合格。
const CONTRAST = [
  ["正文 .desc（卡片上）", ".desc", ".section"],
  ["标题 .hero-title（卡片上）", ".hero-title", ".hero"],
  ["标签 .tag（自身底上）", ".tag", ".tag"],
  ["次要 .hero-origin（卡片上）", ".hero-origin", ".hero"],
  ["表格字段名 .meta-table td:first-child", ".meta-table td:first-child", ".section"],
  ["表格数值 .meta-table td:last-child", ".meta-table td:last-child", ".section"],
  ["视频标题（视频卡片上）", ".yungame-video-title", ".yungame-video-card"],
];

/** 在页面里跑的测量脚本（字符串给 executeJavaScript）。 */
function measureScript() {
  return `(() => {
  const SELECTORS = ${JSON.stringify(SELECTORS)};
  const style = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el) : null;
  };
  const themed = {};
  for (const sel of SELECTORS) {
    const cs = style(sel);
    // ⚠️ 量的必须是**页面真的设过颜色的那条边**：
    //   .section 是四边统一的描边 → borderTopColor；
    //   .meta-table td 只设了 border-bottom，border-top 没设 → 计算值回落成 currentColor
    //   （等于文字色）。量 top 会得到"分隔线跟着文字变色"这种假结论。
    themed[sel] = cs
      ? {
          bg: cs.backgroundColor,
          color: cs.color,
          border: cs.borderTopColor,
          borderBottom: cs.borderBottomColor,
          borderLeft: cs.borderLeftColor,
        }
      : { bg: "(元素不存在)" };
  }

  // —— 对比度 ——
  const parse = (c) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c || "");
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x));
    if (p.length < 3) return null;
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  // 往上找第一个"不透明"的背景色（和浏览器实际看到的一样）
  const bgOf = (el) => {
    let n = el;
    while (n) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.95) return c.rgb;
      n = n.parentElement;
    }
    return [255, 255, 255];
  };
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (fg, bg) => {
    const [hi, lo] = lum(fg) > lum(bg) ? [lum(fg), lum(bg)] : [lum(bg), lum(fg)];
    return (hi + 0.05) / (lo + 0.05);
  };
  const contrastOut = {};
  const PAIRS = ${JSON.stringify(CONTRAST)};
  for (const [label, textSel, bgSel] of PAIRS) {
    const t = document.querySelector(textSel);
    const b = document.querySelector(bgSel);
    const c = t ? parse(getComputedStyle(t).color) : null;
    if (!t || !b || !c) { contrastOut[label] = 0; continue; }
    contrastOut[label] = contrast(c.rgb, bgOf(b));
  }
  return { themed, contrast: contrastOut };
})()`;
}

async function measure(win, file, key) {
  await win.loadFile(file);
  // 给页面自己的脚本一点时间（视频区块那个脚本会 createElement / 抓帧，不影响计算样式，
  // 但让它跑完，量的就是"页面稳定下来之后"的样子）。
  await new Promise((r) => setTimeout(r, 700));
  const res = await win.webContents.executeJavaScript(measureScript());
  return { key, ...res };
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  try {
    const themed = await measure(win, path.join(__dirname, "site", "index.html"), "themed");
    const plain = await measure(win, path.join(__dirname, "site", "plain.html"), "plain");
    fs.writeFileSync(
      path.join(__dirname, "result.txt"),
      JSON.stringify({ themed: themed.themed, plain: plain.themed, contrast: themed.contrast }, null, 2),
      "utf-8"
    );
  } catch (e) {
    console.error("[probe] 失败:", e);
    try {
      fs.writeFileSync(path.join(__dirname, "result.txt"), JSON.stringify({ error: String(e) }), "utf-8");
    } catch {}
  }
  app.quit();
});
