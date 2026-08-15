// 管理端 IPC 桥接：调用 Electron 主进程注册的 IPC 命令。
// 命令名、入参、返回值与 Playday 主进程 electron/ipc/* 保持一致。
// window.ipc 由 Electron preload 通过 contextBridge 注入。

// 声明 Electron preload 注入的 window.ipc 类型（admin 独立 tsconfig 不含 src/api 的声明）。
declare global {
  interface Window {
    ipc?: {
      invoke: <T>(channel: string, args?: unknown) => Promise<T>;
      send: (channel: string, args?: unknown) => void;
      on?: (channel: string, listener: (payload: unknown) => void) => void;
    };
  }
}

export function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return window.ipc!.invoke<T>(cmd, args);
}

// ---- 文件 / 目录选择（调用主进程 open_dialog IPC，底层是 Electron 的 dialog）----
export interface PickFileOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}
export async function pickFile(opts?: PickFileOptions): Promise<string> {
  const r = await call<string | null>("open_dialog", { mode: "file", ...opts });
  return r ?? "";
}
export async function pickDirectory(opts?: { title?: string; defaultPath?: string }): Promise<string> {
  const r = await call<string | null>("open_dialog", { mode: "directory", ...opts });
  return r ?? "";
}

export interface GameAction {
  id: string;
  name: string;
  type: string; // "File" | "URL"
  path?: string | null;
  workingDir?: string | null;
  arguments?: string | null;
  isPlayAction: boolean;
  trackGame: boolean;
}

/** A named game library: a unique id + a user-editable name + a root dir path. */
export interface GameLibrary {
  id: string;
  name: string;
  path: string;
}

export interface GameLink {
  name: string;
  url: string;
}

export interface GameVideo {
  type: string;
  url: string;
  name?: string | null;
}

export interface Game {
  id: string;
  name: string;
  gameLevel: number;
  sortName?: string | null;
  localizedNames?: { language: string; name: string }[];
  alternateNames?: string[];
  gameId?: string | null;
  installed?: boolean;
  installDirectory?: string | null;
  playTask?: string | null;
  otherTasks?: string[];
  lastPlayed?: string | null;
  playCount?: number;
  lastActivity?: string | null;
  playtime?: number;
  added?: string;
  modified?: string;
  category: string[];
  genre: string[];
  developer: string[];
  publisher?: string[];
  tags?: string[];
  series?: string[];
  ageRating?: string[];
  region?: string[];
  source?: string[];
  features?: string[];
  releaseDate?: string | null;
  communityScore?: number | null;
  criticScore?: number | null;
  userScore?: number | null;
  hidden?: boolean;
  favorite?: boolean;
  backgroundImage?: string | null;
  coverImage?: string | null;
  icon?: string | null;
  description?: string | null;
  notes?: string | null;
  version?: string | null;
  platform: string[];
  emulator?: string | null;
  completionStatus?: string | null;
  userScoreSet?: boolean;
  manualGame?: boolean;
  pluginId?: string | null;
  links?: GameLink[];
  actions?: GameAction[];
  featuresEnabled?: boolean;
  /** Name of the single game library this game belongs to. */
  gameLibrary?: string | null;
  guide?: string | null;
  screenshots?: string[];
  videos?: GameVideo[];
  preLaunchScript?: string | null;
  preLaunchEnabled?: boolean;
  postLaunchScript?: string | null;
  postLaunchEnabled?: boolean;
  postExitScript?: string | null;
  postExitEnabled?: boolean;
}

export interface PublicUser {
  id: string;
  account: string;
  name: string;
  level: number;
  kind?: string; // "personal" | "enterprise"
  createdAt: string;
}

export interface AppSettings {
  language: string;
  loginEnabled: boolean;
  enterpriseConfigPath: string;
  gameLibraries: GameLibrary[];
}

export interface EnterprisePreview {
  path: string;
  exists: boolean;
  records: number;
  matchedIp?: string;
  matchedName: string;
  matchedLevel: number;
}
