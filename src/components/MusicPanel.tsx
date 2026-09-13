// 音乐面板：点状态栏里的曲名弹出来的"完整遥控器"。
//
// 为什么要有这个面板：状态栏只有 26px 高，塞不下进度条 + 音量 + 三种模式 + 曲目列表；
// 硬塞会把状态栏挤成工具栏。所以状态栏保持"上一首/播放/下一首 + 曲名"（一眼能用的那部分），
// 其余控件集中到这里（需求：可调音量、可拖进度、可切单曲/随机/顺序、可看曲目列表）。
//
// 定位：面板是 `position: fixed`，从状态栏上方弹出。为什么不用 absolute ——
// 外壳 `.app-shell` 是 overflow:hidden（防止内容溢出把状态栏顶走），absolute 会被裁掉。
// 层级：90 —— 盖得住页面内容，但低于视频播放浮层（120）与遮罩弹窗（.modal-overlay 1000）：
// 打开视频或设置时，不该有半张音乐面板浮在上面。
//
// 关闭方式由父组件（MusicPlayer）负责：Esc / 点面板外 / 再点一次曲名 ——
// 那三件事都需要知道"触发按钮在哪"，放在一起才不会被自己的点击立刻关掉。

import { Play, Repeat, Repeat1, Shuffle, Volume2, X } from "lucide-react";
import { useI18n } from "../i18n";
import { useMusicStore } from "../stores/musicStore";
import { formatClock } from "../utils/clock";
import { MUSIC_MODES } from "../utils/musicQueue";
import type { MusicMode } from "../../shared/models";

/** 模式 → 图标 + 文案 key（顺序与此处一致，面板里三连展示）。 */
const MODE_META: Record<MusicMode, { icon: typeof Repeat; label: string }> = {
  shuffle: { icon: Shuffle, label: "music_mode_shuffle" },
  sequential: { icon: Repeat, label: "music_mode_sequential" },
  single: { icon: Repeat1, label: "music_mode_single" },
};

export default function MusicPanel({
  onClose,
  onSetMode,
  onSetVolume,
}: {
  onClose: () => void;
  /** 切模式（父组件负责写回设置持久化）。 */
  onSetMode: (mode: MusicMode) => void;
  /** 调音量（父组件负责防抖写回设置持久化）。 */
  onSetVolume: (v: number) => void;
}) {
  const { t } = useI18n();
  const tracks = useMusicStore((s) => s.tracks);
  const trackIndex = useMusicStore((s) => s.trackIndex);
  const playing = useMusicStore((s) => s.playing);
  const mode = useMusicStore((s) => s.mode);
  const volume = useMusicStore((s) => s.volume);
  const currentTime = useMusicStore((s) => s.currentTime);
  const duration = useMusicStore((s) => s.duration);
  const playTrack = useMusicStore((s) => s.playTrack);
  const seek = useMusicStore((s) => s.seek);

  const track = tracks[trackIndex];
  // 时长为 0（元数据还没到）时给滑杆一个 1 秒的量程，避免 max=0 的非法 range。
  const maxSec = Math.max(1, Math.round(duration));

  return (
    <div className="music-panel">
      <div className="music-panel-head">
        <span className="music-panel-title" title={track?.name ?? ""}>
          {track?.name || t("music_none")}
        </span>
        {/* 子目录名（有才显示）：同名文件靠它区分 —— 只显示文件夹名，不显示完整路径 */}
        {track?.group ? <span className="music-panel-group">{track.group}</span> : null}
        <button type="button" className="music-panel-close" onClick={onClose} title={t("music_close")}>
          <X size={13} />
        </button>
      </div>

      {/* 进度：可拖（本地 HTTP 服务器支持 Range，所以拖到哪都能立刻播） */}
      <div className="music-panel-row">
        <span className="music-panel-time">{formatClock(currentTime)}</span>
        <input
          type="range"
          className="music-panel-range"
          min={0}
          max={maxSec}
          step={1}
          value={Math.min(Math.round(currentTime), maxSec)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label={t("music_progress")}
        />
        <span className="music-panel-time">{formatClock(duration)}</span>
      </div>

      {/* 循环模式（当前高亮）+ 音量 */}
      <div className="music-panel-row">
        <span className="music-panel-modes">
          {MUSIC_MODES.map((m) => {
            const Icon = MODE_META[m].icon;
            return (
              <button
                key={m}
                type="button"
                className={`music-btn${mode === m ? " music-btn-on" : ""}`}
                title={t(MODE_META[m].label)}
                onClick={() => onSetMode(m)}
              >
                <Icon size={13} />
              </button>
            );
          })}
        </span>
        <span className="music-panel-vol">
          <Volume2 size={13} className="music-icon" aria-hidden="true" />
          <input
            type="range"
            className="music-panel-range music-panel-volume"
            min={0}
            max={100}
            step={5}
            value={volume}
            onChange={(e) => onSetVolume(Number(e.target.value))}
            aria-label={t("music_volume")}
          />
          <span className="music-panel-time">{volume}</span>
        </span>
      </div>

      {/* 曲目列表：只显示文件名（需求：文件名就行），当前这首高亮 */}
      <div className="music-panel-list">
        {tracks.map((tr, i) => (
          <button
            key={tr.rel}
            type="button"
            className={`music-panel-item${i === trackIndex ? " is-current" : ""}`}
            onClick={() => playTrack(i)}
            title={tr.name}
          >
            {i === trackIndex ? (
              <Play size={11} className="music-panel-item-icon" />
            ) : (
              <span className="music-panel-item-icon" />
            )}
            <span className="music-panel-item-name">{tr.name}</span>
            {tr.group ? <span className="music-panel-item-group">{tr.group}</span> : null}
            {i === trackIndex && playing ? <span className="music-panel-item-dot" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
