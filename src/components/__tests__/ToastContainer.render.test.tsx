// ToastContainer 的定位回归测试。
//
// 需求来自实际反馈：游戏启动失败时，提示原来在**左下角**，玩家刚点完"开始游戏"
// 视线在屏幕中部，很容易被忽略 —— 表现就像"点了没反应"。现在要求在**最上面**显示、
// 5 秒后自动关闭。
//
// 这个测试只钉住"渲染在顶部"（用 renderToString，不跑 effect）：
// 断言容器带顶部定位类、且不再带旧的底部定位类。挪回去就会被测出来。
// （"5 秒自动关闭"由 TOAST_MS 常量控制，属于行为，需要真实计时环境，这里不测。）
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import ToastContainer from "../ToastContainer";

describe("ToastContainer 定位", () => {
  it("渲染在顶部中央，而不是底部角落", () => {
    const html = renderToString(<ToastContainer />);
    expect(html).toContain("top-[64px]"); // 顶部，且在"正在启动"横幅（top:14px）之下
    expect(html).toContain("left-1/2");
    expect(html).not.toContain("bottom-[18px]"); // 旧位置，别退回去
    expect(html).not.toContain("right-[18px]");
  });

  it("不拦截鼠标事件（纯通知，不该挡住下面的搜索框/按钮）", () => {
    const html = renderToString(<ToastContainer />);
    expect(html).toContain("pointer-events-none");
  });
});
