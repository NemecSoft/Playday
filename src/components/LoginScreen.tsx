// Login screen shown on startup when login is enabled.
// Supports two methods (industry-standard, client-side demo flow for a fully
// green/offline app):
//   1. WeChat QR scan (微信扫码) - renders a QR code pointing at a mock login
//      confirm page; scanning it simulates login.
//   2. Account / password (账号密码) - local demo authentication.

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Gamepad2, QrCode, User, Lock, MessageCircle, LogIn } from "lucide-react";
import { useSettingsStore } from "../stores/settingsStore";
import { useI18n } from "../i18n";
import { Button } from "./ui/button";

interface Props {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const { t } = useI18n();

  const [mode, setMode] = useState<"wechat" | "account">(
    settings.loginType === "account" ? "account" : "wechat"
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  // Mock WeChat QR: a URL that represents the login confirm page. In a real
  // deployment this would be replaced by a backend-issued WeChat OAuth QR.
  const mockWechatUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=demo&redirect_uri=playnite%3A%2F%2Flogin&session=${Date.now()}`;

  // Simulate "scanned & confirmed" after the user clicks the QR (offline demo).
  useEffect(() => {
    if (!scanning) return;
    const id = setTimeout(() => {
      setScanning(false);
      finishLogin("wechat-user");
    }, 1500);
    return () => clearTimeout(id);
  }, [scanning]);

  const finishLogin = async (name: string) => {
    await save({ loggedIn: true, username: name, loginType: mode });
    onLogin();
  };

  const handleAccount = async () => {
    if (!username.trim() || !password.trim()) {
      setError(t("login_enterCredentials"));
      return;
    }
    setError("");
    await finishLogin(username.trim());
  };

  return (
    <div className="fixed inset-0 grid place-items-center bg-[radial-gradient(circle_at_20%_20%,var(--accent-soft),transparent_40%),var(--bg-base)]">
      <div className="w-[380px] rounded-md border border-border-strong bg-panel p-[32px_28px_22px] shadow-[0_24px_64px_rgba(0,0,0,0.45)]">
        <div className="mb-[22px] text-center">
          <Gamepad2 size={40} className="text-accent" />
          <h1 className="my-2.5 text-[22px] tracking-wide">{t("appTitle")}</h1>
          <p className="text-[13px] text-secondary-text">{t("login_welcome")}</p>
        </div>

        <div className="mb-5 flex gap-1 border-b border-border">
          <button
            className={`flex-1 cursor-pointer border-b-2 px-2 py-2 text-[13px] transition-colors ${mode === "wechat" ? "border-accent font-semibold text-accent-hover" : "border-transparent text-secondary-text hover:text-primary-text"}`}
            onClick={() => setMode("wechat")}
          >
            <QrCode size={16} className="mr-1.5 inline" /> {t("login_wechat")}
          </button>
          <button
            className={`flex-1 cursor-pointer border-b-2 px-2 py-2 text-[13px] transition-colors ${mode === "account" ? "border-accent font-semibold text-accent-hover" : "border-transparent text-secondary-text hover:text-primary-text"}`}
            onClick={() => setMode("account")}
          >
            <User size={16} className="mr-1.5 inline" /> {t("login_account")}
          </button>
        </div>

        <div className="min-h-[220px]">
          {mode === "wechat" ? (
            <div className="flex flex-col items-center gap-3.5">
              <div className="relative rounded-lg bg-white p-3">
                <QRCodeSVG value={mockWechatUrl} size={170} fgColor="#202124" />
                <div
                  className="absolute inset-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md bg-black/60 text-white opacity-0 transition-opacity hover:opacity-100"
                  onClick={() => setScanning(true)}
                >
                  <MessageCircle size={22} />
                  {scanning ? t("login_scanning") : t("login_scanToLogin")}
                </div>
              </div>
              <p className="text-center text-xs text-dim">{t("login_wechatHint")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex items-center gap-2 rounded-md border border-border bg-input px-2.5 text-dim">
                <User size={16} />
                <input
                  type="text"
                  placeholder={t("login_username")}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="flex-1 bg-transparent py-2.5 text-[13px] outline-none"
                />
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border bg-input px-2.5 text-dim">
                <Lock size={16} />
                <input
                  type="password"
                  placeholder={t("login_password")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAccount()}
                  className="flex-1 bg-transparent py-2.5 text-[13px] outline-none"
                />
              </div>
              {error && <div className="text-xs text-danger">{error}</div>}
              <Button className="w-full" onClick={handleAccount}>
                <LogIn size={16} /> {t("login_signIn")}
              </Button>
            </div>
          )}
        </div>

        {settings.loginEnabled && (
          <div className="mt-3.5 text-center">
            <Button variant="link" className="text-[12px] text-dim hover:text-secondary-text" onClick={() => onLogin()}>
              {t("login_skip")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
