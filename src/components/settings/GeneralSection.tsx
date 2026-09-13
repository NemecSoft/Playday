// 通用设置。
//
// 版式约定（配合 global.css 的 .set-block / .set-row / .set-stack）：
//   - 每个 .set-block 是一组设置：小标题 + 发丝线，组与组之间留白分隔；
//   - .set-row = 左侧标签（可带灰色小字说明）+ 右侧控件（开关/下拉）；
//     整行可点，hover 有底色反馈，避免"复选框和文案挤在一起"；
//   - 滑块这类需要整行宽度的用 .set-stack（标签+数值在上，滑块在下）。

import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useFontOptions } from "../../hooks/useFontOptions";
import { applyUiFontScale } from "../../utils/uiFont";
import { api } from "../../api/client";
import { useMusicStore } from "../../stores/musicStore";
import { useI18n, type LanguageCode } from "../../i18n";
import { Switch } from "../ui/switch";
import { Slider } from "../ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { SaveBackupMode } from "../../../shared/models";

export default function GeneralSection() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  // setLang：立即切换 i18next 语言（否则只写配置不生效，要重启才变）。
  const { t, setLang } = useI18n();

  // 错误上报里的三个输入框是受控的：本地 state 保证输入流畅，失焦/回车才落盘，
  // 避免每敲一个字都写一次 config.json。
  const [mail, setMail] = useState({
    smtpUser: settings.errorReport?.smtpUser || "",
    smtpPass: settings.errorReport?.smtpPass || "",
    toEmail: settings.errorReport?.toEmail || "",
  });

  const LANGUAGES: { code: LanguageCode; label: string }[] = [
    { code: "en-US", label: t("settings_langEnglish") },
    { code: "zh-CN", label: t("settings_langSimplified") },
    { code: "zh-TW", label: t("settings_langTraditional") },
  ];

  // 可用字体 = 应用自带 fonts 目录里实际存在的字体（目录不存在时只剩"应用自带字体（默认）"）。
  const fontOptions = useFontOptions();

  // 字体大小（百分比）：只放大文字，界面尺寸不动。
  //   拖动时**立即生效**（要有视觉反馈），落盘做 320ms 防抖 —— 滑块会连续触发，
  //   不能每动一格都写一次 config.json。
  const fontScale = Math.round(Number(settings.uiFontScale) || 100);
  const fontScaleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyFontScale = (pct: number) => {
    const v = Math.max(85, Math.min(140, Math.round(pct)));
    applyUiFontScale(v);
    if (fontScaleSaveTimer.current) clearTimeout(fontScaleSaveTimer.current);
    fontScaleSaveTimer.current = setTimeout(() => void save({ uiFontScale: v }), 320);
  };

  // 背景音乐音量：拖动时立即生效（马上能听出变化），落盘同样 320ms 防抖。
  const musicVolume = Math.round(Number(settings.musicVolume ?? 50));
  const musicVolumeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyMusicVolume = (v: number) => {
    const vol = Math.max(0, Math.min(100, Math.round(v)));
    useMusicStore.getState().setVolume(vol);
    if (musicVolumeSaveTimer.current) clearTimeout(musicVolumeSaveTimer.current);
    musicVolumeSaveTimer.current = setTimeout(() => void save({ musicVolume: vol }), 320);
  };

  /** 一行开关设置（整行可点）。 */
  const ToggleRow = ({
    id,
    label,
    hint,
    checked,
    onChange,
  }: {
    id: string;
    label: string;
    hint?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div
      className="set-row is-clickable"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span className="set-label">
        {label}
        {hint && <span className="set-hint">{hint}</span>}
      </span>
      <span className="set-control">
        {/* 阻止冒泡：避免点开关触发整行的 onChange 两次 */}
        <span onClick={(e) => e.stopPropagation()}>
          <Switch id={id} checked={checked} onCheckedChange={onChange} />
        </span>
      </span>
    </div>
  );

  /**
   * 一行"路径 + 浏览…"（字体文件夹 / 音乐文件夹这类可配置目录）。
   * 输入用**本地 state**，只在失焦/回车时落盘 —— 每敲一个字符就写 config.json 没必要。
   * 浏览按钮走主进程的系统对话框（api.pickDirectory → IPC open_dialog）。
   */
  const PathRow = ({
    id,
    label,
    value,
    placeholder,
    onSave,
  }: {
    id: string;
    label: string;
    value: string;
    placeholder?: string;
    onSave: (v: string) => void;
  }) => {
    const [draft, setDraft] = useState(value);
    // 外部改了值（比如切了配置）时同步回来。
    useEffect(() => setDraft(value), [value]);
    return (
      <div className="set-stack">
        <label className="set-label" htmlFor={id}>
          {label}
        </label>
        <div className="set-path-row">
          <input
            id={id}
            className="set-path-input"
            value={draft}
            placeholder={placeholder}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onSave(draft.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <button
            type="button"
            className="set-browse-btn"
            onClick={async () => {
              const picked = await api.pickDirectory(label, draft.trim() || undefined);
              if (picked) {
                setDraft(picked);
                onSave(picked);
              }
            }}
          >
            {t("settings_browse")}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* ---------- 启动 ---------- */}
      <section className="set-block">
        <h4>启动</h4>
        <div className="set-row">
          <span className="set-label">{t("settings_startupBehavior")}</span>
          <span className="set-control">
            <Select
              value={settings.startupBehavior}
              onValueChange={(v) => save({ startupBehavior: v })}
            >
              <SelectTrigger className="set-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="StartNormal">
                  {t("settings_startNormal", { defaultValue: "正常启动" })}
                </SelectItem>
                <SelectItem value="StartMaximized">
                  {t("settings_startMaximized", { defaultValue: "最大化启动" })}
                </SelectItem>
                <SelectItem value="StartMinimized">
                  {t("settings_startMinimized", { defaultValue: "最小化启动" })}
                </SelectItem>
                <SelectItem value="StartMinimizedTray">
                  {t("settings_startMinimizedTray", { defaultValue: "最小化到托盘启动" })}
                </SelectItem>
              </SelectContent>
            </Select>
          </span>
        </div>
        <ToggleRow
          id="tray"
          label={t("settings_enableTray")}
          checked={settings.enableTray}
          onChange={(v) => save({ enableTray: v })}
        />
        <ToggleRow
          id="closeToTray"
          label={t("settings_closeToTray")}
          checked={settings.closeToTray}
          onChange={(v) => save({ closeToTray: v })}
        />
        <ToggleRow
          id="minimizeToTray"
          label={t("settings_minimizeToTray")}
          checked={settings.minimizeToTray}
          onChange={(v) => save({ minimizeToTray: v })}
        />
      </section>

      {/* ---------- 语言与运行 ---------- */}
      <section className="set-block">
        <h4>语言与运行</h4>
        <div className="set-row">
          <span className="set-label">{t("settings_language")}</span>
          <span className="set-control">
            <Select
              value={settings.language}
              onValueChange={(v) => {
                save({ language: v });
                setLang(v as LanguageCode);
              }}
            >
              <SelectTrigger className="set-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
        </div>
        <ToggleRow
          id="trackPlaytime"
          label={t("settings_trackPlaytime", { defaultValue: "启用游戏时间追踪" })}
          checked={settings.trackPlaytime}
          onChange={(v) => save({ trackPlaytime: v })}
        />
        <ToggleRow
          id="showBatConsole"
          label={t("settings_showBatConsole", { defaultValue: "运行 .bat/.cmd 指令时显示控制台窗口" })}
          checked={settings.showBatConsole}
          onChange={(v) => save({ showBatConsole: v })}
        />
        {/* 游戏退出后的存档备份：三档（默认"每次都问"）。
            原来是 autoBackupEnabled 这个布尔开关，但**代码里没有任何地方读它**（死设置），
            已换成真正生效的三档；判定在主进程（electron/ipc/saveManager.ts）。 */}
        <div className="set-row">
          <span className="set-label">{t("settings_saveBackupMode")}</span>
          <span className="set-control">
            <Select
              value={settings.saveBackupMode || "ask"}
              onValueChange={(v) => save({ saveBackupMode: v as SaveBackupMode })}
            >
              <SelectTrigger className="set-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ask">{t("settings_saveBackupAsk")}</SelectItem>
                <SelectItem value="auto">{t("settings_saveBackupAuto")}</SelectItem>
                <SelectItem value="never">{t("settings_saveBackupNever")}</SelectItem>
              </SelectContent>
            </Select>
          </span>
        </div>
      </section>

      {/* ---------- 界面字体 ---------- */}
      {/* 原来字体在"设计器"分项微调里，而设计器 tab 已移除（SettingsModal 现在只有"通用"），
          于是字体没地方设了 —— 这里补一个独立区块：选字体 + 界面大小。
          字体清单来自应用自带 fonts 目录（见 electron/core/fonts.ts），
          "应用自带字体（默认）"= 空值，用 fonts\字酷堂清楷 简.ttf。 */}
      <section className="set-block">
        <h4>界面字体</h4>
        <p className="set-note">{t("settings_fontHint")}</p>
        <div className="set-row">
          <span className="set-label">{t("settings_font")}</span>
          <span className="set-control">
            <Select
              value={settings.fontFamily || ""}
              onValueChange={(v) => save({ fontFamily: v })}
            >
              <SelectTrigger className="set-select" style={{ fontFamily: settings.fontFamily || undefined }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fontOptions.map((o) => (
                  <SelectItem
                    key={o.value || "default"}
                    value={o.value}
                    style={{ fontFamily: o.value || undefined }}
                  >
                    {o.labelKey ? t(o.labelKey) : o.label ?? o.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
        </div>
        {/* 字体文件夹：可配置（settings.fontsDir）。留空 = <程序目录>/fonts。 */}
        <PathRow
          id="fontsDir"
          label={t("settings_fontsDir")}
          value={settings.fontsDir ?? ""}
          placeholder={t("settings_fontsDirPlaceholder")}
          onSave={(v) => void save({ fontsDir: v })}
        />
        {/* 字体大小：**只放大文字**，弹窗/按钮/封面/间距一律不动（需求明确要求）。
            实现：构建期 postcss-font-scale.cjs 把每处 font-size 包成
            calc(Npx * var(--ui-font-scale))，这里只改那个变量（见 src/utils/uiFont.ts）。 */}
        <div className="set-stack">
          <label className="set-label">
            {t("settings_uiFontSize")}
            <span className="set-value">{fontScale}%</span>
          </label>
          <Slider
            min={85}
            max={140}
            step={5}
            value={[fontScale]}
            onValueChange={(v) => applyFontScale(v[0] ?? 100)}
            className="w-full"
          />
          <div className="set-scale">
            <span>85% · 更小</span>
            <span>140% · 更大</span>
          </div>
        </div>
      </section>

      {/* ---------- 背景音乐 ---------- */}
      {/* 需求：背景音乐文件夹可配置、随机循环、进入主界面自动播放、状态栏可一键控制。
          播放逻辑在 src/stores/musicStore.ts（模块级 <audio> + 随机队列），
          音频文件由主进程本地服务器按 /music/<相对路径> 提供（见 electron/core/music.ts）。 */}
      <section className="set-block">
        <h4>背景音乐</h4>
        <p className="set-note">{t("settings_musicHint")}</p>
        <ToggleRow
          id="musicEnabled"
          label={t("settings_musicEnabled")}
          checked={settings.musicEnabled !== false}
          onChange={(v) => save({ musicEnabled: v })}
        />
        <PathRow
          id="musicDir"
          label={t("settings_musicDir")}
          value={settings.musicDir ?? ""}
          placeholder={t("settings_musicDirPlaceholder")}
          onSave={(v) => void save({ musicDir: v })}
        />
        <div className="set-stack">
          <label className="set-label">
            {t("settings_musicVolume")}
            <span className="set-value">{musicVolume}%</span>
          </label>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[musicVolume]}
            onValueChange={(v) => applyMusicVolume(v[0] ?? 50)}
            className="w-full"
          />
          <div className="set-scale">
            <span>0% · 静音</span>
            <span>100% · 最响</span>
          </div>
        </div>
      </section>

      {/* ---------- 网格封面 ---------- */}
      <section className="set-block">
        <h4>网格封面</h4>
        <p className="set-note">
          提示：在主界面按住 Alt + 鼠标滚轮，可以更快地调整封面大小。
        </p>
        <div className="set-stack">
          <label className="set-label">
            封面（卡片）宽度
            <span className="set-value">{settings.cardWidth}px</span>
          </label>
          <Slider
            min={120}
            max={2000}
            step={10}
            value={[settings.cardWidth]}
            onValueChange={(v) => save({ cardWidth: v[0] ?? 320 })}
            className="w-full"
          />
          <div className="set-scale">
            <span>120 · 更密集</span>
            <span>2000 · 一行一个（视窗口宽度）</span>
          </div>
        </div>
        <div className="set-stack">
          <label className="set-label">
            卡片左右间距
            <span className="set-value">{settings.cardGap}px</span>
          </label>
          <Slider
            min={0}
            max={20}
            step={1}
            value={[settings.cardGap]}
            onValueChange={(v) => save({ cardGap: v[0] ?? 0 })}
            className="w-full"
          />
        </div>
        <div className="set-stack">
          <label className="set-label">
            卡片行间距
            <span className="set-value">{settings.cardRowGap}px</span>
          </label>
          <Slider
            min={0}
            max={60}
            step={2}
            value={[settings.cardRowGap]}
            onValueChange={(v) => save({ cardRowGap: v[0] ?? 0 })}
            className="w-full"
          />
        </div>
      </section>

      {/* ---------- 其它 ---------- */}
      <section className="set-block">
        <h4>其它</h4>
        <ToggleRow
          id="communityEnabled"
          label={t("settings_community", { defaultValue: "社区氛围（在线/弹幕/活动流）" })}
          checked={settings.communityEnabled}
          onChange={(v) => save({ communityEnabled: v })}
        />
        <ToggleRow
          id="errorReportEnabled"
          label={t("settings_errorReport", { defaultValue: "错误上报（崩溃时发邮件到收件人邮箱）" })}
          checked={!!settings.errorReport?.enabled}
          onChange={(v) => save({ errorReport: { ...settings.errorReport, enabled: v } })}
        />
      </section>

      {/* 错误上报的邮箱配置：只在开启后展开，不占常驻版面 */}
      {settings.errorReport?.enabled && (
        <section className="set-block">
          <h4>崩溃邮件</h4>
          <div className="set-row">
            <span className="set-label">发件邮箱</span>
            <input
              type="text"
              className="set-select rounded-md border border-border bg-input px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
              placeholder="12345@qq.com"
              value={mail.smtpUser}
              onChange={(e) => setMail({ ...mail, smtpUser: e.target.value })}
              onBlur={() => save({ errorReport: { ...settings.errorReport, smtpUser: mail.smtpUser } })}
            />
          </div>
          <div className="set-row">
            <span className="set-label">授权码</span>
            <input
              type="password"
              className="set-select rounded-md border border-border bg-input px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
              placeholder="QQ 邮箱授权码（非登录密码）"
              value={mail.smtpPass}
              onChange={(e) => setMail({ ...mail, smtpPass: e.target.value })}
              onBlur={() => save({ errorReport: { ...settings.errorReport, smtpPass: mail.smtpPass } })}
            />
          </div>
          <div className="set-row">
            <span className="set-label">收件邮箱</span>
            <input
              type="text"
              className="set-select rounded-md border border-border bg-input px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
              placeholder="97407198@qq.com"
              value={mail.toEmail}
              onChange={(e) => setMail({ ...mail, toEmail: e.target.value })}
              onBlur={() => save({ errorReport: { ...settings.errorReport, toEmail: mail.toEmail } })}
            />
          </div>
          <p className="set-note">
            需在 QQ 邮箱「设置 → 账户」开启 SMTP 并生成授权码（smtp.qq.com:465）。
          </p>
        </section>
      )}
    </div>
  );
}
