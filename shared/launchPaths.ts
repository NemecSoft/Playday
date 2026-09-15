// 启动路径解析规则 —— 纯函数，零 import（不依赖 electron / node:path / fs）。
//
// 为什么要单独抽出来：
//   1) 这套规则过去只写在 electron/core/process.ts 里，只能靠手搓临时脚本验证；
//      抽成纯函数后可以直接单测（launchPaths.test.ts），改动不再靠人肉回归。
//   2) 规则本身多且容易踩（{库名} / {InstallDir} / 相对安装目录 / 相对游戏根），
//      权威说明见 docs/design/launch-and-paths.md，每条规则都有对应单测。
//
// 分隔符约定：**统一用 `/`**（输出的规范形式）。
// 为什么是 `/` 而不是 `\`：
//   1) 写 config.json 时 `\` 必须转义成 `\\`（"D:\\YunGame"），容易写错、难读；
//      JSON 里 `/` 不需要转义，网络路径 `//NAS/share/...` 也能直接写。
//   2) Windows 的 API（Node fs / spawn / Electron / sql.js）都接受 `/`。
// 代价与对策（两条都要守住）：
//   - **输入两种都收**：现有数据库里存的是 `\`（`bin\Inversion.exe` 之类），
//     绝不强制迁移；所有解析入口都用 split(/[\\/]/) 兼容两种写法。
//   - **交给 cmd.exe 时必须换回 `\`**：cmd 会把以 `/` 开头的 token 当开关，
//     所以拼命令行（启动 .bat）前用 toCmdPath() 转换。
// 比较路径（如封面白名单）必须**两侧都过同一个规范化函数**，不能一边 `\` 一边 `/`。

/** 游戏库占位符定义（对应 game_libraries 表的 name/path）。 */
export interface PathLibrary {
  name: string;
  path: string;
}

const SEP = "/";
/** Windows 原生分隔符（只给 toCmdPath 用）。 */
const SEP_WIN = "\\";

/**
 * 词法规范化：折叠 `.` 与 `..`、把分隔符统一成 `/`、去掉空段。不碰磁盘。
 *
 * ⚠️ 必须保留 **UNC 前缀**：`\\server\share` 或 `//server/share` 开头那两个斜杠
 * 不是"空段"，当成空段丢掉的话 `//NAS/Games` 会变成相对路径 `NAS/Games` ✗
 * （网吧常把游戏/封面放网络共享，这条会被踩）。统一输出成 `//server/share` 形式。
 */
export function normalizePath(p: string): string {
  const raw = String(p);
  const unc = /^[\\/]{2}[^\\/]/.test(raw);
  const parts = raw.split(/[\\/]/);
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      if (out.length) out.pop();
      else out.push("..");
    } else {
      out.push(part);
    }
  }
  const joined = out.join(SEP);
  return unc ? SEP + SEP + joined : joined;
}

/** 拼接两段路径并规范化。 */
export function joinPaths(base: string, rest: string): string {
  return normalizePath(`${base}${SEP}${rest}`);
}

/**
 * 转成 cmd.exe 习惯的反斜杠形式。**只用于拼命令行**（启动 .bat / 脚本）：
 * cmd 会把以 `/` 开头的 token 当开关，`//NAS/share/x.bat` 直接传会被当成非法开关。
 * 文件系统 API 不需要它（Windows 接受 `/`）。
 */
export function toCmdPath(p: string): string {
  return normalizePath(p).replace(/\//g, SEP_WIN);
}

/**
 * "显示控制台窗口"地启动 `.bat` / `.cmd` 时，交给 `spawn(comspec, argv)` 的**参数表**
 * （第一个参数 comspec 由调用方传，这里只出参数）。规则见
 * docs/design/launch-and-paths.md §5，几条都是实测定下来的：
 *
 * 1) **必须经 `start`**：把 bat 直接交给 `cmd /c` 跑，在 Electron 这种 GUI 父进程里
 *    不会弹出窗口（窗口能否创建受父进程控制台状态影响）。
 * 2) **`start` 里必须再套一层 `cmd /c`**（2026-09-14 修）：`start` 对 `.bat` 是用
 *    **`cmd /K`** 跑的 —— 实测能抓到常驻的 `cmd.exe /K <bat>` 进程。于是脚本结束后
 *    那个 shell 不退：控制台窗口卡在提示符上、外层 `/wait` 也永远不返回
 *    （用户报的现象就是"退出游戏后窗口留在 `D:\...>` 不动"）。
 *    显式写 `cmd /c` 后：脚本结束 → 该 shell 退出 → 窗口自动关闭。
 * 3) `/wait` 保留"脚本退出 = 启动器退出"的语义（§6 的计时依赖它）。实测改法前后
 *    外层都在**脚本结束时刻**退出（脚本 5s、外层 5.2s 退），语义未变。
 * 4) 路径含空格、带参数都实测通过（bat 里 `%*` 拿到了传参）。
 */
export function batConsoleArgs(
  comspec: string,
  batPath: string,
  args: readonly string[] = [],
): string[] {
  // toCmdPath：内部统一用 `/`，但 cmd 会把以 `/` 开头的 token 当开关
  // （`//NAS/share/x.bat` 直接传会被判成非法开关），拼命令行前换回 `\`。
  return ["/d", "/s", "/c", "start", "", "/wait", comspec, "/c", toCmdPath(batPath), ...args];
}

/** 是否以 `{占位符}` 开头（只认开头的占位符，与老实现一致）。 */
export function startsWithPlaceholder(p: string): boolean {
  return p.trimStart().startsWith("{");
}

/** 是否绝对路径：`D:\...`、`D:/...`，或 UNC `\\server\share` / `//server/share`。 */
export function isAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || /^[\\/]{2}[^\\/]/.test(p);
}

/**
 * 解析 `{库名}\rest` 形式的库占位符。
 * 只有 token 与某个库名相等（大小写不敏感）时才算命中；否则返回 null
 * —— `{InstallDir}` 这类"不是库名的占位符"必须落到别的分支处理。
 */
export function resolveLibraryPlaceholder(
  p: string,
  libraries: readonly PathLibrary[],
): { rest: string; root: string } | null {
  const trimmed = p.trimStart();
  if (!trimmed.startsWith("{")) return null;
  const end = trimmed.indexOf("}");
  if (end < 0) return null;
  const token = trimmed.slice(1, end);
  if (!token) return null;
  const lib = libraries.find((l) => l.name.toLowerCase() === token.toLowerCase());
  if (!lib || !lib.path.trim()) return null;
  return { rest: trimmed.slice(end + 1).replace(/^[\\/]+/, ""), root: lib.path };
}

/**
 * 把路径解析成绝对路径（不碰磁盘）：
 *   - `{库名}\rest` → 库根 + rest
 *   - 绝对路径        → 原样
 *   - 相对路径        → 以 gameRoot（config.json 的 defaultGameRootPath）为基准
 */
export function resolvePath(p: string, libraries: readonly PathLibrary[], gameRoot: string): string {
  if (!p) return p;
  const lib = resolveLibraryPlaceholder(p, libraries);
  if (lib) return joinPaths(lib.root, lib.rest);
  // 绝对路径：内容不变，但分隔符也统一成 `/`（输出的规范形式只有一种，
  // 免得下游比较/展示时出现 `D:\a` 与 `D:/a` 两种写法）。
  if (isAbsolutePath(p)) return normalizePath(p);
  return joinPaths(gameRoot, p);
}

/** 解析基准：命中哪条分支（便于日志/测试断言，不参与运行逻辑）。 */
export type PathBasis = "library" | "absolute" | "installDir" | "gameRoot";

export interface ResolvedActionPath {
  /** 最终要执行/校验的绝对路径；出错时为空串。 */
  path: string;
  basis: PathBasis;
  /** 出错原因（仅当无法解析时给出，调用方原样抛给用户）。 */
  error?: string;
}

/**
 * 游玩指令 path 的解析 —— 启动链路的核心规则。
 *
 * 三种基准（顺序即优先级）：
 *   1) 原始 path 是相对路径（既不以 `{` 开头、也不是绝对路径，如 `TPC.exe`、
 *      `bin\Inversion.exe`）→ 以**安装目录**为基准（Playnite 语义）。
 *   2) 展开占位符后以 `{库名}` 开头 → 库根（库占位符）。
 *   3) 其余相对结果 → 以**游戏根**（defaultGameRootPath）为基准。
 *   绝对路径始终原样。
 *
 * 注意 `{InstallDir}` 展开后得到的是"相对游戏根"的路径（install_directory 本身
 * 就是按游戏根存的），所以它走第 3 条，**不能**再按安装目录拼一次。
 *
 * @param expand 占位符展开器（{InstallDir}/{GameName}/…）。做成回调是为了让本文件
 *               保持纯函数、不依赖游戏模型；主进程传入 expandVariables。
 */
export function resolveActionPath(opts: {
  actionPath: string;
  /** 已解析成绝对的安装目录；空串 = 该游戏没配 install_directory。 */
  installDir: string;
  libraries: readonly PathLibrary[];
  gameRoot: string;
  expand: (s: string) => string;
}): ResolvedActionPath {
  const raw = (opts.actionPath || "").trim();
  if (!raw) return { path: "", basis: "absolute", error: "启动指令路径为空" };
  // 需要 {InstallDir} 但游戏没配安装目录：直接给明确原因，而不是拼出一个
  // 不存在的怪路径再报"文件不存在"。
  if (/\{InstallDir\}/i.test(raw) && !opts.installDir) {
    return {
      path: "",
      basis: "absolute",
      error: `该游戏未配置安装目录（install_directory 为空），无法解析启动路径：${raw}`,
    };
  }
  const expanded = opts.expand(raw);
  const relativeInData = !startsWithPlaceholder(raw) && !isAbsolutePath(raw);
  if (relativeInData && opts.installDir) {
    return { path: joinPaths(opts.installDir, expanded), basis: "installDir" };
  }
  const basis: PathBasis = startsWithPlaceholder(expanded)
    ? "library"
    : isAbsolutePath(expanded)
      ? "absolute"
      : "gameRoot";
  return { path: resolvePath(expanded, opts.libraries, opts.gameRoot), basis };
}

/**
 * "逐游戏显示 .bat 控制台"的三态归并（规则见 docs/design/launch-and-paths.md §5）。
 *
 * 三态从哪来：`games.show_bat_console` 是**可空**列 ——
 *   `NULL`    = 这个游戏没配 → 用全局设置（设置界面的 `showBatConsole`）
 *   `0` / `1` = 明确的逐游戏覆盖（强制隐藏 / 强制显示）
 *
 * ⚠️ 两个坑都会**静默失效**（不报错、界面上看不出来），所以抽成纯函数、单测钉住：
 *   1) 必须用 `??` 而不是 `||`。写成 `game || global` 时，逐游戏的 `false`（强制隐藏）
 *      会被当成"没配"悄悄回落到全局值 —— "总不显示"这个配置**永远不生效**。
 *   2) 数据库的 NULL 必须映射成 `undefined`，**不能 `!!行值`**：`!!null` 得 `false`，
 *      等于给所有游戏强行写了"总是隐藏"，全局开关就此变成**死设置**。
 */
export function resolveShowBatConsole(
  gameValue: boolean | undefined,
  globalValue: boolean,
): boolean {
  return gameValue ?? globalValue;
}

/** 数据库那列（可空 INTEGER / 布尔 / 字符串）→ 三态布尔。NULL / 空 / 认不出来 = 未配置。 */
export function parseStoredBatConsole(v: unknown): boolean | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "boolean") return v;
  if (typeof v === "string" && v.trim() === "") return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) return undefined;
  return n !== 0;
}
