// 时间/时长格式化（秒 → 显示文本）—— 界面里所有"几分几秒"都走这里，别各写一份。
//
// 为什么单独成文件：详情页的运行时长标签（00:12:34）和音乐面板的播放进度（3:07 / 1:02:33）
// 格式化规则略有差异（是否给分钟补零），但"怎么进位、怎么补零"必须是同一套逻辑，
// 否则同一个秒数在两处显示成不同样子。

/**
 * 秒 → `m:ss` / `h:mm:ss`。
 *
 * @param totalSec   秒数（负数/NaN/Infinity 一律按 0 处理，避免界面出现 "-1:-1"）
 * @param padMinutes 分钟是否补零（true → `00:12`，适合"计时器"；false → `0:12`，适合"媒体时长"）
 */
export function formatClock(totalSec: number, opts: { padMinutes?: boolean } = {}): string {
  const safe = Number.isFinite(totalSec) ? totalSec : 0;
  const s = Math.max(0, Math.floor(safe));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, "0");
  // 超过 1 小时才显示小时位（0:00 前面多一个 "0:" 只会让人读错）。
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  const mm = opts.padMinutes ? String(m).padStart(2, "0") : String(m);
  return `${mm}:${ss}`;
}
