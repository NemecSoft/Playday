// 客户端登录 / 权限 / 状态栏 IPC 命令（Task 6）。移植自原 Rust 的 commands/auth.rs。

import { ipcMain } from "electron";
import * as fs from "fs";
import { readSettings, writeSettings } from "../core/settings";
import { getUserByIp } from "../core/db";
import { publicIpv4Address, localIpv4Addresses, verifyPersonalLogin, canPlay, loadEnterpriseRecords } from "../core/auth";
import type { SessionUser } from "../core/models";
import { registerCommand } from "./registry";

// 把当前用户拼成给前端的载荷。
function toPayload(u: SessionUser, enterprise: boolean, configPath: string, configExists: boolean) {
  return {
    kind: u.kind,
    name: u.name,
    account: u.account,
    level: u.level,
    enterprise,
    configPath,
    configExists,
  };
}

export function registerAuthIpc(ipc: typeof ipcMain) {
  // 状态栏数据：本机 IP + 公网 IP + 命中的网吧名。
  registerCommand(ipc, "get_status_bar", async () => {
    const settings = readSettings();
    const cfgPath = settings.enterpriseConfigPath;
    const configExists = fs.existsSync(cfgPath);
    const localIps = localIpv4Addresses();
    const localIp = localIps[0] || "";
    const publicIp = (await publicIpv4Address()) || "";
    // 从 users 表（kind=enterprise）按公网 IP 匹配网吧名。
    let cafeName = "";
    let cafeMatched = false;
    if (publicIp) {
      const u = getUserByIp(publicIp);
      if (u) {
        cafeName = u.name;
        cafeMatched = true;
      }
    }
    return { localIp, publicIp, cafeName, cafeMatched, configPath: cfgPath, configExists };
  });

  // 确定当前用户：企业（公网 IP 匹配）> 个人会话 > 游客(等级3)。
  registerCommand(ipc, "get_current_user", async () => {
    let settings = readSettings();
    const cfgPath = settings.enterpriseConfigPath;
    const cfgExists = fs.existsSync(cfgPath);

    const publicIp = await publicIpv4Address();
    let enterpriseUser = null;
    if (publicIp) enterpriseUser = getUserByIp(publicIp);

    if (enterpriseUser) {
      // 企业用户优先，并持久化到 settings。
      const cu: SessionUser = {
        kind: "enterprise",
        name: enterpriseUser.name,
        account: enterpriseUser.account,
        level: enterpriseUser.level,
      };
      settings = writeSettings({
        currentUserKind: "enterprise",
        currentUserName: cu.name,
        currentUserLevel: cu.level,
      });
      return toPayload(cu, true, cfgPath, cfgExists);
    } else if (settings.loggedIn) {
      // 已登录的个人会话。
      const cu: SessionUser = {
        kind: "personal",
        name: settings.currentUserName,
        account: settings.username || "",
        level: settings.currentUserLevel,
      };
      return toPayload(cu, false, cfgPath, cfgExists);
    } else {
      // 默认游客，全权限（等级3）。
      const cu: SessionUser = { kind: "guest", name: "Guest", account: "", level: 3 };
      settings = writeSettings({
        currentUserKind: "guest",
        currentUserName: cu.name,
        currentUserLevel: cu.level,
      });
      return toPayload(cu, false, cfgPath, cfgExists);
    }
  });

  // 主动解析企业用户（公网 IP 匹配 users 表），命中则存为当前会话。
  registerCommand(ipc, "resolve_enterprise", async () => {
    const settings = readSettings();
    const cfgPath = settings.enterpriseConfigPath;
    const fs = require("fs");
    const cfgExists = fs.existsSync(cfgPath);
    const publicIp = await publicIpv4Address();
    const u = publicIp ? getUserByIp(publicIp) : null;
    if (u) {
      const cu: SessionUser = { kind: "enterprise", name: u.name, account: u.account, level: u.level };
      writeSettings({ currentUserKind: "enterprise", currentUserName: cu.name, currentUserLevel: cu.level });
      return toPayload(cu, true, cfgPath, cfgExists);
    }
    return null;
  });

  // 个人账号密码登录。
  // 兼容两种入参：直接传两个字符串 (account, password)，或前端对象包装 { account, password }。
  // 早期只接 spread 风格会与前端对象包装错位，导致登录永远失败。
  ipc.handle(
    "login_personal",
    async (_e, a: string | { account: string; password: string }, b?: string) => {
      const account = typeof a === "string" ? a : a?.account ?? "";
      const password = typeof a === "string" ? b ?? "" : a?.password ?? "";
      const settings = readSettings();
    const cfgPath = settings.enterpriseConfigPath;
    const user = await verifyPersonalLogin(account, password);
    if (user) {
      writeSettings({
        loggedIn: true,
        username: user.account,
        currentUserKind: "personal",
        currentUserName: user.name,
        currentUserLevel: user.level,
      });
      return toPayload(user, false, cfgPath, fs.existsSync(cfgPath));
    }
    return null;
  });

  // 清除个人会话。
  registerCommand(ipc, "logout", async () => {
    writeSettings({
      loggedIn: false,
      username: undefined,
      currentUserKind: "",
      currentUserName: "",
      currentUserLevel: 3,
    });
    return true;
  });

  // 当前用户是否能玩等级 game_level 的游戏。
  // 中间件按 field="gameLevel" 统一解包：兼容对象 { gameLevel } 和直接传数字。
  registerCommand(ipc, "check_can_play", async ({ gameLevel }: { gameLevel?: number }) => {
    const settings = readSettings();
    return canPlay(settings.currentUserLevel, gameLevel ?? 0);
  }, { field: "gameLevel" });
}
