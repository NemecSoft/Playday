// 管理端（admin）IPC 命令（Task 7）。移植自原 Rust 的 commands/admin.rs。
// 管理游戏等级、管理个人用户账号、管理企业配置、导入企业用户、校验启动路径等。

import { ipcMain } from "electron";
import * as fs from "fs";
import { randomUUID } from "crypto";
import {
  getGames,
  getGame,
  upsertGame,
  listAllUsers,
  getUserByAccount,
  upsertUser,
  deleteUser,
  restoreUser,
  replaceEnterpriseUsers,
  getGameLibraries,
  upsertGameLibrary,
  deleteGameLibrary,
} from "../core/db";
import { readSettings, writeSettings, getLibraries } from "../core/settings";
import { hashPassword, loadEnterpriseRecords, localIpv4Addresses, resolveEnterpriseUser, publicUser } from "../core/auth";
import { validateLaunchPath } from "../core/process";
import type { AppUser, GameLibrary } from "../core/models";

// 给管理端展示的用户（去掉密码哈希/IP 等敏感字段，但保留 kind）。
function toPublic(u: AppUser) {
  return { ...publicUser(u), kind: u.kind };
}

export function registerAdminIpc(ipc: typeof ipcMain) {
  // ---- 用户管理 ----
  ipc.handle("admin_list_users", async () => {
    return listAllUsers().map(toPublic);
  });

  // 新建或更新用户。id 为空 => 新建（账号必须唯一）；否则按账号/ID 更新。
  // kind: "personal" | "enterprise"；password 非空时才更新密码。
  ipc.handle(
    "admin_save_user",
    async (_e, payload: { id?: string; account: string; name: string; level: number; kind: string; password: string }) => {
      const level = Math.min(3, Math.max(1, payload.level));
      const kind = payload.kind.toLowerCase() === "enterprise" ? "enterprise" : "personal";
      const id = payload.id || "";
      if (!id) {
        // 新建
        if (!payload.account.trim()) throw new Error("账号不能为空");
        if (!payload.password) throw new Error("密码不能为空");
        if (getUserByAccount(payload.account.trim())) throw new Error("账号已存在");
        const user: AppUser = {
          id: randomUUID(),
          account: payload.account.trim(),
          passwordHash: hashPassword(payload.password),
          name: payload.name.trim() ? payload.name : payload.account,
          level,
          kind,
          ipAddress: "",
          createdAt: new Date().toISOString(),
        };
        upsertUser(user);
        return toPublic(user);
      }
      // 更新：先按账号找，找不到再按 id 找。
      let user = getUserByAccount(payload.account);
      if (!user) user = listAllUsers().find((u) => u.id === id) || null;
      if (!user) throw new Error(`找不到用户：${id}`);
      user.account = payload.account;
      user.name = payload.name;
      user.level = level;
      user.kind = kind;
      if (payload.password) user.passwordHash = hashPassword(payload.password);
      upsertUser(user);
      return toPublic(user);
    }
  );

  ipc.handle("admin_delete_user", async (_e, a: string | { id: string }) => {
    const id = typeof a === "string" ? a : a?.id ?? "";
    deleteUser(id); // 软删除
    return true;
  });

  ipc.handle("admin_restore_user", async (_e, a: string | { id: string }) => {
    const id = typeof a === "string" ? a : a?.id ?? "";
    const u = restoreUser(id);
    if (!u) throw new Error(`找不到用户：${id}`);
    return toPublic(u);
  });

  // ---- 设置 / 企业配置 ----
  ipc.handle("admin_get_settings", async () => {
    return readSettings();
  });

  ipc.handle("admin_set_enterprise_config", async (_e, a: string | { configPath: string }) => {
    const configPath = typeof a === "string" ? a : a?.configPath ?? "";
    return writeSettings({ enterpriseConfigPath: configPath });
  });

  // 预览企业配置文件：多少条记录、本机 IP 是否命中。
  ipc.handle("admin_preview_enterprise", async (_e, a: string | { configPath: string }) => {
    const configPath = typeof a === "string" ? a : a?.configPath ?? "";
    const records = loadEnterpriseRecords(configPath);
    const localIps = localIpv4Addresses();
    const matched = resolveEnterpriseUser(records, localIps);
    return {
      path: configPath,
      exists: fs.existsSync(configPath),
      records: records.length,
      matchedIp: localIps[0] ?? null,
      matchedName: matched?.name ?? "",
      matchedLevel: matched?.level ?? 0,
    };
  });

  // 导入企业用户：从 JSON 文件（旧格式数组）读入，写入 users 表 kind=enterprise。
  ipc.handle("admin_import_enterprise_users", async (_e, a: string | { jsonPath: string }) => {
    const jsonPath = typeof a === "string" ? a : a?.jsonPath ?? "";
    if (!fs.existsSync(jsonPath)) throw new Error(`无法读取文件：${jsonPath}`);
    const text = fs.readFileSync(jsonPath, "utf-8");
    let records;
    try {
      records = JSON.parse(text);
    } catch {
      throw new Error(`JSON 解析失败：${jsonPath}`);
    }
    if (!Array.isArray(records)) throw new Error(`JSON 格式错误：应为数组`);
    const now = new Date().toISOString();
    const users: AppUser[] = [];
    let skippedEmpty = 0;
    for (const r of records) {
      const ip = String(r.UserIpAddress ?? r.user_ip_address ?? "").trim();
      if (!ip) {
        skippedEmpty++;
        continue;
      }
      const name = String(r.UserName ?? r.user_name ?? "").trim() || String(r.UserAccount ?? r.user_account ?? "").trim() || ip;
      const account = String(r.UserAccount ?? r.user_account ?? "").trim() || ip;
      const level = Math.min(3, Math.max(1, Number(r.UserLevel ?? r.user_level ?? 1) || 1));
      users.push({
        id: randomUUID(),
        account,
        passwordHash: "",
        name,
        level,
        kind: "enterprise",
        ipAddress: ip,
        createdAt: now,
      });
    }
    const imported = replaceEnterpriseUsers(users);
    return { imported, skippedEmpty };
  });

  ipc.handle("admin_list_enterprise_users", async () => {
    return listAllUsers().filter((u) => u.kind === "enterprise");
  });

  ipc.handle("admin_delete_enterprise_user", async (_e, a: string | { id: string }) => {
    const id = typeof a === "string" ? a : a?.id ?? "";
    deleteUser(id);
    return true;
  });

  // ---- 游戏等级 ----
  ipc.handle(
    "admin_set_game_level",
    async (_e, a: string | { gameId: string; level: number }, b?: number) => {
      const gameId = typeof a === "string" ? a : a?.gameId ?? "";
      const level = typeof a === "string" ? b ?? 1 : a?.level ?? 1;
      const game = getGame(gameId);
      if (!game) throw new Error(`找不到游戏：${gameId}`);
      game.gameLevel = Math.min(3, Math.max(1, level));
      game.modified = new Date().toISOString();
      upsertGame(game);
      return true;
    }
  );

  // ---- 启动路径校验 ----
  ipc.handle(
    "admin_validate_action",
    async (_e, a: string | { p: string; type?: string }, b?: string) => {
      const p = typeof a === "string" ? a : a?.p ?? "";
      const type = typeof a === "string" ? b : a?.type;
      return validateLaunchPath(p, type, getLibraries());
    }
  );

  // 软校验：文件不存在但占位符/扩展名没明显错误时放行（管理端编辑游戏用）。
  ipc.handle(
    "admin_soft_validate_action",
    async (_e, a: string | { p: string; type?: string }, b?: string) => {
      const p = typeof a === "string" ? a : a?.p ?? "";
      const type = typeof a === "string" ? b : a?.type;
      const full = validateLaunchPath(p, type, getLibraries());
    if (full.valid) return full;
    // 拼写错误（占位符提示纠错）明确阻止。
    if (full.reason.includes("你可能想写") || full.reason.includes("找不到对应游戏库")) return full;
    // 占位符没问题但文件不存在（可能开发中）→ 放行。
    if (full.reason.startsWith("文件不存在")) {
      return { valid: true, resolved: full.resolved, reason: "", extension: full.extension };
    }
    return full;
  });

  // 对选中的多个游戏做"运行前检测"（批量体检）。
  ipc.handle("validate_selected_actions", async (_e, a: string[] | { gameIds: string[] }) => {
    const gameIds = Array.isArray(a) ? a : a?.gameIds ?? [];
    const libs = getLibraries();
    return gameIds.map((id) => {
      const game = getGame(id);
      if (!game) {
        return { gameId: id, gameName: "(已删除)", actionName: "", exePath: "", exists: false, reason: "找不到该游戏" };
      }
      const play = game.actions.find((a) => a.isPlayAction) || game.actions.find((a) => a.type === "File");
      if (!play) {
        return { gameId: game.id, gameName: game.name, actionName: "", exePath: "", exists: false, reason: "未配置启动指令" };
      }
      const exePath = play.path || "";
      if (!exePath.trim()) {
        return { gameId: game.id, gameName: game.name, actionName: play.name, exePath: "", exists: false, reason: "启动指令路径为空" };
      }
      const r = validateLaunchPath(exePath, "File", libs);
      return { gameId: game.id, gameName: game.name, actionName: play.name, exePath: r.resolved, exists: r.valid, reason: r.reason };
    });
  });

  // ---- 游戏库（按根目录组织）管理 ----
  // 游戏库是"数据"，权威存数据库 game_libraries 表，config.json 不再写（历史双写已去掉）。
  ipc.handle("admin_get_game_libraries", async () => {
    return getGameLibraries();
  });

  ipc.handle("admin_save_game_library", async (_e, a: GameLibrary | { lib: GameLibrary }) => {
    const lib = a && "lib" in a ? a.lib : a;
    const newLib = { ...lib, name: lib.name.trim(), path: lib.path.trim() };
    if (!newLib.id) newLib.id = "lib-" + randomUUID().split("-")[0];
    upsertGameLibrary(newLib);
    return getGameLibraries();
  });

  ipc.handle("admin_delete_game_library", async (_e, a: string | { id: string }) => {
    const id = typeof a === "string" ? a : a?.id ?? "";
    deleteGameLibrary(id);
    return getGameLibraries();
  });

  // ---- 游戏库整体数据（管理端编辑用） ----
  ipc.handle("admin_get_all_games", async () => {
    return getGames();
  });
}
