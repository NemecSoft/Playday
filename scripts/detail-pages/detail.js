/* ============================================================
   游戏详情页 · 渲染器（生成页专用，跑在页面里）
   配套：shell.html（骨架，服务器往里塞 window.__GAME__）、detail.css（6 套版面）

   为什么改成客户端渲染（2026-09-18 用户）：
     "不要直接生成1285个页面，而是根据数据和框架，每次动态生成。不然，我加一个游戏，
      又要你写一遍页面。"
   所以：服务器只负责"把这一行游戏数据塞进壳页"，版面由这里画。
   好处：加游戏什么都不用跑；改 CSS/渲染器立刻全站生效；桌面端与网站端同一套行为。

   数据来源：window.__GAME__（服务器注入；字段见 scripts/detail-pages/README 或生成器注释）
   视频：**不由这里生成** —— 服务器注入的 #yungame-videos 会落在 .container 末尾，
        这里把它搬进"游戏视频"面板。
   ============================================================ */
(function () {
  var G = window.__GAME__;
  if (!G || !G.name) return;

  // 版面**只有一套**（2026-09-18 用户定版）：左右分栏英雄区（封面 + 说明）+ 下方选项卡
  // （图片 / 视频 / 其他）。之前那 7 套候选（含上下通排）已在 CSS 里删掉 —— 见 detail.css 顶部说明。
  var root = document.getElementById("dp-root");
  if (!root) return;

  /* ---------- 0. 被嵌进 iframe 时，不显示页面自带的顶栏 ----------
     2026-09-18 用户："详情页，不要游戏库，返回全部游戏了。"
     理由：在应用里这是**重复导航** —— 应用自己有返回、有游戏标签，页面再挂一条"游戏库 · 返回全部游戏"
     就是噪音。但同一份页面在**网站端单独打开**时（浏览器直接访问），那条返回链接是必要的导航，
     所以要按"有没有被嵌"来区分，而不是一刀切删掉。
     判据：window.self !== window.top = 自己在 iframe 里。 */
  var embedded = false;
  try {
    embedded = window.self !== window.top;
  } catch (e) {
    embedded = true; // 跨源访问 top 会抛错 = 一定在 iframe 里
  }
  if (embedded) document.documentElement.classList.add("dp-embedded");

  var esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };
  var enc = function (s) {
    return String(s).split("/").map(encodeURIComponent).join("/");
  };

  /* ---------- 1. 数据整理 ---------- */
  var join = function (v) {
    return (v || []).filter(Boolean).join(" / ");
  };
  var meta = [
    ["版本", G.version || ""],
    ["发行时间", G.releaseDate || ""],
    ["地区", join(G.region)],
    ["平台", join(G.platform)],
    ["类型", join(G.genre)],
    ["系列", join(G.series)],
    ["开发商", join(G.developer)],
    ["发行商", join(G.publisher)],
  ].filter(function (kv) {
    return String(kv[1]).trim() !== "";
  });
  var tags = (G.tags || []).slice(0, 16);
  var shots = G.shots || [];

  /* ---------- 2. 画 DOM（结构固定：英雄区 + 选项卡；只有"左右"由属性随机） ---------- */
  // 封面 URL 由**服务器给准**：它知道哪个文件真的存在（4 次 stat，不扫目录）。
  // 以前这里按名字拼 4 个后缀各试一遍，命不中的必然 404 —— 控制台刷满
  // "CoverImages/xxx.png 404"，看着像程序坏了（2026-09-18 用户："没有图片、视频就忽略，
  // 也不要报错"）。G.coverUrl 为空串 = 没有封面 → 一个请求都不发，退回纯背景。
  var coverUrls = G.coverUrl ? [G.coverUrl] : [];

  var html = "";
  html += '<div class="hero">';
  html += '<div class="hero-cover"><img id="dp-hero" alt="' + esc(G.name) + ' 主图"></div>';
  html += '<div class="hero-info">';
  html += '<h1 class="hero-title">' + esc(G.name) + "</h1>";
  if (G.origin) html += '<div class="hero-origin">' + esc(G.origin) + "</div>";
  if (tags.length) {
    html += '<div class="tags">';
    tags.forEach(function (t) {
      html += '<span class="tag">' + esc(t) + "</span>";
    });
    html += "</div>";
  }
  if (meta.length) {
    html += '<div class="hero-meta">';
    meta.forEach(function (kv) {
      html += '<span class="mi"><b>' + esc(kv[0]) + "</b><span>" + esc(kv[1]) + "</span></span>";
    });
    html += "</div>";
  }
  // 简介**放在英雄区里**（2026-09-18 用户："游戏名、游戏信息、游戏简介和封面在同一高度"）。
  // 两个版面都受益：
  //   · 左右分栏版面 = 左侧信息 + 简介，与右侧封面同高；
  //   · 通排版面 = 封面 → 介绍 → 图片 → 视频，正好是那个版面要的顺序。
  // 所以简介不再是一个独立选项卡（选项卡只剩 图片 / 视频）。
  html += '<div class="hero-desc"><h2>游戏简介</h2>';
  html += G.description
    ? '<p class="desc">' + esc(G.description) + "</p>"
    : '<p class="empty">这个游戏还没有简介。</p>';
  html += "</div>";
  html += "</div></div>";

  html += '<div class="dp-tabs"><nav class="dp-tabbar" role="tablist">';
  if (shots.length) html += '<button type="button" class="dp-tab is-on" data-tab="shots">游戏截图</button>';
  html += '<button type="button" class="dp-tab" data-tab="videos">游戏视频</button>';
  html += '</nav><div class="dp-panels">';

  if (shots.length) {
    // 截图 = **大图 + 全部小图**（2026-09-18 用户："图片页类似这种轮播方式吧，
    // 能全显示出来小图，然后一张一张看大图"）。结构照 Splide 官方的 thumbnails 用法：
    //   .gallery.splide（主图滑，fade）+ .gallery-thumbs.splide（缩略图滑，isNavigation 联动）
    // 两个 .splide 的 DOM 形状必须一致（track > ul.splide__list > li.splide__slide），Splide 才认得。
    // `.gallery` 这个类名**必须留着**：主题注入认它（见 detail.css 文件头）。
    html += '<section class="section dp-panel" data-panel="shots"><h2>游戏截图</h2>';
    html += '<div class="dp-shots">';
    html +=
      '<div class="dp-stage"><div class="gallery splide"><div class="splide__track"><ul class="splide__list">';
    shots.forEach(function (f) {
      html +=
        '<li class="splide__slide"><img src="images/' +
        enc(f) +
        '" alt="游戏截图" loading="lazy"></li>';
    });
    html += "</ul></div></div>";
    // 计数器（"4/8"）：Splide 没有原生计数器，由下面第 3.2 段在 move 事件里填字。
    html += '<span class="dp-counter" aria-hidden="true"></span></div>';
    html += '<div class="gallery-thumbs splide"><div class="splide__track"><ul class="splide__list">';
    shots.forEach(function (f) {
      html +=
        '<li class="splide__slide"><img src="images/' +
        enc(f) +
        '" alt="游戏截图缩略图" loading="lazy"></li>';
    });
    html += "</ul></div></div>";
    html += "</div></section>";
  }

  html += '<section class="section dp-panel " data-panel="videos"><h2>游戏视频</h2>';
  html += '<div class="dp-video-slot"></div></section>';

  html += "</div></div>";
  html +=
    '<div class="footer"><p>信息来源于互联网，仅供学习与分享 · 游戏版权归原作者所有</p></div>';
  root.innerHTML = html;

  /* ---------- 3. 主图 = 封面（**绝不用截图替换**） ----------
     2026-09-18 用户原话："什么啊，你把封面用成图片库的第一张了啊！"
     原先这段会在"封面 + 各张截图"里挑**宽高比最大**的那张当主图 —— 横版截图一出现就把封面顶掉了。
     封面只有一个来源：主界面（CoverImages 目录，服务器已解析成 G.coverUrl）。
     截图只待在"游戏截图"里，不参与主图，也不会因为当主图而被从截图墙里删掉。 */
  var heroEl = document.getElementById("dp-hero");
  var coverUrl = coverUrls[0] || "";
  if (heroEl) {
    if (coverUrl) {
      heroEl.src = coverUrl;
      // data-hero 只影响"海报式"那档的高度上限；按图片真实宽高比标一次即可。
      // 同时把**原图宽度**写成 --dp-cover-maxw：封面就按原图尺寸显示，不放大
      // （2026-09-18 用户："按原图吧，我原图一般是 600 高度，应该够了"）。
      // 不放大有三个好处：图不糊、视觉重量不压人、不同游戏之间尺寸也一致；
      // 窗口比图宽时，两侧留白由模糊层承接，看着是有意留的，不是空。
      heroEl.onload = function () {
        var wide =
          heroEl.naturalHeight > 0 && heroEl.naturalWidth / heroEl.naturalHeight >= 1.2;
        heroEl.setAttribute("data-hero", wide ? "wide" : "tall");
        document.documentElement.setAttribute("data-hero", wide ? "wide" : "tall");
        if (heroEl.naturalWidth > 0) {
          document.documentElement.style.setProperty(
            "--dp-cover-maxw",
            heroEl.naturalWidth + "px",
          );
        }
      };
      document.documentElement.style.setProperty("--dp-cover", "url('" + coverUrl + "')");
    } else {
      // 没有封面 → **一个图片请求都不发**（占位交给 CSS 底色）。
      // 不写 src 的话浏览器会拿 "undefined" 当路径去请求，又是一个 404。
      heroEl.removeAttribute("src");
      document.documentElement.style.setProperty("--dp-cover", "none");
    }
  }

  // 没有截图：上面那段 html **根本没生成**截图面板与它的选项卡 → 这里不用做任何事。
  // （以前这里是"用行内 display:none 藏掉"，到了左右分栏版面被 CSS 的 !important 压掉，空框又露出来 ——
  //   2026-09-18 用户："没有放游戏视频，你仍旧显示了游戏视频 重复了"。结论：**空的东西不要留在 DOM 里**。）

  /* ---------- 3.1 截图点击放大（PhotoSwipe） ----------
     2026-09-18 用户："点击图片不能放大" —— CSS 里写了 cursor: zoom-in 却没接功能，是我漏了。
     用 PhotoSwipe（画廊灯箱的事实标准）：全屏、←/→ 翻页、Esc 关闭、滚轮/双指缩放、缩略图↔大图过渡。
     **不手写灯箱** —— 见项目记忆"能由库完成的一律不手写"。
     两个刻意的工程选择：
       · 动态 import：只有这个游戏真有截图时才去取那 70KB（没截图的页面一个字节都不下载）；
       · 先把 data-pswp-width/height 填上：PhotoSwipe 要知道图片真实尺寸才知道怎么放大，
         而缩略图是懒加载的，得等 load 完再填（不填的话灯箱里是空的）。 */
  // `.gallery` = 主图（点它开灯箱）；`.gallery-thumbs` = 全部小图（"图还活着吗"的判据与灯箱数据都看它们，
  // 因为主图始终只有一张，数不出 8 张）。
  var galleryEl = root.querySelector(".gallery");
  var thumbsEl = root.querySelector(".gallery-thumbs");
  var mainSplide = null; // 由下面第 3.2 段挂载后赋值（点击大图时要知道"现在看的是第几张"）
  var currentShot = function () {
    return mainSplide ? mainSplide.index : 0;
  };
  if (galleryEl && thumbsEl && shots.length) {
    var galleryImgs = [].slice.call(thumbsEl.querySelectorAll("img"));
    // ⚠️ 这两个以前**只有调用、没有定义**（`deadShots++` / `dropShotsPanel()` → ReferenceError）——
    // 于是"所有图都打不开时，把「游戏截图」整块收掉"这条规则从来没生效，界面上就留下一个巨大的空白框
    // （用户 2026-09-18 抱怨过："没有截图，也不就要显示游戏截图"）。判据要落在"看得见看不见"，
    // 而不是"目录里有没有这个文件"。这里补上定义。
    var deadShots = 0;
    var dropShotsPanel = function () {
      var panel = root.querySelector('.dp-panel[data-panel="shots"]');
      if (panel) panel.remove();
      var tab = root.querySelector('.dp-tab[data-tab="shots"]');
      if (tab) tab.remove();
      // 截图页没了就别停在空面板上：切到剩下的第一个选项卡；一个都不剩就把选项卡条收起来。
      var first = root.querySelector(".dp-tab");
      if (first) first.click();
      else {
        var bar = root.querySelector(".dp-tabbar");
        if (bar) bar.style.display = "none";
      }
    };
    galleryImgs.forEach(function (im) {
      im.tabIndex = 0; // 键盘可达：Tab 到图片上按回车/空格也能开
      // 图挂了（换过目录名之类）就别让它可点 —— 否则点了开出一个空灯箱
      im.addEventListener("error", function () {
        im.dataset.dpDead = "1";
        im.removeAttribute("tabindex");
        im.style.cursor = "default";
        deadShots++;
        // **全部**加载失败 = 这个游戏实际上没有可看的截图 → 把「游戏截图」整块收掉。
        // 2026-09-18 用户："你还是那个毛病，没有截图，也不就要显示游戏截图" ——
        // 之前只按"目录里有没有文件"判断，于是文件在、但图打不开时留下一个巨大的空白框。
        // 判据要落在"看得见看不见"上，而不是"有没有这个文件"。
        if (deadShots === galleryImgs.length) dropShotsPanel();
      });
    });

    var pswpReady = null;
    var ensureLightbox = function () {
      if (!pswpReady) {
        pswpReady = import("../_shared/vendor/photoswipe-lightbox.esm.min.js").then(function (mod) {
          var Lightbox = mod.default;
          var lb = new Lightbox({
            gallery: ".gallery",
            children: "img",
            // PhotoSwipe v5 不发 UMD：核心包由调用方 import（同目录，见 vendor/）
            pswpModule: function () {
              return import("../_shared/vendor/photoswipe.esm.min.js");
            },
            bgOpacity: 0.94,
            showHideAnimationType: "zoom",
            wheelToZoom: true,
          });
          lb.init();
          return lb;
        });
      }
      return pswpReady;
    };

    /**
     * 每一项的数据都**我们自己给**（loadAndOpen 的第二个参数），不去靠 PhotoSwipe 从 DOM 属性里猜尺寸。
     *
     * 为什么（2026-09-18 实测踩过）：缩略图是懒加载的，`data-pswp-width/height` 这类属性在图片真正
     * load 之前根本写不上去 —— 那时点开的结果是**灯箱起来了、图却是空的**（只有遮罩和计数器）。
     * 现在改成：点开时现场读 naturalWidth/Height（已加载的图必然有值），没读到就按 16:9 兜底，
     * 图片本身在灯箱里仍然按真实比例完整展示 —— 绝不会因为兜底尺寸而变形。
     */
    var itemDataOf = function (im) {
      var w = im.naturalWidth || 0;
      var h = im.naturalHeight || 0;
      if (!w || !h) {
        w = 1600;
        h = 900;
      }
      return {
        src: im.getAttribute("src"),
        width: w,
        height: h,
        alt: im.getAttribute("alt") || "",
        msrc: im.getAttribute("src"), // 缩略图：让开合动画从它身上"长出来"
      };
    };
    var openShot = function (index) {
      if (index < 0) return;
      ensureLightbox().then(function (lb) {
        lb.loadAndOpen(index, galleryImgs.map(itemDataOf));
      });
    };
    var clickable = function (t) {
      return t && t.tagName === "IMG" && t.dataset.dpDead !== "1";
    };
    // 点**大图**开全屏灯箱，位置 = 当前在看的那一张（大图只有一张，在 galleryImgs 里找不到自己，
    // 所以索引必须来自主图滑的 index，不能像以前那样 indexOf(e.target)）。
    galleryEl.addEventListener("click", function (e) {
      if (!clickable(e.target)) return;
      e.preventDefault();
      openShot(currentShot());
    });
    galleryEl.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (!clickable(e.target)) return;
      e.preventDefault();
      openShot(currentShot());
    });

    /* ---------- 3.2 大图 + 全部小图（Splide 两个实例联动） ----------
       用户要求（2026-09-18）："图片页类似这种轮播方式吧，能全显示出来小图，然后一张一张看大图。"
       这正是 Splide 官方的 **thumbnails 用法**：一个主图滑（一次一张）+ 一个缩略图滑（全部小图），
       用 `isNavigation` 联动 —— 点小图换大图、大图切换时小图自动高亮。**不手写轮播**
       （项目记忆：能由库完成的就不手写）。
       · Splide 是 UMD 包：用 <script> 注入（不是 import），加载完再 mount；
       · **按需加载**：只有这个游戏真有截图时才去取那 29KB；
       · **不用 cover**：Splide 的 cover 等于 object-fit:cover（会裁图）—— 而"图片绝不裁切"
         是硬约束。所以两个滑都按图片自身比例显示（contain），留白由舞台底色承接；
       · 拿不到库 → 退回"小图竖着排、点开仍能看大图"：功能不丢，绝不让一个库失败变成白屏。 */
    var splideReady = null;
    var ensureSplide = function () {
      if (splideReady) return splideReady;
      splideReady = new Promise(function (resolve, reject) {
        if (window.Splide) return resolve();
        var s = document.createElement("script");
        s.src = "../_shared/vendor/splide.min.js";
        s.onload = function () {
          resolve();
        };
        s.onerror = reject;
        document.head.appendChild(s);
      });
      return splideReady;
    };
    // **一张也要挂**（不是 >=2 才挂）：Splide 的样式里 `.splide__track{overflow:hidden}` +
    // `.splide__list{height:100%}` 是"等它挂载时把尺寸写上"的 —— 不挂就高度算 0，图看不见。
    // 一张时把箭头关掉（没什么可翻的），其余照旧。
    if (shots.length) {
      ensureSplide().then(function () {
        if (!window.Splide || galleryEl.dataset.dpCarousel) return;
        galleryEl.dataset.dpCarousel = "1";
        var many = shots.length > 1;
        // 主图：一次一张，左右箭头翻页；不要圆点（小图条就是导航）
        mainSplide = new window.Splide(galleryEl, {
          type: "slide",
          perPage: 1,
          perMove: 1,
          gap: 0,
          height: "min(56vh, 520px)",
          arrows: many,
          pagination: false,
          drag: many,
        });
        // 小图：等宽等高、横向可拖；点它即换大图（isNavigation）
        var thumbs = new window.Splide(thumbsEl, {
          isNavigation: true,
          fixedWidth: 104,
          fixedHeight: 62,
          gap: 8,
          pagination: false,
          arrows: false,
          drag: true,
          breakpoints: { 900: { fixedWidth: 76, fixedHeight: 46 } },
        });
        // 小图条也要打这个标记：CSS 用它区分"库已挂载"与"兜底排布"两种状态
        thumbsEl.dataset.dpCarousel = "1";
        mainSplide.sync(thumbs);
        mainSplide.mount();
        thumbs.mount();
        // 计数器（"4/8"）：Splide 没有原生计数器，这里只在 move 事件里改一下文字
        var counter = root.querySelector(".dp-counter");
        var paint = function (i) {
          if (counter) counter.textContent = i + 1 + "/" + shots.length;
        };
        mainSplide.on("move", paint);
        paint(0);
      }).catch(function (e) {
        // 拿不到轮播库就退回"小图竖排 + 点开看大图"：功能不丢，只是少了横向翻页
        console.warn("[detail] Splide 加载失败，截图退回小图竖排:", e);
      });
    }
  }

  /* ---------- 4. 选项卡 ---------- */
  var tabsRoot = root.querySelector(".dp-tabs");
  if (tabsRoot) {
    var tabEls = [].slice.call(tabsRoot.querySelectorAll(".dp-tab"));
    var panels = [].slice.call(tabsRoot.querySelectorAll(".dp-panel"));
    var vids = document.getElementById("yungame-videos");
    var slot = tabsRoot.querySelector(".dp-video-slot");
    var vtab = tabsRoot.querySelector('.dp-tab[data-tab="videos"]');
    var vpanel = tabsRoot.querySelector('.dp-panel[data-panel="videos"]');
    if (vids && slot) {
      // 注入块**自带一个 <h2>游戏视频</h2>**，而面板里也有一个 —— 两个都留在 DOM 里，
      // 标题就出现两遍（2026-09-18 用户截图："有游戏视频的，你放了2遍"）。
      // 以**面板自己的**标题为准（与"游戏截图"栏一致），把注入块那个删掉。
      var injectedH2 = vids.querySelector("h2");
      if (injectedH2) injectedH2.remove();
      slot.appendChild(vids); // 服务器注入的区块搬进面板
      var n = vids.querySelectorAll(".yungame-video-card").length;
      if (vtab && n) vtab.insertAdjacentHTML("beforeend", '<span class="dp-count">' + n + "</span>");
    } else {
      // 没有视频：**把这个空面板删掉**，而不是藏起来 ——
      // 藏起来会被版面 CSS 的 !important 重新显示出来（空框就是这么冒出来的）。
      if (vpanel) vpanel.remove();
      if (vtab) vtab.remove();
    }
    var showTab = function (name) {
      tabEls.forEach(function (t) {
        t.classList.toggle("is-on", t.getAttribute("data-tab") === name);
      });
      panels.forEach(function (p) {
        p.classList.toggle("is-on", p.getAttribute("data-panel") === name);
      });
      if (name !== "videos") {
        // 切走时把正在播的视频停掉（隐藏的 <video> 会继续在后台播）
        var vs = document.getElementsByTagName("video");
        for (var i = 0; i < vs.length; i++) if (!vs[i].paused) vs[i].pause();
      }
    };
    tabEls.forEach(function (t) {
      t.addEventListener("click", function () {
        showTab(t.getAttribute("data-tab"));
      });
    });
    var on = tabsRoot.querySelector(".dp-tab.is-on") || tabEls[0];
    if (on) showTab(on.getAttribute("data-tab"));
  }

  /* ---------- 5. 方向：随机，且**没有**切换按钮 ----------
     2026-09-18 用户定版："详情页咱就用这样的版面设计了 ——
       上面 封面+说明（可随机左右）；下面 图片+视频+其他（选项卡也可随机左右）。
       去掉换版面，直接随机就行了。也就是，不要上下的了。"
     所以这一段的职责从"选版面 / 手动切"变成**纯随机**：① 那 7 套候选版面已从 CSS 里删掉
     （只留这一套：左右分栏英雄区 + 下方选项卡），② 场上只剩两个可变量：
       · 封面在左还是右   → <html data-cover-side="left|right">
       · 选项卡靠左还是右 → <html data-tabs-side="left|right">
     为什么用"属性 + CSS 反转/对齐"而不改 DOM 顺序：不会重排内容，也不丢滚动位置。

     ⚠️ 刻意的取舍点：现在是**每次打开都随机**（刷新就变）。想改成"同一个游戏固定一种"
     （更像"每款游戏有自己的样子"），把下面这两行的 Math.random() 换成按 G.name 取的稳定哈希即可 ——
     改起来是一行，所以先按用户说的"直接随机"来。 */
  var coin = function () {
    return Math.random() < 0.5 ? "left" : "right";
  };
  document.documentElement.setAttribute("data-cover-side", coin());
  document.documentElement.setAttribute("data-tabs-side", coin());
})();
