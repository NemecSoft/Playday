// 应用设置读写（存 config.json，不进数据库）。
// 结构对齐原 Rust 的 config.rs：外层是 { settings: {...} }，settings 字段和 AppSettings 一致。
// 读取时把文件里的字段合并到 DEFAULT_SETTINGS 上，保证"缺字段不报错、新增字段有默认值"。

import * as fs from "fs";
import * as path from "path";
import { configPath, legacyConfigPath } from "./paths";
import { AppSettings, DEFAULT_SETTINGS, GameLibrary } from "./models";
import type { DeepPartial } from "../../shared/models";
import { getGameLibraries } from "./db";

interface ConfigFile {
  settings: AppSettings;
}

// 一次性迁移：config.json 原来放在数据目录（<数据根>/config.json），
// 现在跟主程序走（<主程序目录>/config.json）。新位置没有而旧位置有时，
// 把旧文件搬过来，用户的主题/语言/自定义目录等设置不丢。
function migrateLegacyConfig(): void {
  try {
    const newPath = configPath();
    const oldPath = legacyConfigPath();
    if (fs.existsSync(newPath) || !fs.existsSync(oldPath)) return;
    if (path.resolve(newPath) === path.resolve(oldPath)) return;
    fs.copyFileSync(oldPath, newPath);
    console.log("[settings] 已从旧位置迁移 config.json ->", newPath);
  } catch (e) {
    console.error("[settings] 迁移旧 config.json 失败（忽略，用默认设置）:", e);
  }
}

// 读设置。文件不存在或损坏时返回默认设置（不直接抛错，保证程序能启动）。
export function readSettings(): AppSettings {
  try {
    migrateLegacyConfig();
    if (!fs.existsSync(configPath())) {
      return { ...DEFAULT_SETTINGS };
    }
    const raw = fs.readFileSync(configPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<ConfigFile>;
    // 合并默认值，缺字段用默认。
    const merged = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) } as Record<string, unknown>;
    // 历史遗留键清理：databasePath 曾做成可配置，现已废弃（固定"源库 → 运行时库"）。
    // 旧 config.json 里可能残留该键，统一剔除，这样应用下次保存配置时就会把它清掉。
    // 有效配置项（保留）：coverImagesDir / gameDetailsDir / announcementsDir / libraryDir
    //   —— 前两个是旧的目录配置，后两个是本次新增（公告目录、数据库库根）。
    // 注意 databasePath（废弃）与 libraryDir（新增）语义不同：前者指具体 db 文件，
    // 后者指"库根"，源库/运行时库两级固定挂在它下面。所以这里只删 databasePath。
    delete merged.databasePath;
    return merged as unknown as AppSettings;
  } catch (e) {
    console.error("[settings] 读取 config.json 失败，使用默认设置:", e);
    return { ...DEFAULT_SETTINGS };
  }
}

// 写设置。只覆盖传入的字段（补丁语义），其余保留文件里已有的值。
// 嵌套对象做**一层深合并**：save({ cardText: { color } }) 只改颜色，不能把
// cardText 里其余样式字段整体冲掉 —— 以前就是整体替换，于是"先改颜色、再拨描边
// 开关"会把盘上的颜色丢掉（内存里看着正常，重启后颜色回默认）。
// 最终落盘的结构是 { settings: {...} }。
export function writeSettings(patch: DeepPartial<AppSettings>): AppSettings {
  const current = readSettings();
  const cur = current as unknown as Record<string, unknown>;
  const next: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    // 补齐：patch 里的 undefined 是有意义的（如 logout 时 username: undefined），
    // 会原样写入对象，JSON.stringify 时被丢弃 —— 与旧行为一致。
    next[k] = isPlainObject(v) && isPlainObject(cur[k]) ? { ...cur[k], ...v } : v;
  }
  const file: ConfigFile = { settings: next as unknown as AppSettings };
  const dir = path.dirname(configPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(file, null, 2), "utf-8");
  return next as unknown as AppSettings;
}

// 普通对象判定（数组与 null 不算）。
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
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
