// 底部状态栏最右侧的背景音乐控件：上一首 / 播放暂停 / 下一首 + 当前曲名（可点）。
//
// 需求：控件放底部状态栏（不干扰主界面）、三种循环模式、可调音量与进度、可看曲目列表。
// 显示条件：已经问过主进程 **并且确实有曲目** —— 没配音乐目录、或目录里没音频，
// 就整个不显示（不留一个按不动的空控件）。
//
// 分工：播放本身在 src/stores/musicStore.ts；除"曲名"外的控件都在 MusicPanel（点曲名弹出）。
// 面板的开/关、Esc 与"点外面关掉"由这里负责 —— 只有这里同时知道触发按钮和面板的位置，
// 否则会出现"点按钮打开、同一击又被当成点外面关掉"这类自打架。
//
// 持久化：音量（防抖 320ms，与设置面板里的做法一致）与播放模式（点了就存）都写回
// settings（config.json），重启后保持。注意**只写设置值，不改音乐目录**。

import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, Music } from "lucide-react";
import { useMusicStore } from "../stores/musicStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useI18n } from "../i18n";
import MusicPanel from "./MusicPanel";
import type { MusicMode } from "../../shared/models";

export default function MusicPlayer() {
  const { t } = useI18n();
  const loaded = useMusicStore((s) => s.loaded);
  const tracks = useMusicStore((s) => s.tracks);
  const trackIndex = useMusicStore((s) => s.trackIndex);
  const playing = useMusicStore((s) => s.playing);
  const toggle = useMusicStore((s) => s.toggle);
  const next = useMusicStore((s) => s.next);
  const prev = useMusicStore((s) => s.prev);
  const save = useSettingsStore((s) => s.save);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  // 点面板外 / Esc 关闭面板。
  // 用 pointerdown（而不是 click）更接近原生下拉的手感；监听延后一帧再挂，
  // 免得"点曲名打开面板"的那一次 pointerdown 立刻把它当成点在外面。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener("pointerdown", onDown), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 音量：先作用到 <audio>（马上听得到），再防抖写回设置 ——
  // 拖一次滑杆会产生几十个事件，直接写盘就是几十次文件写入。
  const volTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSetVolume = (v: number) => {
    useMusicStore.getState().setVolume(v);
    if (volTimer.current) clearTimeout(volTimer.current);
    volTimer.current = setTimeout(() => {
      volTimer.current = null;
      void save({ musicVolume: useMusicStore.getState().volume });
    }, 320);
  };
  // 关闭面板（组件卸载）时把还在防抖里的音量落盘：否则"调完立刻关面板"会丢掉这次调整。
  useEffect(
    () => () => {
      if (volTimer.current) {
        clearTimeout(volTimer.current);
        volTimer.current = null;
        void save({ musicVolume: useMusicStore.getState().volume });
      }
    },
    [save]
  );

  // 模式：点一下就是一次确定的意图，直接存（没有连续拖动的问题）。
  const onSetMode = (mode: MusicMode) => {
    useMusicStore.getState().setMode(mode);
    void save({ musicMode: mode });
  };

  // 没音乐就没控件（让状态栏保持干净）。
  if (!loaded || tracks.length === 0) return null;

  const track = tracks[trackIndex];
  const title = track?.name || t("music_none");

  return (
    <span className="music-player" ref={wrapRef}>
      <Music size={13} className="music-icon" aria-hidden="true" />
      <button type="button" className="music-btn" title={t("music_prev")} onClick={() => prev()}>
        <SkipBack size={12} />
      </button>
      <button
        type="button"
        className="music-btn music-btn-main"
        title={playing ? t("music_pause") : t("music_play")}
        onClick={() => toggle()}
      >
        {playing ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <button type="button" className="music-btn" title={t("music_next")} onClick={() => next()}>
        <SkipForward size={12} />
      </button>
      {/* 曲名 = 音乐面板的入口。过长省略号；悬停显示全名（只给文件名，不带路径）。 */}
      <button
        type="button"
        className={`music-title${open ? " is-open" : ""}`}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        {title}
      </button>
      {open && (
        <MusicPanel onClose={() => setOpen(false)} onSetMode={onSetMode} onSetVolume={onSetVolume} />
      )}
    </span>
  );
}
