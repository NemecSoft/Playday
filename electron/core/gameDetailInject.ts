// 把「游戏视频」区块注入到每个游戏的静态详情页里（**服务端注入，不改磁盘上的文件**）。
//
// 需求：视频丢进 <详情根>/<游戏名>/videos/ 后，要在详情页**页面内往下罗列**出来；
// 有子目录就按子目录分组；样式像 bilibili 那样是"卡片网格 + 预览封面"。
//
// 为什么必须注入 HTML、而不是前端 React 渲染：详情页是 iframe 里的独立静态页面，
// 与主界面**跨源**，父页面塞不进 DOM；而这个页面本来就由本地 HTTP 服务器托管 ——
// 在"发文件"这一步做手脚最省事，也不需要爬虫/模板那边配合（它们的 index.html 不用改）。
//
// 注入点：优先插进页面自己那个 `.container` 的**内部末尾**（排在所有 .section 之后）。
// 为什么不直接放在 </body> 前：那样会跑到页面的居中容器之外 —— 宽度、左右留白全对不上，
// 视频区块会顶满整个窗口、和上面的卡片错位。放在 container 里就自动继承它的宽度与间距。
// 找不到 container（模板不一样）时依次退到 </body> 前、文件末尾。
//
// 封面（预览图）怎么来 —— 三级，谁先有就用谁：
//   ① 与视频**同名的图片**（`1.mp4` 旁边的 `1.jpg/.jpeg/.png/.webp`）→ 服务端直接给 src；
//   ② 没有同名图片 → 页面里由脚本**就地抓视频的一帧**（`<video>` + canvas，同一来源不脏画布）；
//   ③ 抓不到（编码不支持 / 元数据读不出）→ 保持深色占位块 + 播放按钮，不影响点开播放。
// 为什么不抽帧交给 ffmpeg：本项目零原生依赖（绿色打包），而"抓一帧"浏览器自己就会。
//
// 本模块只做字符串处理（不读文件、不碰 http），便于单测（见 gameDetailInject.test.ts）。
// 需要读磁盘的部分（找同名封面图）由调用方以 `posterFor` 回调注入。

import { isWebPlayable, type VideoScan } from "./videoLibrary";

/** 注入区块的 DOM id（同时用于"防重复注入"）。 */
export const VIDEO_SECTION_ID = "yungame-videos";

export interface VideoSectionLabels {
  /** 区块标题 */
  title: string;
  play: string;
  /** 内置播放器放不了的封装的标注 */
  external: string;
  /** 收起播放器 */
  collapse: string;
}

/**
 * 注入内容用的文案（服务端一份小表）。
 * 为什么不读 locales/*.json：那是**渲染层**的翻译文件，打包时被 vite 编进前端 bundle，
 * 主进程运行期并不一定能从磁盘上读到它们。这里只影响注入的静态 HTML，
 * 语言由前端拼 URL 时带上（`?lang=`），保证与界面一致。
 */
const LABELS: Record<string, VideoSectionLabels> = {
  "zh-CN": {
    title: "游戏视频",
    play: "播放",
    external: "可能需外部播放器",
    collapse: "收起",
  },
  "zh-TW": {
    title: "遊戲影片",
    play: "播放",
    external: "可能需外部播放器",
    collapse: "收合",
  },
  en: {
    title: "Game videos",
    play: "Play",
    external: "May need an external player",
    collapse: "Collapse",
  },
};

/** 按语言取文案（认不出来一律回退中文，绝不返回 undefined）。 */
export function labelsFor(lang: string | null | undefined): VideoSectionLabels {
  const raw = String(lang ?? "").trim();
  if (LABELS[raw]) return LABELS[raw];
  const head = raw.split(/[-_]/)[0].toLowerCase();
  return LABELS[head] ?? LABELS["zh-CN"];
}

/** HTML 文本转义（文件名里可能有 `<`、`&`、引号 —— 不能用字符串拼出标签）。 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 相对视频目录的路径 → 可放进 `src` 的 URL（逐段编码）。
 * 用**相对路径**（`videos/xxx`）而不是绝对路径：详情页地址是 `/games/<目录名>/index.html`，
 * 相对路径会自动解析成 `/games/<目录名>/videos/xxx`，于是"目录名到底是 id 还是游戏名"
 * 这件事不用在这里再判断一次。
 */
function encodeRel(rel: string): string {
  return rel.split("/").map(encodeURIComponent).join("/");
}

/** 一张视频卡片（bilibili 那种：上面预览封面 + 右下角时长，下面标题）。 */
function videoCard(
  rel: string,
  labels: VideoSectionLabels,
  posterRel: string | null
): string {
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  const playable = isWebPlayable(rel);
  const classes = `yungame-video-card${posterRel ? " has-poster" : ""}`;
  return [
    `<div class="${classes}" data-src="videos/${esc(encodeRel(rel))}" data-rel="${esc(rel)}" data-external="${playable ? 0 : 1}">`,
    `<div class="yungame-video-thumb">`,
    // 有同名封面图就直接给 src；没有的话留空，由页面脚本抓一帧回填（has-poster 控制显隐）。
    `<img class="yungame-video-poster"${posterRel ? ` src="videos/${esc(encodeRel(posterRel))}"` : ""} alt="">`,
    `<span class="yungame-video-play">▶</span>`,
    `<span class="yungame-video-dur"></span>`,
    playable ? "" : `<span class="yungame-video-badge">${esc(labels.external)}</span>`,
    `</div>`,
    `<div class="yungame-video-meta">`,
    `<span class="yungame-video-title">${esc(name)}</span>`,
    `<button type="button" class="yungame-video-collapse">${esc(labels.collapse)}</button>`,
    `</div>`,
    `</div>`,
  ].join("");
}

/** 一个分组（子目录）：有名字就带小标题，根目录那组不带标题。 */
function videoGroup(
  title: string | null,
  rels: string[],
  labels: VideoSectionLabels,
  posterFor: (rel: string) => string | null
): string {
  if (rels.length === 0) return "";
  return [
    `<div class="yungame-video-group">`,
    title ? `<h3 class="yungame-video-group-title">${esc(title)}</h3>` : "",
    `<div class="yungame-video-grid">`,
    ...rels.map((rel) => videoCard(rel, labels, posterFor(rel))),
    `</div></div>`,
  ].join("");
}

/** 区块的样式（只补视频相关的部分；外壳与卡片沿用页面自己的 .section 样式）。 */
const SECTION_CSS = `<style>
.yungame-videos .yungame-video-group { margin-top: 18px; }
.yungame-videos .yungame-video-group:first-of-type { margin-top: 0; }
.yungame-videos .yungame-video-group-title { font-size: 15px; font-weight: 600; color: #555; margin: 0 0 10px; padding-left: 8px; border-left: 3px solid #c7d2fe; }
.yungame-videos .yungame-video-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
.yungame-videos .yungame-video-card { background: #fff; border: 1px solid #e6e8ee; border-radius: 10px; overflow: hidden; cursor: pointer; transition: box-shadow .15s, transform .15s; }
.yungame-videos .yungame-video-card:hover { box-shadow: 0 6px 18px rgba(0,0,0,.12); transform: translateY(-2px); }
.yungame-videos .yungame-video-thumb { position: relative; width: 100%; aspect-ratio: 16/9; background: linear-gradient(135deg, #1f2937, #4b5563); overflow: hidden; }
.yungame-videos .yungame-video-poster { display: none; width: 100%; height: 100%; object-fit: cover; }
.yungame-videos .yungame-video-card.has-poster .yungame-video-poster { display: block; }
.yungame-videos .yungame-video-play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,.55); opacity: .92; }
.yungame-videos .yungame-video-card:hover .yungame-video-play { opacity: 1; }
.yungame-videos .yungame-video-dur { position: absolute; right: 6px; bottom: 6px; padding: 1px 5px; border-radius: 4px; background: rgba(0,0,0,.72); color: #fff; font-size: 12px; line-height: 1.5; }
.yungame-videos .yungame-video-dur:empty { display: none; }
.yungame-videos .yungame-video-badge { position: absolute; left: 6px; top: 6px; padding: 1px 6px; border-radius: 4px; background: rgba(254,243,199,.95); color: #92400e; font-size: 12px; }
.yungame-videos .yungame-video-meta { display: flex; align-items: flex-start; gap: 6px; padding: 9px 10px 11px; }
.yungame-videos .yungame-video-title { flex: 1; min-width: 0; font-size: 13px; line-height: 1.5; color: #222; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-all; }
.yungame-videos .yungame-video-collapse { display: none; flex: 0 0 auto; padding: 0; border: 0; background: none; color: #2b6cb0; font-size: 12px; cursor: pointer; }
.yungame-videos .yungame-video-card.is-open { grid-column: 1 / -1; }
.yungame-videos .yungame-video-card.is-open .yungame-video-collapse { display: inline; }
.yungame-videos .yungame-video-card.is-open .yungame-video-thumb { aspect-ratio: auto; background: #000; }
.yungame-videos .yungame-video-card.is-open .yungame-video-poster,
.yungame-videos .yungame-video-card.is-open .yungame-video-play,
.yungame-videos .yungame-video-card.is-open .yungame-video-dur,
.yungame-videos .yungame-video-card.is-open .yungame-video-badge { display: none; }
.yungame-videos video { display: block; width: 100%; max-height: 62vh; background: #000; }
</style>`;

/**
 * 区块脚本：找同名封面图不需要脚本；这里做三件事 ——
 *   ① 抓视频首帧当预览封面（没有同名图片时）+ 顺手把时长填进角标；
 *   ② 点卡片就地展开播放器（同一时刻只放一个），再点收起；
 *   ③ 把播放状态 postMessage 给主界面（跨源 iframe 父页面收不到 <video> 事件）。
 */
function sectionScript(labels: VideoSectionLabels): string {
  const L = JSON.stringify({ collapse: labels.collapse });
  return `<script>
(function () {
  var root = document.getElementById("${VIDEO_SECTION_ID}");
  if (!root || root.getAttribute("data-ready") === "1") return;
  root.setAttribute("data-ready", "1");
  var L = ${L};

  function post(type, extra) {
    try {
      var m = { type: type };
      if (extra) for (var k in extra) m[k] = extra[k];
      parent.postMessage(m, "*");
    } catch (e) {}
  }
  function allVideos() { return root.getElementsByTagName("video"); }
  function pauseOthers(cur) {
    var vs = allVideos();
    for (var i = 0; i < vs.length; i++) if (vs[i] !== cur && !vs[i].paused) vs[i].pause();
  }
  function el(card, cls) { return card.getElementsByClassName(cls)[0] || null; }
  function cardOf(node) {
    return node && node.closest ? node.closest(".yungame-video-card") : null;
  }
  // 秒 → 3:07 / 1:02:33（注入的页面里跑，用不了 src/utils/clock.ts，所以这里自带一份）
  function fmt(sec) {
    if (!isFinite(sec) || sec <= 0) return "";
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = (h > 0 && m < 10 ? "0" : "") + m;
    var ss = (s < 10 ? "0" : "") + s;
    return (h > 0 ? h + ":" : "") + mm + ":" + ss;
  }

  function closeCard(card) {
    var v = card.getElementsByTagName("video")[0];
    if (v) {
      // 先显式暂停：直接摘掉 <video> 不一定触发 pause，
      // 那样父页面收不到停止通知、背景音乐就一直停着（用户会以为音乐坏了）。
      if (!v.paused) v.pause();
      if (v.parentNode) v.parentNode.removeChild(v);
    }
    card.classList.remove("is-open");
  }
  function openCard(card) {
    var v = document.createElement("video");
    v.controls = true;
    v.autoplay = true;
    v.preload = "metadata";
    v.setAttribute("playsinline", "");
    v.src = card.getAttribute("data-src");
    v.addEventListener("play", function () { pauseOthers(v); post("playday-video-play"); });
    v.addEventListener("pause", function () { post("playday-video-stop"); });
    v.addEventListener("ended", function () { post("playday-video-stop"); });
    el(card, "yungame-video-thumb").appendChild(v);
    card.classList.add("is-open");
  }

  root.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.closest && t.closest(".yungame-video-collapse")) {
      var c = cardOf(t);
      if (c) closeCard(c);
      return;
    }
    var card = cardOf(t);
    if (!card) return;
    if (card.classList.contains("is-open")) { closeCard(card); return; }
    // 内置播放器解不了的封装（mkv/flv/avi…）：请主界面用系统播放器打开
    if (card.getAttribute("data-external") === "1") {
      post("playday-video-external", { rel: card.getAttribute("data-rel") });
      return;
    }
    openCard(card);
  });

  // —— 预览封面：没有同名图片的，就地抓视频的一帧 ——
  // 同一来源（都是本地服务器）→ 画布不会被污染，toDataURL 可用。
  // 逐个来（队列 + setTimeout），避免一次开几十个视频连接把服务器打满。
  function grab(card) {
    var probe = document.createElement("video");
    probe.muted = true;
    probe.preload = "metadata";
    probe.setAttribute("playsinline", "");
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      // 释放探针：不释放的话每个视频都会常驻一个已加载元数据的 <video>
      try { probe.removeAttribute("src"); probe.load(); } catch (e) {}
    }
    probe.addEventListener("loadedmetadata", function () {
      var dur = probe.duration;
      var badge = el(card, "yungame-video-dur");
      if (badge && isFinite(dur) && dur > 0) badge.textContent = fmt(dur);
      var seekTo = isFinite(dur) && dur > 0 ? Math.min(10, Math.max(1, dur * 0.1)) : 1;
      try { probe.currentTime = seekTo; } catch (e) { finish(); }
    });
    probe.addEventListener("seeked", function () {
      try {
        var vw = probe.videoWidth || 640;
        var vh = probe.videoHeight || Math.round((vw * 9) / 16);
        var cw = 480;
        var ch = Math.max(1, Math.round((cw * vh) / vw));
        var canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        canvas.getContext("2d").drawImage(probe, 0, 0, cw, ch);
        var poster = el(card, "yungame-video-poster");
        if (poster) poster.src = canvas.toDataURL("image/jpeg", 0.72);
        card.className += " has-poster";
      } catch (e) {}
      finish();
    });
    probe.addEventListener("error", finish);
    probe.src = card.getAttribute("data-src");
  }
  (function () {
    var queue = [];
    var cards = root.getElementsByClassName("yungame-video-card");
    for (var i = 0; i < cards.length; i++) {
      // 放不了的封装抽不出帧；已经有同名封面图的也不用抓
      if (cards[i].getAttribute("data-external") === "1") continue;
      if (cards[i].className.indexOf("has-poster") >= 0) continue;
      queue.push(cards[i]);
    }
    function step() {
      if (queue.length === 0) return;
      grab(queue.shift());
      if (queue.length) window.setTimeout(step, 60);
    }
    step();
  })();

  // 主界面顶栏的「视频」按钮 → 滚到这里（父页面滚不了 iframe 里的内容，只能请它自己滚）
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (d && d.type === "playday-scroll-to-videos") {
      try { root.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (err) { root.scrollIntoView(); }
    }
  });
})();
</script>`;
}

/**
 * 生成要注入的区块（没有视频时返回空串 —— 调用方据此原样发页面，等于什么都没做）。
 * 链接用相对路径，所以不需要知道"命中的目录名是 id 还是游戏名"。
 *
 * @param posterFor 找"与某条视频同名的封面图"，返回**相对 videos 目录**的路径或 null。
 *                  由调用方注入（它才有磁盘访问；本模块保持纯字符串处理便于单测）。
 */
export function buildVideoSection(opts: {
  scan: VideoScan;
  lang?: string | null;
  posterFor?: (rel: string) => string | null;
}): string {
  const { scan } = opts;
  if (!scan || (scan.root.length === 0 && scan.dirs.length === 0)) return "";
  const labels = labelsFor(opts.lang);
  const posterFor = opts.posterFor ?? (() => null);
  const groups = [
    videoGroup(null, scan.root, labels, posterFor), // 直接放在 videos/ 下的：不分组名
    ...scan.dirs.map((d) => videoGroup(d.name, d.files, labels, posterFor)),
  ].join("");
  if (!groups) return "";
  return [
    SECTION_CSS,
    `<section class="section yungame-videos" id="${VIDEO_SECTION_ID}">`,
    `<h2>${esc(labels.title)}</h2>`,
    groups,
    `</section>`,
    sectionScript(labels),
  ].join("");
}

/** 找到 `class="container"` 那个 div 的**闭合标签**位置（返回插入点索引）；找不到返回 -1。 */
function findContainerInsertIndex(html: string): number {
  const open = /<div[^>]*class="[^"]*\bcontainer\b[^"]*"[^>]*>/i.exec(html);
  if (!open) return -1;
  const tagRe = /<div\b[^>]*>|<\/div\s*>/gi;
  tagRe.lastIndex = open.index + open[0].length;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    if (m[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return m.index;
    } else {
      depth += 1;
    }
  }
  return -1;
}

/**
 * 把区块注入到页面里（幂等：已注入过就不再插第二遍）。
 * 三级退路：container 末尾 → </body> 前（补一层 container 保持宽度一致）→ 文件末尾。
 */
export function injectVideoSection(html: string, section: string): string {
  if (!section) return html;
  if (html.includes(`id="${VIDEO_SECTION_ID}"`)) return html;
  const at = findContainerInsertIndex(html);
  if (at >= 0) return html.slice(0, at) + section + html.slice(at);
  const lower = html.toLowerCase();
  const bodyEnd = lower.lastIndexOf("</body>");
  if (bodyEnd >= 0) {
    // 页面没有 .container 时：自己补一层同名的，宽度至少不会顶满窗口。
    const wrapped = `<div class="container" style="padding-top:0">${section}</div>`;
    return html.slice(0, bodyEnd) + wrapped + html.slice(bodyEnd);
  }
  return html + section;
}
