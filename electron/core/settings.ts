// 应用设置读写（存 config.json，不进数据库）。
// 结构对齐原 Rust 的 config.rs：外层是 { settings: {...} }，settings 字段和 AppSettings 一致。
// 读取时把文件里的字段合并到 DEFAULT_SETTINGS 上，保证"缺字段不报错、新增字段有默认值"。

import * as fs from "fs";
import * as path from "path";
import { configPath } from "./paths";
import { AppSettings, DEFAULT_SETTINGS, GameLibrary } from "./models";
import { getGameLibraries } from "./db";

interface ConfigFile {
  settings: AppSettings;
}

// 读设置。文件不存在或损坏时返回默认设置（不直接抛错，保证程序能启动）。
export function readSettings(): AppSettings {
  try {
    if (!fs.existsSync(configPath())) {
      return { ...DEFAULT_SETTINGS };
    }
    const raw = fs.readFileSync(configPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<ConfigFile>;
    // 合并默认值，缺字段用默认。
    return { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
  } catch (e) {
    console.error("[settings] 读取 config.json 失败，使用默认设置:", e);
    return { ...DEFAULT_SETTINGS };
  }
}

// 写设置。只覆盖传入的字段，其余保留文件里已有的值。
// 最终落盘的结构是 { settings: {...} }。
export function writeSettings(patch: Partial<AppSettings>): AppSettings {
  const current = readSettings();
  const next: AppSettings = { ...current, ...patch };
  const file: ConfigFile = { settings: next };
  const dir = path.dirname(configPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(file, null, 2), "utf-8");
  return next;
}

// 把当前设置的"当前登录用户"信息提取出来，供登录态判断用。
export function currentUserFromSettings(s: AppSettings): AppSettings {
  return s;
}

// 获取游戏库列表。游戏库是"业务数据"，单一数据源是数据库 game_libraries 表，
// 不从 config.json 读（配置里已彻底移除该字段，避免双份存储混乱）。
export function getLibraries(): GameLibrary[] {
  try {
    return getGameLibraries();
  } catch {
    // 数据库可能未打开，返回空；正常流程 get_games 前数据库已就绪。
    return [];
  }
}
