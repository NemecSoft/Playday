// 版本徽标：品牌 + 档位（如 `YunGame黄金版` / `YunGame钻石版`）。
//
// 位置变迁（2026-09-15）：**顶栏正中央 → 右下角状态栏（背景音乐右边）**。
// 为什么挪走：它在顶栏是绝对居中、**不占位置**的，而标签栏是动态长度的 ——
// 标签一多就从徽标底下穿过去，两行文字叠在一起（用户原话"会产生遮挡，乱"）。
// 那是结构性的：只要它还在顶栏那条流里且不占位，就一定会再撞上。
//
// 等级判据在**主进程**（按用户表 IP，见 docs/design/user-level-detection.md）：
// 1 = 黄金版、≥2 = 钻石版（3 是 config 的调试覆盖值，同样显示钻石版）。

import { Crown, Gem } from "lucide-react";
import { useI18n } from "../i18n";
import { useAuthStore } from "../stores/authStore";

export default function TierBadge() {
  const { t } = useI18n();
  const userLevel = useAuthStore((s) => s.userLevel);
  // 品牌前缀（`YunGame黄金版`）—— 品牌串的唯一来源是 build.config.ts 的 APP_NAME，
  // 经主进程 ipc.on("get_app_name") → preload 的 sendSync → window.electronConfig.appName
  // 传到这里（见 electron/preload.ts）。
  // ⚠️ 不要在这里写死品牌名，否则"改成 PlayDay"又变成改两处。
  // 在 render 期读而不是模块级常量：网站端（浏览器）没有这个桥，读成空串时
  // 徽标退化成只显示档位，不会出现半截文案。
  const brand = window.electronConfig?.appName ?? "";

  return (
    /* 每 10 秒来一次的"稀有度高光"动效全在 CSS 里（global.css 的 .tier-sheen /
       tier-glow / tier-icon-pop），这里只需要挂一个空的裁切容器：
       它负责把扫光裁在徽章内部，不给徽章加 overflow:hidden（那会裁掉文字光晕）。

       ⚠️ 刻意**不加 title 提示**：以前悬停会弹出"钻石版 · 某某电竞酒店"，
       按需求去掉（鼠标放上去不该显示任何东西）。 */
    <span className={`tier-badge ${userLevel >= 2 ? "diamond" : "gold"}`}>
      <span className="tier-sheen" aria-hidden="true" />
      {userLevel >= 2 ? <Gem size={12} /> : <Crown size={12} />}
      {/* 文案走 tier_badge_*（带 {{brand}} 插值，中英的空格差异也放在语言文件里），
          与分组/维护提示用的 tier_gold / tier_diamond 刻意分开 —— 那两个不该带品牌。
          也刻意拆成两次独立的 t() 调用、把键名直接写在里面，而不是塞进三元表达式：
          check-i18n 的「键拼错」那一档只扫「t() 里紧跟字符串字面量」的写法，塞进三元就漏检。
          （顺带一个坑：连注释里都别写出那种形状的示例 —— 守卫不剥注释，会当成真用到那个键。） */}
      <span>
        {userLevel >= 2
          ? t("tier_badge_diamond", { brand })
          : t("tier_badge_gold", { brand })}
      </span>
    </span>
  );
}
