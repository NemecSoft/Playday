// 用户等级检测（黄金版 / 钻石版）的**纯逻辑**：解析 YunGame 用户表 + 判定当前机器等级。
// 设计文档：docs/design/user-level-detection.md
//
// ⚠️ 本文件不许 import fs / os / Buffer：shared/ 会连同渲染进程一起打包，用 Node 专有 API
// 会让浏览器侧构建直接挂掉。文件读取与 IP 获取在 electron/core/auth.ts 做，这里只接受
// "字符串 + IP 列表"，还你一个等级 —— 因而可以单测（shared/userLevel.test.ts）。

/** 原版 JsonCrypt 的固定密钥（见 YunGameTools/JsonCrypt/jsoncrypt/Program.cs）。 */
export const YUNGAME_USERLIST_KEY = "yungameplaynite";

/** 用户表里的一条记录（兼容旧系统 PascalCase 键名）。 */
export interface YunGameUser {
  userId: string;
  account: string;
  name: string;
  /** 判定依据：该机器的（公网）IP。 */
  ipAddress: string;
  /** 1 = 黄金版，2 = 钻石版。 */
  level: number;
}

/** 判定结果里的等级：1 = 黄金，2 = 钻石，3 = 全解锁（只可能来自"个人会话"账号等级，见 §1.3）。 */
export type UserLevel = number;

export interface ResolveUserLevelResult {
  level: UserLevel;
  /** 是否在用户表里命中本机 IP。 */
  matched: boolean;
  /** 命中的门店名（未命中为空串）。 */
  cafeName: string;
  /** 等级来源，便于状态栏/日志说明"为什么是这个版本"。 */
  source: "userlist" | "personal" | "fallback";
  /** 命中的那条记录（未命中为 undefined）。 */
  record?: YunGameUser;
}

// ---- base64（用 atob/btoa，Node 16+ 与浏览器都有，避免依赖 Buffer）----

function base64FromBytes(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function bytesFromBase64(b64: string): Uint8Array {
  const s = atob(b64.trim());
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * XOR + base64 —— 与原版 jsoncrypt 的 Encrypt/Decrypt **完全一致**。
 * XOR 是对称运算，所以加密与解密是同一个函数（原版也是这么写的）。
 */
export function xorBase64(text: string, key: string = YUNGAME_USERLIST_KEY): string {
  const data = new TextEncoder().encode(text);
  const k = new TextEncoder().encode(key);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ k[i % k.length];
  return base64FromBytes(out);
}

/**
 * 把"可能是明文、也可能是原版 JsonCrypt 密文"的内容解成明文 JSON 文本。
 * 判别依据：以 `[` / `{` 开头 → 明文；否则按 base64+XOR 解一次。
 * 用户表与维护状态表都用这套加密，所以抽出来共用。
 */
function decodeMaybeEncrypted(raw: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  if (text.startsWith("[") || text.startsWith("{")) return text;

  const bytes = bytesFromBase64(text);
  const k = new TextEncoder().encode(YUNGAME_USERLIST_KEY);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ k[i % k.length];
  return new TextDecoder("utf-8").decode(out);
}

/**
 * 解析用户表内容：**两种格式都要能吃**。
 *   · 明文（以 `[` / `{` 开头）→ 直接 JSON.parse
 *   · 密文 → 按原版算法解一次再 parse
 *
 * 为什么必须自动判别：实测用户给的 `bin/Debug/YunGame_UserList.json` 是**明文**，
 * 而生产部署的可能是加密版（原版加密产物另存为 `YunGame_UserList_加密文件.json`）。
 * 只认一种，就会在两种部署里挂掉一种。
 *
 * 解析失败会抛错（交给调用方记日志/降级），不静默返回空数组掩盖问题。
 */
export function parseUserListRaw(raw: string): YunGameUser[] {
  const json = decodeMaybeEncrypted(raw);
  if (!json) return [];

  const parsed: unknown = JSON.parse(json);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      userId: String(r.UserId ?? r.user_id ?? ""),
      account: String(r.UserAccount ?? r.user_account ?? ""),
      name: String(r.UserName ?? r.user_name ?? ""),
      ipAddress: String(r.UserIpAddress ?? r.user_ip_address ?? "").trim(),
      level: Number(r.UserLevel ?? r.user_level ?? 0) || 0,
    }))
    // 没有 IP 的记录永远匹配不上，直接丢掉，免得后面白跑
    .filter((r) => r.ipAddress !== "");
}

// ============================================================================
// 服务器维护状态（YunGame_ServerStatus.json）
// ----------------------------------------------------------------------------
// 文件形如 [ { "UserLevel": 1, "Status": 1 }, { "UserLevel": 2, "Status": 1 } ]，
// **按用户等级分别控状态**：Status = 0 表示该等级正在维护（黄金版定期维护就把它改 0，
// 这样钻石版照常营业）。
// 规则：只认**显式 0** 为维护；其它值（1 / 缺字段 / 找不到该等级的行）都算正常 ——
// 配错/漏配不该把所有人锁在门外。
// ============================================================================

/** 维护状态表里的一行。 */
export interface ServerStatusRecord {
  level: number;
  status: number;
}

/** 维护状态的判定结果。 */
export interface MaintenanceState {
  /** true = 该等级正在维护，不允许进入系统。 */
  maintenance: boolean;
  /** 命中那一行的 Status（没找到该等级的行时为 null）。 */
  status: number | null;
  /** 判定用的用户等级。 */
  level: number;
}

/** 解析维护状态文件（明文/密文都支持，与用户表同一套加密）。 */
export function parseServerStatusRaw(raw: string): ServerStatusRecord[] {
  const json = decodeMaybeEncrypted(raw);
  if (!json) return [];

  const parsed: unknown = JSON.parse(json);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      level: Number(r.UserLevel ?? r.user_level ?? 0) || 0,
      status: Number(r.Status ?? r.status ?? 1) || 0,
    }))
    .filter((r) => r.level > 0);
}

/**
 * 这个等级是否正在维护。只认显式 0（见上方说明）。
 * @param records 维护状态表（解析失败/文件不存在时传空数组 → 视为正常营业）
 */
export function resolveMaintenance(records: ServerStatusRecord[], userLevel: number): MaintenanceState {
  const level = Math.trunc(Number(userLevel) || 0);
  const hit = records.find((r) => r.level === level);
  if (!hit) return { maintenance: false, status: null, level };
  return { maintenance: hit.status === 0, status: hit.status, level };
}

/**
 * 判定当前机器的用户等级。优先级（与设计文档 §1.3 一致）：
 *
 *   1. 用户表按 IP 命中 → UserLevel === 2 ? 钻石(2) : 黄金(1)
 *   2. 已登录的个人会话 → 该账号的等级（账号等级可以是 3 = 全解锁，管理端用）
 *   3. 都没有 → 黄金(1)
 *
 * ⚠️ 这里**没有**任何"等级覆盖开关"这类后门（2026-09-14 用户要求彻底去掉）：想在开发/测试机上
 * 自测，就把**本机当前的 IP 写进用户表**（公网 IP 优先、内网 IPv4 兜底）——做法见设计文档 §1.4。
 *
 * ⚠️ 第 3 条与更早的行为相反：以前"没命中 = 游客 3 = 全权限"，现在**没命中 = 黄金 1**。
 * 这是需求（"否则就是黄金版用户"）的直接结果。
 *
 * @param ips 本机的候选 IP 列表（调用方把公网 IP 放前面、内网 IPv4 放后面）。
 */
export function resolveUserLevel(
  records: YunGameUser[],
  ips: string[],
  opts: { personalLevel?: number } = {},
): ResolveUserLevelResult {
  const normalized = ips.map((s) => String(s ?? "").trim()).filter(Boolean);

  const hit = records.find((r) => normalized.includes(r.ipAddress));
  const hitInfo = hit
    ? { matched: true, cafeName: hit.name || hit.ipAddress, record: hit }
    : { matched: false, cafeName: "", record: undefined };

  // 1) 用户表命中：只有 level 恰好为 2 才是钻石，其余（1 / 其它脏值）都是黄金
  if (hit) {
    return { level: hit.level === 2 ? 2 : 1, ...hitInfo, source: "userlist" };
  }

  // 2) 已登录的个人会话（管理员建的账号；账号等级 3 = 全解锁）
  //    注意：这里**不**夹到 1|2 —— 账号等级本来就是 1|2|3（3 = 全解锁，管理端会用到）。
  const personal = Math.trunc(Number(opts.personalLevel) || 0);
  if (personal > 0) {
    return {
      level: Math.min(3, Math.max(1, personal)),
      matched: false,
      cafeName: "",
      source: "personal",
    };
  }

  // 4) 兜底：黄金版
  return { level: 1, matched: false, cafeName: "", source: "fallback" };
}

/**
 * 能不能玩等级为 gameLevel 的游戏 —— **唯一**判定函数。
 * 前端（authStore）与主进程（launchGame / 存档备份）必须都走这里，不许各处自己写比较。
 */
export function canPlay(userLevel: number, gameLevel: number): boolean {
  return (Number(userLevel) || 0) >= (Number(gameLevel) || 0);
}
