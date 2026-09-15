// 「游戏资料」选项卡：把详情页那套静态站点的**总目录页**（`<详情根>/index.html`）
// 整页嵌进来。与游戏详情页共用同一个本地 HTTP 服务器、同一套 `/games/...` 路由 ——
// **服务器不用改**（实测 2026-09-15：`/games/index.html` → 200 / 376 KB /
// title「游戏库 · 全部游戏介绍」；相对链接指向的封面图也是 200）。
//
// 为什么用 iframe 而不是自己写一个列表：那份 index.html 是现成的内容资产
// （1280 个游戏、自带搜索框与封面），重做一遍既没必要，也会变成"两处各说一遍"。
//
// 点卡片**就在 iframe 里原地跳转**（用静态站自己的相对链接）：跨源 iframe 父页面拦不到
// 点击；而这个选项卡的定位就是"翻资料"，不需要 app 侧的「开始游戏 / 修改器」——
// 那些在游戏详情页有（从主页卡片点「详情」进去）。
//
// 挂载策略在父组件（MainContent）：**首次进入才挂载、之后常驻**（切走只隐藏），
// 这样搜索词与滚动位置都留着，启动时又不会白拉那 376 KB + 1280 张懒加载封面。

import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useI18n } from "../../i18n";
import { gameDataPageUrl } from "../../utils/gameDataUrl";

export default function GameDataView() {
  const { t } = useI18n();
  // null = 还在向主进程要服务器地址；"" = 没拿到（服务器起不来，或路径没配）。
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getGameServerUrl()
      .then((u) => {
        if (!cancelled) setServerUrl(u || "");
      })
      .catch(() => {
        if (!cancelled) setServerUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const url = serverUrl ? gameDataPageUrl(serverUrl) : "";

  if (!url) {
    return (
      <div className="grid h-full place-items-center">
        {serverUrl === null ? (
          <div className="size-[26px] animate-spin rounded-full border-[3px] border-border border-t-accent" />
        ) : (
          <span className="text-[13px] text-secondary-text">{t("data_page_unavailable")}</span>
        )}
      </div>
    );
  }

  return (
    <iframe
      className="block h-full w-full border-0 bg-white"
      // 无障碍：iframe 必须有标题。用选项卡名，读屏器里与页签对得上。
      title={t("tab_data")}
      src={url}
    />
  );
}
