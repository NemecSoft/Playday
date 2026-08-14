// 登录 / 权限 / 企业用户（Task 6）。移植自原 Rust 的 auth.rs。
//
// 企业用户：按本机公网 IP 去 users 表里（kind=enterprise）匹配，命中即登录，
// 权限等级取记录里的 level。个人用户：账号密码登录（存 users 表 kind=personal）。
// 权限判定规则：用户等级 N 可以玩等级 ≤ N 的游戏。

import { createHash } from "crypto";
import * as os from "os";
import { getUserByAccount, getUserByIp } from "./db";
import type { AppUser, CurrentUser } from "./models";

// 企业配置文件里的一条记录（兼容旧系统 PascalCase 键名）。
export interface EnterpriseRecord {
  user_id: string;
  user_account: string;
  user_name: string;
  user_ip_address: string;
  user_level: number;
}

// 读取企业配置文件。旧格式是一个 JSON 数组，字段用 PascalCase。
export function loadEnterpriseRecords(filePath: string): EnterpriseRecord[] {
  try {
    const fs = require("fs");
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, "utf-8");
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return [];
    // 兼容 PascalCase 键
    return arr.map((r: Record<string, unknown>) => ({
      user_id: String(r.UserId ?? r.user_id ?? ""),
      user_account: String(r.UserAccount ?? r.user_account ?? ""),
      user_name: String(r.UserName ?? r.user_name ?? ""),
      user_ip_address: String(r.UserIpAddress ?? r.user_ip_address ?? ""),
      user_level: Number(r.UserLevel ?? r.user_level ?? 0) || 0,
    }));
  } catch {
    return [];
  }
}

// 本机的所有 IPv4 地址（排除回环地址 127.x）。
export function localIpv4Addresses(): string[] {
  const out: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === "IPv4" && !info.internal) {
        if (!out.includes(info.address)) out.push(info.address);
      }
    }
  }
  return out;
}

// 依次尝试的公共 IP 查询服务。第一个返回合法 IPv4 的生效。
const PUBLIC_IP_SERVICES: { url: string; json?: boolean }[] = [
  { url: "https://ipinfo.io/ip" },
  { url: "https://ipv4.icanhazip.com" },
  { url: "https://v4.ident.me" },
  { url: "https://api64.ipify.org?format=json", json: true },
  { url: "https://api.ipify.org" },
  { url: "https://ip.seeip.org" },
];

// 从响应体解析出合法的公网 IPv4（兼容纯文本 `1.2.3.4` 和 JSON `{"ip":"1.2.3.4"}`）。
function parseIpv4(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  let candidate = t;
  if (t.startsWith("{")) {
    try {
      const v = JSON.parse(t);
      candidate = (v.ip ?? "").trim();
    } catch {
      return null;
    }
  }
  // 校验是否合法 IPv4 且非回环
  const m = candidate.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p < 0 || p > 255)) return null;
  if (candidate.startsWith("127.")) return null;
  return candidate;
}

// 获取本机公网 IPv4 地址。按顺序尝试各服务，全部失败返回 null。
export async function publicIpv4Address(): Promise<string | null> {
  for (const service of PUBLIC_IP_SERVICES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(service.url, { signal: controller.signal });
      clearTimeout(timer);
      const body = await resp.text();
      const ip = parseIpv4(body);
      if (ip) return ip;
    } catch {
      continue; // 尝试下一个服务
    }
  }
  return null;
}

// 按公网 IP 从配置里找网吧名（UserName），没有则用 IP 本身。
export function cafeNameForPublicIp(records: EnterpriseRecord[], publicIp: string): string | null {
  const r = records.find((rec) => rec.user_ip_address === publicIp);
  if (!r) return null;
  return r.user_name || r.user_ip_address;
}

// 从配置里按本机 IP 解析当前用户（未命中返回 null）。
export function resolveEnterpriseUser(records: EnterpriseRecord[], localIps: string[]): CurrentUser | null {
  for (const rec of records) {
    if (localIps.includes(rec.user_ip_address)) {
      const level = Math.min(3, Math.max(1, rec.user_level));
      const account = rec.user_account || rec.user_ip_address;
      const name = rec.user_name || account;
      return { kind: "enterprise", name, account, level };
    }
  }
  return null;
}

// 校验个人账号登录：密码匹配则返回用户，否则 null。
export async function verifyPersonalLogin(account: string, password: string): Promise<CurrentUser | null> {
  const user = getUserByAccount(account);
  if (!user) return null;
  if (hashPassword(password) !== user.passwordHash) return null;
  return { kind: "personal", name: user.name, account: user.account, level: user.level };
}

// 用 SHA-256 + 固定盐算密码哈希（十六进制）。与原 Rust 一致，保证管理端创建的账号能在此校验。
export function hashPassword(password: string): string {
  return createHash("sha256").update("playnite-salt::").update(password).digest("hex");
}

// 给管理端 UI 展示的用户（去掉敏感字段，如密码哈希/IP）。
export function publicUser(u: AppUser) {
  return {
    id: u.id,
    account: u.account,
    name: u.name,
    level: u.level,
    createdAt: u.createdAt,
  };
}

// 用户等级 N 是否可以玩等级 game_level 的游戏。
export function canPlay(userLevel: number, gameLevel: number): boolean {
  return userLevel >= gameLevel;
}
