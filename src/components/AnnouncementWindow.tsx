// 公告窗口（独立引导窗口，类似微信登录界面）。
// 2026-08-17 简化版：
//   - 暂时去掉"真·异形（透明抠图）"样式（异形窗口 + 顶部 ann-crown 突起）
//   - 暂时去掉 Live2D 看板娘立绘
//   - 改为普通矩形面板（直接占满 BrowserWindow 内容区，圆角 + 深色背景）
//   - 保留荧光特效：announcement-aurora 极光动画、ann-enter-btn 发光按钮、announcement.html 里的 NEW 徽章由用户文案控制
// 2026-09-17：命中门禁（维护中 / 库过旧）时**整屏只说这一件事**，不再显示通用公告内容
//   —— 需求原话："这个提示不够明显，要直接在中间大大的显示服务器维护。而不要再显示通用内容了"。
// 2026-09-18：公告底部的 .hint 改成**当前时间**（见下面的 AnnouncementClock）。
// 点"进入系统" → 调主进程 enter_system → 主进程关本窗口、建主窗口。
import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api } from "../api/client";
import { useI18n } from "../i18n";

/** 自动适配的缩放下限：比这还小字就看不清了，那种情况宁可让它能滚。 */
const FIT_MIN_SCALE = 0.6;
/** 上限：内容少的时候最多放大到 1.2 倍，免得把字撑成傻大个。 */
const FIT_MAX_SCALE = 1.2;
/** 需要缩小时再留 0.5% 余量：不然差 1px 就又冒出滚动条。
    只在 raw < 1（装不下）时乘它 —— 装得下的时候乘上去，会让"刚好一屏"的内容永远小一点点。 */
const FIT_SAFETY = 0.995;

/**
 * 让公告正文**自动缩放到正好一屏**（2026-09-18 用户要求："不要算，而要整个页面自动适合，
 * 可能我还要修改更多"）。
 *
 * 做法：量出"滚动区内容总高 ÷ 可视高"的比值，用 CSS zoom 把正文等比缩一下 ——
 * 内容改多了自动缩小，改少了自动放大（封顶 1.2 倍）。
 *
 * 为什么不回来调字号/间距：公告内容随时会改（用户自己编辑那个 html），写死的数值改一次
 * 内容就失效。zoom 会真的改变布局尺寸（transform 不会），所以缩完不会像 transform 那样
 * "看着小了、位置还占着原样"被裁掉。
 *
 * 为什么不对正文挂 ResizeObserver：fit() 要先清掉 zoom 才能量到自然高度，那次写入本身
 * 又会触发 ResizeObserver → 量了写、写了量停不下来。所以只认三个时机：
 * 正文变了（html）/ 字体加载完 / 可视区尺寸变了。
 */
function useFitAnnouncement(html: string) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = scrollRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const fit = () => {
      content.style.removeProperty("zoom"); // 先归零，量到的才是"自然高度"
      const natural = viewport.scrollHeight;
      const available = viewport.clientHeight;
      if (natural <= 0 || available <= 0) return; // 还没排版出来，或内容为空
      const raw = available / natural;
      // 装得下 → 允许放大（封顶 1.2）；装不下 → 缩，并多留一点点余量。
      const scale =
        raw >= 1
          ? Math.min(FIT_MAX_SCALE, raw)
          : Math.max(FIT_MIN_SCALE, raw * FIT_SAFETY);
      // 缩放变化小于 0.5% 就当没变，别写：省掉一次没必要的重排
      if (Math.abs(scale - 1) < 0.005) content.style.removeProperty("zoom");
      else content.style.setProperty("zoom", scale.toFixed(3));
    };

    fit();
    // 应用自带字体（fonts 目录）首次渲染时可能还没就位，字体一换行高就变 → 再量一次。
    void document.fonts.ready.then(fit);
    // 可视区尺寸变了也重算（窗口本来固定 700×560，但别把这个假设写死在这儿）。
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [html]);

  return { scrollRef, contentRef };
}

/** 公告底部的时间：2026-09-18 03:52:31。纯数字，语种无关，所以不用走 i18n。 */
function formatAnnouncementTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/**
 * 把当前时间写进公告 HTML 里的 .hint（公告作者在末尾留的那个空元素），每秒刷新。
 *
 * 为什么非得由组件来写：公告是 innerHTML 注入的**静态** HTML，而通过 innerHTML 插进去的
 * `<script>` 按浏览器规范**不会执行** —— 时间的钟只能从外面往里写。
 *
 * 两条规矩：
 *   ① 公告里没有 .hint → 什么都不做（别的机器上的公告可能没留这个空位）；
 *   ② .hint 里**已经写了字** → 尊重它，不覆盖（不静默抹掉别人写的文案）。
 * 依赖 html：公告是异步取回来的，取回来之前页面上还没有 .hint。
 */
function AnnouncementClock({ html }: { html: string }) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".ann-html .hint");
    if (!el) return;
    if ((el.textContent ?? "").trim() !== "") return;
    const tick = () => {
      el.textContent = formatAnnouncementTime(new Date());
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [html]);
  return null;
}

export default function AnnouncementWindow() {
  const { t } = useI18n();
  const [html, setHtml] = useState("");
  // 两道"进系统"门禁（判定都在主进程，这里查只是为了早点提示并锁住按钮）：
  //   ① 服务器维护中（Status=0 = 该等级维护中）
  //   ② 游戏库过旧（权威库超过 30 天没变化 = 本机版本太老，得找管理员要新版）
  const [maintenance, setMaintenance] = useState(false);
  const [level, setLevel] = useState(0);
  const [outdated, setOutdated] = useState(false);
  const [ageDays, setAgeDays] = useState<number | null>(null);
  // 正文自动缩放到正好一屏：以后改公告内容（加条目/加节）都不用回来调数值
  const { scrollRef, contentRef } = useFitAnnouncement(html);

  // 一启动就把两个门禁状态各问一次（两个请求并行，不互相等）。
  useEffect(() => {
    let alive = true;
    api
      .getServerStatus()
      .then((s) => {
        if (!alive) return;
        setMaintenance(s.maintenance);
        setLevel(s.level);
      })
      .catch(() => {
        /* 取不到就按正常营业（主进程进入时还会再拦一次） */
      });
    api
      .getLibraryAge()
      .then((a) => {
        if (!alive) return;
        setOutdated(a.outdated);
        setAgeDays(a.ageDays);
      })
      .catch(() => {
        /* 取不到就按"库正常"（主进程进入时还会再拦一次） */
      });
    return () => {
      alive = false;
    };
  }, []);

  // 从主进程读取公告 HTML。
  useEffect(() => {
    let alive = true;
    api
      .getAnnouncement()
      .then((r) => {
        if (!alive) return;
        const body = r.html && r.html.trim().length > 0 ? r.html : "";
        setHtml(
          body ||
            '<div class="announcement-hero"><h1>Welcome</h1><p>Your game library, reimagined.</p></div>',
        );
      })
      .catch(() => {
        /* 用默认欢迎页 */
      });
    return () => {
      alive = false;
    };
  }, []);

  // 点击"进入系统" → 通知主进程创建主窗口。
  // 主进程会在进入前把两道门禁再判一次；被拒时这里切到对应状态，避免用户点了没反应。
  const handleEnter = async () => {
    const r = await api.enterSystem();
    if (!r || r.ok !== false) return;
    if (r.reason === "maintenance") {
      setMaintenance(true);
      if (typeof r.level === "number") setLevel(r.level);
      return;
    }
    if (r.reason === "outdated") {
      setOutdated(true);
      if (typeof r.ageDays === "number") setAgeDays(r.ageDays);
    }
  };

  // 品牌（`YunGame黄金版` 里那个 `YunGame`）：与右下角徽标**同源** —— build.config.ts 的 APP_NAME，
  // 经 preload 的 sendSync 传到这里（见 TierBadge.tsx）。在 render 期读：网站端没有这个桥，
  // 读成空串时文案退化成"黄金版"，不会出现半截品牌名。
  const brand = window.electronConfig?.appName ?? "";
  // 档位文案取 tier_badge_*（**带品牌**的那两个键；tier_gold / tier_diamond 是无品牌版，
  // 留给「游戏级别分组」组名用，别混）。等级取不到（0）按黄金版 —— 与全局兜底一致：
  // 用户表缺失 / 未命中一律按黄金版处理。
  const tier = level >= 2 ? t("tier_badge_diamond", { brand }) : t("tier_badge_gold", { brand });

  // 门禁文案（最多一条：都命中时先报维护 —— 那是服务器状态；过旧是本机版本问题，
  // 两者处理方式不同：等待 / 找管理员要新版）。为 null = 正常营业。
  // 维护正文 = `（YunGame黄金版）正在维护`（2026-09-17 需求：不要"该版本正在定期维护…"那套说法，
  // 直接点名是哪个版本在维护）。句子结构放在语言文件里，品牌与档位作为变量传进去。
  const gate = maintenance
    ? { title: t("maintenance_title"), body: t("maintenance_body", { tier }) }
    : outdated
      ? { title: t("outdated_title"), body: t("outdated_body", { days: ageDays ?? 0 }) }
      : null;

  return (
    <div className="announcement-window">
      <div className="announcement-card">
        {/* 顶部：极光背景动画（保留荧光特效）。z-index 最低，铺在卡片下层。 */}
        <div className="announcement-aurora" aria-hidden="true" />

        {/* 命中门禁 → **整屏只说这一件事**（2026-09-17）：
            原来是"公告内容顶上压一条小横幅"，注意力全被下面的欢迎文案抢走，一眼看不出"进不去"。
            现在连通用公告内容（含"自定义公告：编辑本文件…"那行提示）都不渲染。 */}
        {gate ? (
          <div className="ann-block" role="alert">
            <AlertTriangle className="ann-block-icon" size={68} strokeWidth={1.4} aria-hidden="true" />
            <h1 className="ann-block-title">{gate.title}</h1>
            <p className="ann-block-body">{gate.body}</p>
          </div>
        ) : (
          <div className="announcement-body">
            <div className="announcement-scroll" ref={scrollRef}>
              <div
                className="ann-html"
                ref={contentRef}
                dangerouslySetInnerHTML={{ __html: html }}
              />
              {/* 公告末尾那个 .hint 空位 → 填当前时间（组件只往 DOM 里写文本，自己不渲染东西） */}
              <AnnouncementClock html={html} />
            </div>
          </div>
        )}

        {/* 底部按钮：正常时「退出（取消进入）」+「进入系统」；被门禁拦住时只给「退出」
            （需求：不能进入系统就退出）。
            2026-09-18 用户要求：正常进入时也要有一个"退出（取消进入）"—— 这是必经的引导窗口，
            玩家可能并不想进（上机时间没到 / 走错机器），没有出口只能去点右上角的 ✕。 */}
        <div className="announcement-footer">
          {gate ? (
            <button type="button" className="ann-enter-btn ann-exit-btn" onClick={() => void api.quit()}>
              {t("maintenance_exit")}
            </button>
          ) : (
            <>
              {/* 「进入系统」必须排在前面，并且 autoFocus：窗口一出来焦点就在它身上，回车直接进系统。
                  反着写（退出在前）时，第一个可聚焦元素是「退出」，手一抖回车就退出去了
                  —— 2026-09-18 用户指出，这是个真踩过的坑。
                  顺序不影响外观：「退出（取消进入）」是绝对定位靠右的（见 global.css 的 .ann-quit-btn），
                  文档流里的只有这一个按钮，所以它照旧居中。 */}
              <button
                type="button"
                className="ann-enter-btn"
                autoFocus
                onClick={() => void handleEnter()}
              >
                {t("ann_enter")}
              </button>
              <button
                type="button"
                className="ann-enter-btn ann-quit-btn"
                onClick={() => void api.quit()}
              >
                {t("ann_quit")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
