// 公告窗口（独立引导窗口，类似微信登录界面）。
// 2026-08-17 简化版：
//   - 暂时去掉"真·异形（透明抠图）"样式（异形窗口 + 顶部 ann-crown 突起）
//   - 暂时去掉 Live2D 看板娘立绘
//   - 改为普通矩形面板（直接占满 BrowserWindow 内容区，圆角 + 深色背景）
//   - 保留荧光特效：announcement-aurora 极光动画、ann-enter-btn 发光按钮、announcement.html 里的 NEW 徽章/星星由用户文案控制
// 2026-09-17：命中门禁（维护中 / 库过旧）时**整屏只说这一件事**，不再显示通用公告内容
//   —— 需求原话："这个提示不够明显，要直接在中间大大的显示服务器维护。而不要再显示通用内容了"。
// 点"进入系统" → 调主进程 enter_system → 主进程关本窗口、建主窗口。
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api } from "../api/client";
import { useI18n } from "../i18n";

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
            <div className="announcement-scroll">
              <div
                className="ann-html"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </div>
        )}

        {/* 底部按钮：正常时「进入系统」；被门禁拦住时只给「退出」（需求：不能进入系统就退出） */}
        <div className="announcement-footer">
          {gate ? (
            <button type="button" className="ann-enter-btn ann-exit-btn" onClick={() => void api.quit()}>
              {t("maintenance_exit")}
            </button>
          ) : (
            <button type="button" className="ann-enter-btn" onClick={() => void handleEnter()}>
              进入系统
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
