// 登录 / 权限 / 企业用户（Task 6）。移植自原 Rust 的 auth.rs。
//
// 企业用户：按本机公网 IP 去 users 表里（kind=enterprise）匹配，命中即登录，
// 权限等级取记录里的 level。个人用户：账号密码登录（存 users 表 kind=personal）。
// 权限判定规则：用户等级 N 可以玩等级 ≤ N 的游戏。

import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getUserByAccount, getUserByIp } from "./db";
import type { AppUser, SessionUser } from "./models";
import { appRoot, configuredPath, sourceDatabasePath } from "./paths";
import { readSettings } from "./settings";
import { evaluateLibraryAge, type LibraryAgeInfo } from "../../shared/libraryAge";
import {
  parseServerStatusRaw,
  parseUserListRaw,
  resolveMaintenance,
  resolveUserLevel,
  type MaintenanceState,
  type ResolveUserLevelResult,
  type ServerStatusRecord,
  type YunGameUser,
} from "../../shared/userLevel";

// 等级判定与"能不能玩"的**唯一**实现都在 shared/userLevel.ts（两端共用、有单测）。
// 这里只 re-export，保持历史调用点（如 electron/core/process.ts 的 `from "./auth"`）不变。
export { canPlay } from "../../shared/userLevel";

// 企业配置文件里的一条记录（兼容旧系统 PascalCase 键名）。
export interface EnterpriseRecord {
  user_id: string;
  user_account: string;
  user_name: string;
  user_ip_address: string;
  user_level: number;
}

// 读取企业/用户配置文件（YunGame_UserList.json）。**明文与密文都能吃**：
// 原版 JsonCrypt 用 base64+XOR 加密（见 shared/userLevel.ts 的 parseUserListRaw）。
export function loadEnterpriseRecords(filePath: string): EnterpriseRecord[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    return parseUserListRaw(fs.readFileSync(filePath, "utf-8")).map((r) => ({
      user_id: r.userId,
      user_account: r.account,
      user_name: r.name,
      user_ip_address: r.ipAddress,
      user_level: r.level,
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

// 公网 IP 会话级缓存：启动时 get_current_user / get_status_bar / get_server_status
// 会各问一遍，而每次都要挨个试 6 个外部服务（最坏几十秒）。同一进程内公网 IP 不会变，
// 所以只缓存**成功**的结果（失败不缓存 —— 网络暂时不通时下次还能重试）。
let publicIpCache: string | null = null;

// 获取本机公网 IPv4 地址。按顺序尝试各服务，全部失败返回 null。
export async function publicIpv4Address(): Promise<string | null> {
  if (publicIpCache) return publicIpCache;
  for (const service of PUBLIC_IP_SERVICES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(service.url, { signal: controller.signal });
      clearTimeout(timer);
      const body = await resp.text();
      const ip = parseIpv4(body);
      if (ip) {
        publicIpCache = ip;
        return ip;
      }
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
export function resolveEnterpriseUser(records: EnterpriseRecord[], localIps: string[]): SessionUser | null {
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
export async function verifyPersonalLogin(account: string, password: string): Promise<SessionUser | null> {
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
// （实现已移到 shared/userLevel.ts 的 canPlay，本文件顶部 re-export；这里只留说明。）

// 解析结果的附带信息（排查用：为什么判定成这个版本）。
export interface CurrentUserLevelInfo {
  /** 实际使用的用户表路径。 */
  userListPath: string;
  userListExists: boolean;
  /** 解析失败原因（文件存在但读不动时才有值）。 */
  parseError?: string;
  /** 用户表记录条数（排查"名单是不是空的"）。 */
  recordCount: number;
  localIps: string[];
  publicIp: string;
}

/**
 * 解析「当前这台机器的用户等级」—— 本功能的**单一入口**。
 *
 * 优先级（实现在 shared/userLevel.ts 的 resolveUserLevel）：
 *   config 覆盖开关 > 用户表按 IP 命中（L2=钻石，其余黄金）> 个人会话等级 > 黄金(1)
 *
 * 用户表位置：config.json → settings.yunGameUserListPath（相对路径以应用 exe 所在目录为基准，
 * 与其它路径字段一致）；未配置时默认 <应用目录>/YunGame_UserList.json。
 *
 * 文件不存在 / 解析失败**不抛错**：按"未命中"处理落到黄金版，但把原因放进返回值，
 * 供状态栏与日志说明 —— 静默失败最难受（用户只会看到"游戏都不能玩"却不知为什么）。
 */
export async function resolveCurrentUserLevel(
  opts: { personalLevel?: number } = {},
): Promise<ResolveUserLevelResult & CurrentUserLevelInfo> {
  const filePath = configuredPath("yunGameUserListPath") ?? path.join(appRoot(), "YunGame_UserList.json");

  let records: YunGameUser[] = [];
  let parseError: string | undefined;
  const exists = fs.existsSync(filePath);
  if (exists) {
    try {
      records = parseUserListRaw(fs.readFileSync(filePath, "utf-8"));
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
      console.error(`[auth] 用户表解析失败（按未命中处理 → 黄金版）: ${filePath} — ${parseError}`);
    }
  }

  const publicIp = (await publicIpv4Address()) || "";
  const localIps = localIpv4Addresses();
  // 公网 IP 排最前（用户表里存的就是公网 IP），本机内网 IPv4 作为兜底
  const ips = [publicIp, ...localIps].filter(Boolean);

  const override = Number(readSettings().userLevelOverride) || 0;
  const resolved = resolveUserLevel(records, ips, { override, personalLevel: opts.personalLevel });

  return {
    ...resolved,
    userListPath: filePath,
    userListExists: exists,
    parseError,
    recordCount: records.length,
    localIps,
    publicIp,
  };
}

// 维护状态 + 排查信息。
export interface MaintenanceInfo extends MaintenanceState {
  filePath: string;
  fileExists: boolean;
  recordCount: number;
  parseError?: string;
}

/**
 * 解析「当前等级是否正在维护」—— 公告窗口据此决定能不能进系统。
 *
 * 先要等级（维护状态是**按等级**分别控的：黄金版定期维护就只关黄金版），
 * 再从 YunGame_ServerStatus.json 取该等级那一行的 Status。
 *
 * 文件不存在 / 解析失败 → 视为**正常营业**（只认显式 0 为维护）：
 * 配错或漏配不该把所有人锁在门外。原因放进返回值供排查。
 */
export async function resolveMaintenanceState(): Promise<MaintenanceInfo> {
  const user = await resolveCurrentUserLevel();
  const filePath =
    configuredPath("yunGameServerStatusPath") ?? path.join(appRoot(), "YunGame_ServerStatus.json");

  let records: ServerStatusRecord[] = [];
  let parseError: string | undefined;
  const exists = fs.existsSync(filePath);
  if (exists) {
    try {
      records = parseServerStatusRaw(fs.readFileSync(filePath, "utf-8"));
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
      console.error(`[auth] 维护状态表解析失败（按正常营业处理）: ${filePath} — ${parseError}`);
    }
  }

  return {
    ...resolveMaintenance(records, user.level),
    filePath,
    fileExists: exists,
    recordCount: records.length,
    parseError,
  };
}

// ============================================================================
// 库过旧（进系统的第二道门禁）
// ----------------------------------------------------------------------------
// 需求：数据库一个月没有发生变化 → 提示"系统过旧"，只能退出，不允许进入。
// 判定用的是**权威库文件**（<sourceLibraryDir>/library.db）的最后修改时间 ——
// 那是"库内容最后被改动的时间"，脚本导入/标签同步/手工改库都会刷新它。
//
// ⚠️ 绝对不能改用运行时副本的时间：副本在运行期会被写设置刷新（实测比权威库还新），
//    用它判定等于永远"刚更新过"，这条校验就废了。
// ⚠️ 源库不存在时按"不过旧"处理（不锁）：宁可在库缺失时放过，
//    也不能因为路径配错/新装机没拷库就把所有用户挡在门外。判定规则与单测见
//    shared/libraryAge.ts（evaluateLibraryAge）。
// ============================================================================

export interface LibraryAgeState extends LibraryAgeInfo {
  /** 实际检查的库文件路径（排查"到底看的是哪个文件"）。 */
  filePath: string;
  fileExists: boolean;
}

/** 解析库的"年龄"（是否过旧）。读文件失败不抛错，按"不过旧"处理。 */
export function resolveLibraryAgeState(nowMs: number = Date.now()): LibraryAgeState {
  const filePath = sourceDatabasePath();
  let mtimeMs: number | null = null;
  let fileExists = false;
  try {
    const st = fs.statSync(filePath);
    mtimeMs = st.mtimeMs;
    fileExists = true;
  } catch {
    // 文件不存在 / 没权限：保持 mtimeMs=null → evaluateLibraryAge 判为"不过旧"。
  }
  return { ...evaluateLibraryAge(mtimeMs, nowMs), filePath, fileExists };
}

