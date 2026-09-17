// 应用图标（窗口 / 任务栏 / 托盘）按**当前用户等级**选：黄金版 `1.ico`、钻石版 `2.ico`。
//
// 需求（2026-09-16 变更）："如果用户是黄金版用 1.ico，如果是钻石版用 2.ico，并且把这 2 个图标作为资源"。
//
// 为什么需要"运行期刷新"（不是启动时定一个就完事）：
//   等级是**开机之后**才判出来的 —— 读用户表按公网 IP 命中（见 docs/design/user-level-detection.md），
//   而且个人会话登录/退登还会再变。所以图标必须能跟着重算：`refreshAppIcons()`。
//   启动那一刻先用**上次落库的等级**（settings.currentUserLevel）把首帧画对，等真正判定出来再刷一次。
//
// 调用点（别漏）：
//   · electron/main.ts —— 启动时（公告窗口建好、托盘建好之后）刷一次；
//   · electron/ipc/auth.ts —— 每条"把等级写进 settings"的命令之后（get_current_user /
//     resolve_enterprise / login_personal / logout）刷一次。
//
// 图标文件在哪：与**桌面快捷方式**用的是同一份 —— `dev-tools/yungamestart/assets/1.ico`、`2.ico`
// （由 make-icons.mjs 生成）。开发态直接读仓库里那份；打包时由 electron-builder 的
// extraResources 带到 `resources/` 下（所以两种形态各有一个候选路径）。
// 详见 docs/design/app-icons.md。

import { BrowserWindow, nativeImage, type NativeImage } from "electron";
import * as fs from "fs";
import * as path from "path";
import { iconNameForLevel } from "../../shared/userLevel";
import { readModeTable, runtimeValue } from "../../shared/pathModes";
import { readSettings } from "./settings";

/**
 * 开发态图标目录：**从 path-modes.json 的 dev 段取**（`yungamestartDir`），这里不写目录名。
 *
 * 为什么这么写（2026-09-17 踩过）：原先这里是 `path.join(__dirname, "../../../tools/yungamestart/assets")`
 * —— 目录改名成 `dev-tools` 之后它静默失效，表现成"等级判对了、图标还是应用默认的那个"，不报错。
 * 改成"向上找仓库根的标记文件 path-modes.json"：从源码跑、从 dist-electron 跑都能找到根，与目录深度无关。
 */
function devIconDir(): string | null {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const marker = path.join(dir, "path-modes.json");
    if (fs.existsSync(marker)) {
      try {
        const table = readModeTable(JSON.parse(fs.readFileSync(marker, "utf-8")));
        return path.resolve(dir, runtimeValue(table.dev.yungamestartDir));
      } catch {
        return null;
      }
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/**
 * 候选路径：dev 在仓库里（表说的那个目录，外加它的 `assets` 兄弟目录 —— 那是图标源文件所在，
 * `build.bat` 会把它们复制进 dist），打包态在 `resources/` 下。都找不到返回 null。
 */
function findIcon(file: string): string | null {
  const dev = devIconDir();
  const candidates = [
    ...(dev ? [path.join(dev, file), path.join(dev, "..", "assets", file)] : []),
    path.join(process.resourcesPath || "", file),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * 当前等级对应的图标路径（拿不到本等级那份就退黄金版；都没有返回 null → 调用方跳过，不崩）。
 * 纯读 settings，不缓存：等级一变就该拿到新值。
 */
export function currentLevelIconPath(): string | null {
  const level = readSettings().currentUserLevel ?? 1;
  return findIcon(iconNameForLevel(level)) ?? findIcon("1.ico");
}

/**
 * 托盘图标的更新入口，由 `tray.ts` 在创建托盘后注册进来。
 *
 * 为什么要这么绕一下（而不是这里直接 `import { ... } from "./tray"`）：
 * tray.ts 需要本模块的 `currentLevelIconPath()` 来选托盘图标，本模块又需要去设置托盘图标 ——
 * 直接互相 import 就成了循环依赖。用一个注册回调把"往哪儿画"注入进来，依赖方向就只剩
 * tray → appIcon 一条了。
 */
let trayUpdater: ((img: NativeImage) => void) | null = null;

export function registerTrayIconUpdater(fn: (img: NativeImage) => void): void {
  trayUpdater = fn;
}

/**
 * 把当前等级的应用图标应用到**所有窗口 + 托盘**。
 * 任何一步失败都只跳过那一步（图标不对是小事，崩了是大事）。
 */
export function refreshAppIcons(): void {
  const p = currentLevelIconPath();
  if (!p) return;
  let img: NativeImage;
  try {
    img = nativeImage.createFromPath(p);
    if (img.isEmpty()) return;
  } catch {
    return;
  }
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      // Windows 上只靠 BrowserWindow 构造时的 icon 选项有时不生效（任务栏会显示 Electron
      // 默认图标），setIcon() 才是可靠做法 —— 这条是 windows.ts 里早先踩过的坑。
      win.setIcon(img);
    } catch {
      /* ignore */
    }
  }
  try {
    trayUpdater?.(img);
  } catch {
    /* ignore */
  }
}
