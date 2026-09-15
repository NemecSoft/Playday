// 详情页「主题注入」的单测。
// 这些规则错了都不报错：轻则"页面还是它自己的浅色"（看着像没做），
// 重则整段 <style> 被吃掉（页面样式全崩）。两种都只会在用户那边看得见，所以按可执行规格钉住。

import { describe, expect, it } from "vitest";
import {
  THEME_STYLE_ID,
  buildDetailThemeStyle,
  getDetailTheme,
  injectDetailTheme,
  sanitizeDetailTheme,
  setDetailTheme,
} from "./detailTheme";

/** 与真实详情页同构：head 里有自己的样式表（我们注入的必须排在它后面）。 */
const PAGE = [
  "<!DOCTYPE html>",
  '<html lang="zh-CN"><head><meta charset="UTF-8">',
  '<link rel="stylesheet" href="css/style.css">',
  "</head><body>",
  '<div class="container"><div class="section"><h2>游戏简介</h2></div></div>',
  "</body></html>",
].join("");

const VARS = {
  "--bg-base": "#171a1f",
  "--bg-panel": "#1f242c",
  "--text-primary": "#e6e7ee",
  "--text-secondary": "#a6a8bc",
  "--accent": "#2d7ff9",
  "--accent-soft": "rgba(45, 127, 249, 0.14)",
  "--border": "#262734",
};

describe("sanitizeDetailTheme：服务端不信任送进来的东西", () => {
  it("正常载荷：留下合法的变量，dark 缺省按深色处理", () => {
    const t = sanitizeDetailTheme({ vars: VARS, dark: undefined });
    expect(t).not.toBeNull();
    expect(t!.vars["--bg-base"]).toBe("#171a1f");
    // rgba 这类值必须原样留下（它是 accent-soft 的正常写法），不能被"过滤可疑字符"误伤
    expect(t!.vars["--accent-soft"]).toBe("rgba(45, 127, 249, 0.14)");
    expect(t!.dark).toBe(true);
  });

  it("挡住「跳出声明块 / 跳出 style 标签」的企图", () => {
    const t = sanitizeDetailTheme({
      vars: {
        // 想提前闭合声明块、再塞自己的规则
        "--evil-1": "red; } body { display: none }",
        // 想闭合 <style> 标签，往页面里塞脚本
        "--evil-2": "</style><script>alert(1)</script>",
        // CSS 注释（可以吞掉后面的声明）
        "--evil-3": "red/*x*/",
        // 合法值仍然保留，说明是"过滤掉坏的"而不是"整份丢掉"
        "--bg-base": "#171a1f",
      },
      dark: true,
    });
    expect(t!.vars["--evil-1"]).toBeUndefined();
    expect(t!.vars["--evil-2"]).toBeUndefined();
    expect(t!.vars["--evil-3"]).toBeUndefined();
    expect(t!.vars["--bg-base"]).toBe("#171a1f");
  });

  it("变量名必须是标准的 CSS 自定义属性（`--xxx`）", () => {
    const t = sanitizeDetailTheme({
      vars: { background: "#fff", "--ok-1": "#fff", "--bad name": "#fff" },
    });
    expect(Object.keys(t!.vars)).toEqual(["--ok-1"]);
  });

  it("空 / 非法载荷 → null（调用方据此「什么都不注入」，页面保持原样）", () => {
    expect(sanitizeDetailTheme(null)).toBeNull();
    expect(sanitizeDetailTheme({})).toBeNull();
    expect(sanitizeDetailTheme({ vars: {} })).toBeNull();
    expect(sanitizeDetailTheme({ vars: "字符串" })).toBeNull();
    // 有值但全被过滤掉 → 也是 null（别注入一个空的 :root）
    expect(sanitizeDetailTheme({ vars: { "--x": "; ;" } })).toBeNull();
    // 超长值丢掉（防止有人在值里塞一大坨东西）
    expect(sanitizeDetailTheme({ vars: { "--x": "a".repeat(500) } })).toBeNull();
  });

  it("setDetailTheme / getDetailTheme：存一份给服务器发页面时读", () => {
    expect(setDetailTheme({ vars: VARS, dark: true })).toBe(true);
    expect(getDetailTheme()!.vars["--accent"]).toBe("#2d7ff9");
    // 送来一份空的 → 清掉（页面回到原生颜色），而不是留着上一份旧主题
    expect(setDetailTheme({ vars: {} })).toBe(false);
    expect(getDetailTheme()).toBeNull();
  });
});

describe("buildDetailThemeStyle", () => {
  it("没有主题 → 空串（等于什么都不做）", () => {
    expect(buildDetailThemeStyle(null)).toBe("");
  });

  it("把变量写进 :root，并带上 color-scheme（系统绘制的滚动条/控件也跟着选深浅）", () => {
    const css = buildDetailThemeStyle({ vars: VARS, dark: true });
    expect(css).toContain(`id="${THEME_STYLE_ID}"`);
    expect(css).toContain("--bg-base:#171a1f");
    expect(css).toContain("color-scheme:dark");
    // 浅色主题反过来
    expect(buildDetailThemeStyle({ vars: VARS, dark: false })).toContain("color-scheme:light");
  });

  it("覆盖的是页面自己的那批选择器（白底卡片、深蓝顶栏、标签…）", () => {
    const css = buildDetailThemeStyle({ vars: VARS, dark: true });
    // 卡片：原样式是白底 + 极浅投影，深色下投影看不见 → 改成面板色 + 描边 + 去投影
    expect(css).toContain(".hero, .section { background: var(--bg-panel);");
    expect(css).toContain("box-shadow: none;");
    // 正文与链接
    expect(css).toContain("html, body { background: var(--bg-base); color: var(--text-primary); }");
    expect(css).toContain("a { color: var(--accent-hover); }");
    // 顶部返回条、卡片小标题的左侧色条
    expect(css).toContain(".topbar {");
    expect(css).toContain(".section h2 { color: var(--text-primary); border-left-color: var(--accent); }");
    // 只动颜色 —— 不许出现布局属性（改版式就是拿 1000+ 个没看过的页面去赌）
    expect(css).not.toContain("display:");
    expect(css).not.toContain("font-size:");
    expect(css).not.toContain("margin");
  });
});

describe("injectDetailTheme", () => {
  const style = buildDetailThemeStyle({ vars: VARS, dark: true });

  it("插在 </head> 之前 —— 必须在页面自己的样式表**之后**，否则同优先级会被它盖掉", () => {
    const out = injectDetailTheme(PAGE, style);
    expect(out.indexOf(style)).toBeGreaterThan(out.indexOf('href="css/style.css"'));
    expect(out.indexOf(style)).toBeLessThan(out.indexOf("</head>"));
    // 页面内容一个字节都不能动
    expect(out).toContain('<h2>游戏简介</h2>');
  });

  it("幂等：重复注入不会出现第二个 style", () => {
    const once = injectDetailTheme(PAGE, style);
    const twice = injectDetailTheme(once, style);
    expect(twice).toBe(once);
    expect((twice.match(new RegExp(`id="${THEME_STYLE_ID}"`, "g")) ?? []).length).toBe(1);
  });

  it("空样式 = 原样返回（没主题时服务器走的就是这条）", () => {
    expect(injectDetailTheme(PAGE, "")).toBe(PAGE);
  });

  it("畸形页面（没有 head）：退到 body 开标签后面，至少别丢样式", () => {
    const bare = '<html><body class="x"><p>hi</p></body></html>';
    const out = injectDetailTheme(bare, style);
    expect(out.indexOf(style)).toBeGreaterThan(out.indexOf("<body"));
    expect(out).toContain("<p>hi</p>");
    // 连 body 都没有 → 挂最前面
    expect(injectDetailTheme("<p>hi</p>", style).startsWith(style)).toBe(true);
  });
});
