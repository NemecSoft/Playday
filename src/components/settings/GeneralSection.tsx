// 通用设置。
//
// 版式约定（配合 global.css 的 .set-block / .set-row / .set-stack）：
//   - 每个 .set-block 是一组设置：小标题 + 发丝线，组与组之间留白分隔；
//   - .set-row = 左侧标签（可带灰色小字说明）+ 右侧控件（开关/下拉）；
//     整行可点，hover 有底色反馈，避免"复选框和文案挤在一起"；
//   - 滑块这类需要整行宽度的用 .set-stack（标签+数值在上，滑块在下）。

import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useI18n, type LanguageCode } from "../../i18n";
import { Switch } from "../ui/switch";
import { Slider } from "../ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

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
        <ToggleRow
          id="autoBackup"
          label={t("settings_autoBackup")}
          checked={settings.autoBackupEnabled}
          onChange={(v) => save({ autoBackupEnabled: v })}
        />
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
            max={400}
            step={10}
            value={[settings.cardWidth]}
            onValueChange={(v) => save({ cardWidth: v[0] ?? 320 })}
            className="w-full"
          />
          <div className="set-scale">
            <span>120 · 更密集</span>
            <span>400 · 更醒目</span>
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
