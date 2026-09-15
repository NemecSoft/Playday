// 客户端登录 / 权限 / 状态栏 IPC 命令（Task 6）。移植自原 Rust 的 commands/auth.rs。

import { ipcMain } from "electron";
import { readSettings, writeSettings } from "../core/settings";
import { getUserByAccount } from "../core/db";
import { verifyPersonalLogin, canPlay, resolveCurrentUserLevel } from "../core/auth";
import type { SessionUser } from "../core/models";
import { refreshAppIcons } from "../core/appIcon";
import { registerCommand } from "./registry";

// 本文件的等级解析统一走 electron/core/auth.ts 的 resolveCurrentUserLevel()（单一入口），
// 规则与优先级见 docs/design/user-level-detection.md：
//   config 覆盖开关 > 用户表按 IP 命中（L2=钻石，其余黄金）> 个人会话等级 > 黄金(1)
//
// ⚠️ 每条"把 currentUserLevel 写进 settings"的命令之后都要调 `refreshAppIcons()`：
// 应用图标（窗口 / 任务栏 / 托盘）按等级分（黄金 1.ico / 钻石 2.ico），而等级是这里判出来的。
// 漏掉一条不会报错 —— 表现只是"这台机器图标不对"，很难联想到是这里漏了。
//
// 历史：这里曾经还会读 settings.enterpriseConfigPath（一个 D:/1.json 的企业配置文件）
// 并把"它存不存在"一起返回给前端。该配置早已废弃（门店名与等级现在同源于用户表
// YunGame_UserList.json），前端也从没消费过那两个字段，故整条链路已移除。

// 把当前用户拼成给前端的载荷。
function toPayload(u: SessionUser, enterprise: boolean) {
  return {
    kind: u.kind,
    name: u.name,
    account: u.account,
    level: u.level,
    enterprise,
  };
}

export function registerAuthIpc(ipc: typeof ipcMain) {
  // 状态栏数据：本机 IP + 公网 IP + 命中的门店名 + 等级检测实况。
  // 门店名从**用户表**取（与等级判定同源），不从 users 表按公网 IP 取 —— 否则
  // 状态栏显示的网吧名和实际判定等级可能来自两个不同的名单。
  registerCommand(ipc, "get_status_bar", async () => {
    const info = await resolveCurrentUserLevel();
    return {
      localIp: info.localIps[0] || "",
      publicIp: info.publicIp,
      cafeName: info.cafeName,
      cafeMatched: info.matched,
      // 以下字段供状态栏/排障显示"为什么是这个版本"
      userLevel: info.level,
      levelSource: info.source,
      userListPath: info.userListPath,
      userListExists: info.userListExists,
      userListCount: info.recordCount,
      parseError: info.parseError,
    };
  });

  // 确定当前用户。等级来源优先级见文件顶部注释（覆盖开关 > 用户表 IP > 个人会话 > 黄金）。
  registerCommand(ipc, "get_current_user", async () => {
    const settings = readSettings();

    // ⚠️ 个人会话等级必须从**账号记录**取，不能读 settings.currentUserLevel ——
    // 那是上一次判定的残留值，拿它当输入会形成回环（上次判成 2 就会一直自称 2）。
    const accountUser =
      settings.loggedIn && settings.username ? getUserByAccount(settings.username) : undefined;
    const info = await resolveCurrentUserLevel({ personalLevel: accountUser?.level ?? 0 });

    const cu: SessionUser = info.matched
      ? {
          kind: "enterprise",
          name: info.cafeName,
          account: info.record?.account || info.record?.ipAddress || "",
          level: info.level,
        }
      : accountUser
        ? { kind: "personal", name: accountUser.name, account: accountUser.account, level: info.level }
        : { kind: "guest", name: "Guest", account: "", level: info.level };

    writeSettings({
      currentUserKind: cu.kind,
      currentUserName: cu.name,
      currentUserLevel: cu.level,
    });
    refreshAppIcons(); // 等级定了 → 窗口/任务栏/托盘换成对应版本的图标
    return toPayload(cu, info.matched);
  });

  // 主动解析门店（用户表按 IP 命中）→ 命中才算识别到，存为当前会话。
  // 未命中返回 null：调用方（公告窗口）走"未识别"分支，最终由 get_current_user 落到黄金版。
  registerCommand(ipc, "resolve_enterprise", async () => {
    const info = await resolveCurrentUserLevel();
    if (!info.matched) return null;
    const cu: SessionUser = {
      kind: "enterprise",
      name: info.cafeName,
      account: info.record?.account || info.record?.ipAddress || "",
      level: info.level,
    };
    writeSettings({ currentUserKind: "enterprise", currentUserName: cu.name, currentUserLevel: cu.level });
    refreshAppIcons(); // 同上：图标跟着等级
    return toPayload(cu, true);
  });

  // 个人账号密码登录。
  // 兼容两种入参：直接传两个字符串 (account, password)，或前端对象包装 { account, password }。
  // 早期只接 spread 风格会与前端对象包装错位，导致登录永远失败。
  ipc.handle(
    "login_personal",
    async (_e, a: string | { account: string; password: string }, b?: string) => {
      const account = typeof a === "string" ? a : a?.account ?? "";
      const password = typeof a === "string" ? b ?? "" : a?.password ?? "";
      const user = await verifyPersonalLogin(account, password);
      if (user) {
        writeSettings({
          loggedIn: true,
          username: user.account,
          currentUserKind: "personal",
          currentUserName: user.name,
          currentUserLevel: user.level,
        });
        refreshAppIcons(); // 个人会话可能带更高的等级（3 = 全解锁）→ 图标跟着换
        return toPayload(user, false);
      }
      return null;
    },
  );

  // 清除个人会话。等级回落到默认的黄金版(1) —— 退登不该留下任何"提权"痕迹
  // （真正该是什么等级由下一次 get_current_user 按用户表重新判定）。
  registerCommand(ipc, "logout", async () => {
    writeSettings({
      loggedIn: false,
      username: undefined,
      currentUserKind: "",
      currentUserName: "",
      currentUserLevel: 1,
    });
    refreshAppIcons(); // 退登回落到黄金版 → 图标也要落回去（不能留着"提权"过的图标）
    return true;
  });

  // 当前用户是否能玩等级 game_level 的游戏。
  // 中间件按 field="gameLevel" 统一解包：兼容对象 { gameLevel } 和直接传数字。
  registerCommand(ipc, "check_can_play", async ({ gameLevel }: { gameLevel?: number }) => {
    const settings = readSettings();
    return canPlay(settings.currentUserLevel, gameLevel ?? 0);
  }, { field: "gameLevel" });
}
