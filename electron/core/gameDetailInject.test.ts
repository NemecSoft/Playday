// 详情页视频区块注入的"可执行说明"。实现：electron/core/gameDetailInject.ts
// 覆盖三件最容易出错的事：分组（根 vs 子目录）、转义（文件名里的特殊字符）、
// 注入点（必须插进页面自己的 .container 里，否则宽度与上面的卡片对不齐）。
import { describe, expect, it } from "vitest";
import {
  VIDEO_SECTION_ID,
  buildVideoSection,
  injectVideoSection,
  labelsFor,
} from "./gameDetailInject";
import type { VideoScan } from "./videoLibrary";

/** 一份"长得像真实详情页"的样板：container 里两个 section + 嵌套 div。 */
const PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>x</title></head>
<body>
<div class="topbar"><div class="topbar-inner"><span>游戏库</span></div></div>
<div class="container">
  <div class="hero"><div class="hero-info"><h1>游戏</h1></div></div>
  <div class="section"><h2>游戏简介</h2><p>hi</p></div>
  <div class="section"><h2>版本信息</h2><table><tr><td>版本</td><td>v1</td></tr></table></div>
</div>
<div class="lightbox" id="lightbox"></div>
</body>
</html>`;

const scanWithDirs: VideoScan = {
  root: ["星际争霸 解冻vs禽兽.mp4"],
  dirs: [{ name: "实况", files: ["实况/第1期.mp4", "实况/第10期.mp4"] }],
};

/** 数一数"当前位置之前"还没闭合的 div 个数（用来判定嵌套层级）。 */
function divDepthAt(html: string, index: number): number {
  const before = html.slice(0, index);
  const opens = (before.match(/<div\b[^>]*>/gi) ?? []).length;
  const closes = (before.match(/<\/div\s*>/gi) ?? []).length;
  return opens - closes;
}

describe("labelsFor：文案按语言取，认不出来一律回退中文", () => {
  it("三种已知语言", () => {
    expect(labelsFor("zh-CN").title).toBe("游戏视频");
    expect(labelsFor("zh-TW").title).toBe("遊戲影片");
    expect(labelsFor("en").title).toBe("Game videos");
  });

  it("带地区码 / 大小写 / 空值都不会崩（en-US → en，其余 → zh-CN）", () => {
    expect(labelsFor("en-US").title).toBe("Game videos");
    expect(labelsFor(undefined).title).toBe("游戏视频");
    expect(labelsFor("").title).toBe("游戏视频");
    expect(labelsFor("ja").title).toBe("游戏视频");
  });
});

describe("buildVideoSection：没有视频就什么都不注入", () => {
  it("空扫描结果 → 空串（调用方据此原样发页面）", () => {
    expect(buildVideoSection({ scan: { root: [], dirs: [] } })).toBe("");
    expect(buildVideoSection({ scan: { root: [], dirs: [{ name: "空", files: [] }] } })).toBe("");
  });
});

describe("buildVideoSection：按子目录分组", () => {
  it("根目录的视频不分组名，子目录的各自带小标题", () => {
    const html = buildVideoSection({ scan: scanWithDirs, lang: "zh-CN" });
    expect(html).toContain(`id="${VIDEO_SECTION_ID}"`);
    expect(html).toContain("实况"); // 组标题 = 目录名
    expect(html).toContain("星际争霸 解冻vs禽兽.mp4");
    expect(html).toContain("第1期.mp4");
    // 根目录那组不带 h3（否则会凭空多出个"未分组"的标题）。
    // 注意只数**元素**：这些类名在注入的 <style> 里也各出现一次。
    expect((html.match(/class="yungame-video-group-title"/g) ?? []).length).toBe(1);
  });

  it("用相对路径 + 逐段编码（空格/中文都不能裸着放进 src）", () => {
    const html = buildVideoSection({ scan: scanWithDirs });
    expect(html).toContain('data-src="videos/%E5%AE%9E%E5%86%B5/%E7%AC%AC1%E6%9C%9F.mp4"');
    expect(html).not.toContain('src="videos/实况/第1期.mp4"');
  });

  it("放不了的封装（mkv/flv/avi）标注外部播放器，mp4 不标", () => {
    const html = buildVideoSection({
      scan: { root: ["a.mp4", "b.mkv"], dirs: [] },
    });
    expect(html).toContain('data-rel="a.mp4" data-external="0"');
    expect(html).toContain('data-rel="b.mkv" data-external="1"');
    // 徽章只给放不了的那个（同上：只数元素）
    expect((html.match(/class="yungame-video-badge"/g) ?? []).length).toBe(1);
  });

  it("文件名里的 < > & \" 必须转义（否则会破坏页面结构 / 被当成标签）", () => {
    const html = buildVideoSection({ scan: { root: ['<img src=x onerror=alert(1)>.mp4'], dirs: [] } });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;.mp4");
    expect(html).toContain('data-rel="&lt;img src=x onerror=alert(1)&gt;.mp4"');
  });
});

// 内置播放器的约定：2026-09-14 换成 DPlayer（随包发布，见 vendor/README.md）。
// 它自带"页面全屏 + 全屏"并排按钮、**没有下载项**；网页全屏的定位由我们接管。
// 这些约定都容易被"顺手改回去"，所以按可执行规格钉住：断言直接落在注入出去的 HTML/脚本串上。
describe("内置播放器：DPlayer + 我们接管的网页全屏", () => {
  const html = (lang = "zh-CN") => buildVideoSection({ scan: { root: ["1.mp4"], dirs: [] }, lang });

  it("引了随包的 DPlayer，且是同源绝对路径（相对路径会解析到游戏目录里去）", () => {
    const out = html();
    expect(out).toContain('<script src="/vendor/DPlayer.min.js"></script>');
    expect(out).toContain("new DPlayer(");
    // 本地视频用不到的控件由 CSS 藏掉：发弹幕 / 弹幕设置 / 无线投屏。
    expect(out).toContain(".dplayer-send-icon");
    expect(out).toContain(".dplayer-comment-setting-icon");
    expect(out).toContain(".dplayer-airplay-icon");
  });

  it("不再自己画控件，也没有「宽屏」那档（用户 2026-09-14 明确去掉）", () => {
    const out = html();
    expect(out).not.toContain("宽屏");
    expect(out).not.toContain("is-wide");
    expect(out).not.toContain("yungame-video-pagefull"); // 自建按钮已删：DPlayer 自带两个
  });

  it("网页全屏：借 DPlayer 的事件，搬到挂在 body 上的覆盖层（别改回让它自己 fixed）", () => {
    const out = html();
    // 真引擎实测：DPlayer 自己的做法是给 body 加 .dplayer-web-fullscreen-fix（fixed），
    // 模板里一旦有祖先带 transform，播放器就只有 550x482 而不是窗口 1200x800。
    // 覆盖层的祖先只有 body，绕开这一整类坑。
    expect(out).toContain('dp.on("webfullscreen"');
    expect(out).toContain('dp.on("webfullscreen_cancel"');
    expect(out).toContain("yungame-player-overlay");
    expect(out).toContain("document.body.appendChild");
    expect(out).toContain("yungame-lock-scroll"); // 进覆盖层时锁页面滚动
    expect(out).toContain("dplayer-web-fullscreen-fix"); // 销毁时兜底清掉它，免得整页变 fixed
    // 播放器内部的点击不能被当成"点卡片"把播放器关掉（DPlayer 用点击切播放/暂停）。
    expect(out).toContain('t.closest(".yungame-video-player")');
  });

  it("DPlayer 没加载成功时退回原生 <video controls>（少两个按钮，但不能什么都不出来）", () => {
    const out = html();
    expect(out).toContain('typeof DPlayer !== "function"');
    expect(out).toContain('setAttribute("controlsList", "nodownload")');
  });

  it("两个全屏键并排常显：只改它自己，别碰父容器（改父容器会让齿轮错位）", () => {
    const out = html();
    // DPlayer 默认给 .dplayer-full-in-icon 加了 position:absolute / top:-30px / display:none
    // —— 悬停全屏键才浮出来，还飘在它上方。用户要的是两个键并排、一直看得见，所以有这段覆盖：
    // 只把 display/position 改回行内流（DOM 顺序本就是"页面全屏"在前 → 自然排在"全屏"左边）。
    expect(out).toContain(
      ".yungame-video-player .dplayer-full-in-icon { display: inline-block !important; position: static !important; }",
    );
    // 反向守卫：别顺手把父容器 .dplayer-full 改成 flex —— 实测会让旁边的「设置」齿轮错位 6px
    //（齿轮 y=743/底 781，两个全屏键 y=737/底 775），用户报的"三个按钮高度不一致"就是这个。
    expect(out).not.toContain(".dplayer-full { display: inline-flex");
  });

  it("播放器界面语言跟着页面语言走（用 DPlayer 的键名，不是我们的 zh-CN）", () => {
    expect(html("zh-CN")).toContain('"playerLang":"zh-cn"');
    expect(html("zh-TW")).toContain('"playerLang":"zh-tw"');
    expect(html("en")).toContain('"playerLang":"en"');
  });

  it("注入的脚本本身能解析（它藏在字符串里，语法错会在用户页面里静默炸掉）", () => {
    // 这一条是本文件里唯一"防手滑"的兜底：注入脚本是模板串拼出来的，tsc / eslint
    // 都看不见它内部的语法错误 —— 一旦写错，表现是"整个视频区块不工作"，
    // 而控制台只在那个 iframe 里报错，排查代价很高。
    const out = buildVideoSection({ scan: { root: ["1.mp4"], dirs: [] }, lang: "zh-CN" });
    const m = /<script>([\s\S]*?)<\/script>/.exec(out);
    expect(m).not.toBeNull();
    // new Function 只做语法解析、不执行（注入脚本里没有顶层 await）。
    expect(() => new Function(m![1] as string)).not.toThrow();
  });
});

describe("buildVideoSection：预览封面（同名图片优先，否则留给页面抓帧）", () => {
  it("有同名图片 → 卡片带 has-poster 且 img 直接给 src（页面不用再抓帧）", () => {
    const html = buildVideoSection({
      scan: { root: ["1.mp4"], dirs: [] },
      posterFor: (rel) => (rel === "1.mp4" ? "1.jpg" : null),
    });
    expect(html).toContain('class="yungame-video-card has-poster"');
    expect(html).toContain('<img class="yungame-video-poster" src="videos/1.jpg" alt="">');
  });

  it("没有同名图片 → 不带 has-poster、img 也没有 src（由页面脚本抓一帧回填）", () => {
    const html = buildVideoSection({ scan: { root: ["1.mp4"], dirs: [] } });
    expect(html).not.toContain('class="yungame-video-card has-poster"');
    expect(html).toContain('<img class="yungame-video-poster" alt="">');
  });

  it("封面图路径里的中文与空格同样要逐段编码", () => {
    const html = buildVideoSection({
      scan: { root: ["实况/第1期.mp4"], dirs: [] },
      posterFor: () => "实况/第1期 封面.jpg",
    });
    expect(html).toContain(
      'src="videos/%E5%AE%9E%E5%86%B5/%E7%AC%AC1%E6%9C%9F%20%E5%B0%81%E9%9D%A2.jpg"'
    );
  });
});

describe("injectVideoSection：插进页面自己的 container 里", () => {
  const section = buildVideoSection({ scan: scanWithDirs, lang: "zh-CN" });

  it("落在 .container 内部（与上面的卡片同宽、同留白），不是甩到 body 末尾", () => {
    const out = injectVideoSection(PAGE, section);
    const iSection = out.indexOf(`id="${VIDEO_SECTION_ID}"`);
    expect(iSection).toBeGreaterThan(out.indexOf("版本信息")); // 排在其他 section 后面
    expect(iSection).toBeLessThan(out.indexOf('class="lightbox"')); // 但仍在 container 内
    // 嵌套层级 = container 的直接子节点（1 层），说明没跑到容器外面
    expect(divDepthAt(out, iSection)).toBe(1);
  });

  it("幂等：重复注入不会出现第二个区块", () => {
    const once = injectVideoSection(PAGE, section);
    const twice = injectVideoSection(once, section);
    expect((twice.match(new RegExp(`id="${VIDEO_SECTION_ID}"`, "g")) ?? []).length).toBe(1);
    expect(twice).toBe(once);
  });

  it("没有视频（section 为空）→ 页面原样返回", () => {
    expect(injectVideoSection(PAGE, "")).toBe(PAGE);
  });

  it("页面没有 .container → 自己补一层，塞在 </body> 前", () => {
    const bare = "<html><body><h1>hi</h1></body></html>";
    const out = injectVideoSection(bare, section);
    expect(out).toContain('class="container" style="padding-top:0"');
    expect(out.indexOf(VIDEO_SECTION_ID)).toBeLessThan(out.indexOf("</body>"));
  });

  it("连 </body> 都没有 → 追加到末尾（宁可难看，也不能丢内容）", () => {
    const out = injectVideoSection("<h1>hi</h1>", section);
    expect(out.startsWith("<h1>hi</h1>")).toBe(true);
    expect(out).toContain(VIDEO_SECTION_ID);
  });

  it("</BODY> 大写也认（模板大小写不统一时不至于注入失败）", () => {
    const out = injectVideoSection("<html><BODY><p>x</p></BODY></html>", section);
    expect(out).toContain(VIDEO_SECTION_ID);
    expect(out.indexOf(VIDEO_SECTION_ID)).toBeLessThan(out.toUpperCase().indexOf("</BODY>"));
  });
});
