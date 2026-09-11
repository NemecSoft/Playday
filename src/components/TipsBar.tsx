// 主界面底部提示栏：轮播 src/data/tips.json 里的小技巧。
//
// 设计意图：网吧场景下用户很少会去翻设置或帮助文档，把"能省事的小技巧"
// 放在视线自然扫过的底部，按固定节奏轮播（默认 12 秒一条），点一下可看下一条。
// 文案全部在 JSON 里，不需要改代码就能增删。
import { useEffect, useMemo, useState } from "react";
import { Lightbulb, ChevronRight } from "lucide-react";
import tipsData from "../data/tips.json";
import { useI18n } from "../i18n";

interface Tip {
  id: string;
  zh: string;
  en?: string;
}

const ROTATE_SECONDS = tipsData.rotateSeconds ?? 12;

export default function TipsBar() {
  const { lang } = useI18n();
  const tips = tipsData.tips as Tip[];
  const [idx, setIdx] = useState(0);

  // 按语言取文案（简体/繁体共用 zh；英文用 en，缺省回退 zh）。
  const text = useMemo(() => {
    const tip = tips[idx % tips.length];
    if (!tip) return "";
    return lang === "en-US" ? tip.en || tip.zh : tip.zh;
  }, [tips, idx, lang]);

  // 定时轮播。索引越界时取模，JSON 少了几条也不会崩。
  useEffect(() => {
    if (tips.length <= 1) return;
    const timer = setInterval(
      () => setIdx((i) => (i + 1) % tips.length),
      Math.max(4, ROTATE_SECONDS) * 1000,
    );
    return () => clearInterval(timer);
  }, [tips.length]);

  if (!tips.length || !text) return null;

  return (
    <div
      className="tips-bar"
      title="点击查看下一条提示"
      onClick={() => setIdx((i) => (i + 1) % tips.length)}
    >
      <Lightbulb size={13} className="tips-icon" />
      {/* key 让每条提示切换时重播一次淡入动画 */}
      <span className="tips-text" key={idx}>
        {text}
      </span>
      <span className="tips-index">
        {idx + 1}/{tips.length}
      </span>
      <ChevronRight size={13} className="tips-next" />
    </div>
  );
}
