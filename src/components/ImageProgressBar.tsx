// Modal progress dialog shown while local cover images are being preloaded.
// A prominent popup with a spinner + "loading images x/y" + progress bar so the
// user always sees the loading state instead of a barely-visible thin bar.

import { useImageProgressStore, isImageLoading } from "../stores/imageProgressStore";
import { useI18n } from "../i18n";

export default function ImageProgressBar() {
  const total = useImageProgressStore((s) => s.total);
  const loaded = useImageProgressStore((s) => s.loaded);
  const active = useImageProgressStore((s) => isImageLoading(s));
  const { t } = useI18n();

  if (!active || total <= 0) return null;

  const pct = Math.min(100, Math.round((loaded / total) * 100));
  const label = t("images_loading", { loaded, total });

  return (
    <div className="fixed inset-0 z-[1500] grid place-items-center bg-black/55 backdrop-blur-[2px]">
      <div className="flex min-w-[320px] max-w-[400px] flex-col items-center gap-3 rounded-[14px] border border-border-strong bg-panel p-[28px_30px_24px] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <div className="size-[34px] animate-spin rounded-full border-[3px] border-border border-t-accent" />
        <div className="text-[15px] font-bold text-primary-text">{t("images_loading_title")}</div>
        <div className="text-[13px] text-secondary-text">{label}</div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded bg-item-hover">
          <div
            className="h-full rounded bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs tabular-nums text-dim">{pct}%</div>
      </div>
    </div>
  );
}
