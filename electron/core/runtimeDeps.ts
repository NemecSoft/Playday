// 运行库依赖的"规则层"：装没装的判据、安装命令行怎么拼、进程输出怎么读。
//
// 本文件**不 import electron、不碰文件系统** —— 全是纯函数，所以能在 node 环境的单测里
// 直接跑（见 runtimeDeps.test.ts）。真正干活的那层（找文件、起进程、写日志）在
// runtimeSetup.ts，启动时由 main.ts 调一次。
//
// 为什么是"先检测、确认缺了才装"，而不是每次启动都跑一遍安装器：
//   VC 运行库的安装器要几十秒、非管理员时还会弹 UAC；VP9 扩展的注册要几秒。
//   每次启动都跑等于把启动拖死，而反复安装本身也不是无害操作。
//   判据取"系统里已登记"这个**事实**，而不是猜某个文件在不在（理由见 vcRedistRegKey）。

import * as path from "path";

/** 运行库依赖的种类。 */
export type RuntimeDepKind = "vc-redist" | "appx";

/** VC 运行库的架构。x64 与 x86 是**两套独立的运行库**，必须分别检测：只装了 x86 不等于 x64 够用。 */
export type VcArch = "x64" | "x86";

/** 一项运行库依赖。 */
export interface RuntimeDep {
  /** 稳定 id（日志与测试用）。 */
  id: string;
  kind: RuntimeDepKind;
  /** 安装包文件名（相对运行库目录；目录查找顺序见 runtimeSetup.ts）。 */
  fileName: string;
  /** 中文名，只用于日志。 */
  label: string;
  /** 仅 vc-redist：架构。 */
  arch?: VcArch;
  /** 仅 appx：包名匹配用的通配串（Get-AppxPackage -Name 的入参）。 */
  appxNamePattern?: string;
}

/**
 * 要检测安装的三样东西。
 * 文件名里的版本号写死是**故意**的：这几个包是随客户端一起发的固定资产，
 * 升级包 = 换文件 + 改这一行（改成动态扫描目录会让"到底发的哪一版"变得看不出来）。
 */
export const RUNTIME_DEPS: readonly RuntimeDep[] = [
  {
    id: "vp9",
    kind: "appx",
    fileName: "Microsoft.VP9VideoExtensions_1.2.6.0_neutral.AppxBundle",
    label: "VP9 视频解码扩展",
    appxNamePattern: "*VP9VideoExtensions*",
  },
  {
    id: "vc-x64",
    kind: "vc-redist",
    fileName: "VC_redist.x64.exe",
    label: "VC++ 运行库 (x64)",
    arch: "x64",
  },
  {
    id: "vc-x86",
    kind: "vc-redist",
    fileName: "VC_redist.x86.exe",
    label: "VC++ 运行库 (x86)",
    arch: "x86",
  },
];

// ---- VC++ 运行库（14.x = VS 2015 ~ 2022）----

/**
 * VC 运行库在注册表里的登记位置。
 *
 * 这是微软自己的安装器写下的键（不是我们约定的）：
 *   Installed  REG_DWORD  0x1
 *   Version    REG_SZ     v14.38.33130.00
 * 用注册表而不是"去 System32 看 msvcp140.dll 在不在"：大量程序会把自己编译时
 * 用的那份 dll 带在**自己的目录**里，那种 dll 的存在并不能说明系统装了运行库 ——
 * 拿它当判据会得出"已安装"然后跳过真正的安装，故障表现还是"某些游戏跑不起来"。
 *
 * x86 那份在 64 位系统上会被写到 WOW6432Node（32 位视图）下，所以显式把全路径写出来：
 * 本进程是 64 位的，读 HKLM\SOFTWARE 拿到的是 64 位视图，只有写全才能稳。
 */
export function vcRedistRegKey(arch: VcArch): string {
  const sub = "Microsoft\\VisualStudio\\14.0\\VC\\Runtimes";
  return arch === "x64"
    ? `HKLM\\SOFTWARE\\${sub}\\x64`
    : `HKLM\\SOFTWARE\\WOW6432Node\\${sub}\\x86`;
}

/**
 * 从 `reg query <键>` 的输出里取一个值（取不到返回 null）。
 * 输出形如：
 *   HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64
 *       Installed    REG_DWORD    0x1
 *       Version      REG_SZ       v14.38.33130.00
 * 值本身可能含空格（我们后面还拿它拼 /log 路径），所以取"类型之后的一整行"而不是按空白切列。
 */
export function parseRegValue(stdout: string, valueName: string): string | null {
  const re = new RegExp(`^\\s+${valueName}\\s+REG_\\w+\\s+(.*)$`, "mi");
  const m = re.exec(stdout);
  return m ? m[1].trim() : null;
}

/** 装没装的判断结果。 */
export interface DepDecision {
  /** true = 需要（重新）安装。 */
  install: boolean;
  /** 判据说明 —— 会写进日志，现场排查时靠它知道"为什么跳过了"。 */
  reason: string;
}

/**
 * 由注册表读出的事实判断某个架构的 VC 运行库装没装。
 *
 * 只认 `Installed == 1`，**不比对具体版本号**：14.x 系列（2015 ~ 2022）的 VC 运行库是
 * 二进制向后兼容的 —— 装了 14.0 就能跑用 14.4 编出来的程序。反过来若按版本号比大小，
 * 微软每发一版（14.38 → 14.40）都会让所有机器"重新装一遍"，纯属自找麻烦。
 * （reg query 的 DWORD 输出是 0x1 / 0x0 这种十六进制写法，两种写法都认。）
 */
export function decideVcRedist(raw: { installed?: string | null; version?: string | null }): DepDecision {
  const installed = (raw.installed ?? "").trim();
  const version = (raw.version ?? "").trim();
  if (!installed) return { install: true, reason: "注册表里没有登记（没装过）" };
  if (installed === "0x1" || installed === "1") {
    return { install: false, reason: `已安装${version ? `（${version}）` : ""}` };
  }
  if (installed === "0x0" || installed === "0") {
    return { install: true, reason: `Installed=${installed}（标记为未安装）` };
  }
  return { install: true, reason: `Installed=${installed}（取值不是预期的 0x0/0x1，保守按未安装处理）` };
}

/**
 * VC 运行库的静默安装参数（微软官方 Burn 参数）：
 *   /install     明确动作，不弹交互
 *   /quiet       完全静默（无界面、无进度条）
 *   /norestart   装完**不自动重启** —— 网吧机器被安装器重启是事故，必须显式禁掉
 *   /log <file>  留一份安装日志，装失败时现场能查
 * 特意不用 /passive：那是"显示进度条"的形态，属于有界面，与"静默"矛盾。
 */
export function buildVcRedistArgs(logFile: string): string[] {
  return ["/install", "/quiet", "/norestart", "/log", logFile];
}

/** VC 运行库安装器的成功退出码：0 = 成功；3010 = 成功但需重启才完全生效（我们不会重启）。 */
export function isVcRedistSuccess(code: number | null): boolean {
  return code === 0 || code === 3010;
}

// ---- VP9 视频解码扩展（AppxBundle）----

/** PowerShell 输出的动作标记：让主进程凭一行 stdout 判断干了什么，而不是靠退出码猜。 */
export const PS_MARK_SKIP = "PLAYDAY:RUNTIME:SKIP";
export const PS_MARK_INSTALLED = "PLAYDAY:RUNTIME:INSTALLED";

/** 把字符串拼成 PowerShell 单引号字面量（内部的单引号要写两遍）。 */
export function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * 检测并注册 VP9 解码扩展的 PowerShell 脚本。
 *
 *   Get-AppxPackage  查的是**当前用户**已注册的包；
 *   Add-AppxPackage  也是给当前用户注册 .AppxBundle。
 *   两者作用域一致，且都不需要管理员权限 —— 这正是选它们而不是
 *   Add-AppxProvisionedPackage（那是"给全机器铺开"，要管理员）的原因。
 *   代价：AppX 注册是按用户来的，所以一台机器上每个 Windows 账号各注册一次是正常的；
 *   这事由"每次启动都检测一次"自然覆盖（新账号第一次进系统就把自己那份补上）。
 *
 * 一次 PowerShell 里把"查 + 装"做完（省一次进程启动），靠上面的标记回话。
 *
 * 脚本里**只用单引号、不出现双引号**：整段是当做一个命令行参数传给 -Command 的，
 * 里面若有双引号就要和 Windows/Node 的转义规则打架，单引号最稳（有单测锁这条）。
 */
export function buildAppxScript(bundlePath: string, namePattern: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    // 关掉进度流：Get-AppxPackage 会往 stderr 写进度记录，在非交互会话里会被序列化成
    // CLIXML 文本，把"真出错时"那几行错误淹掉。
    "$ProgressPreference = 'SilentlyContinue'",
    `$p = Get-AppxPackage -Name ${psQuote(namePattern)}`,
    "if ($p) {",
    // 括号不能省：命令是**参数模式**解析的，`Write-Output 'a' + $b` 会把 "+" 当成
    // 第三个字面参数输出，而不是拼接。
    `  Write-Output (${psQuote(PS_MARK_SKIP + " ")} + $p.PackageFullName)`,
    "} else {",
    `  Add-AppxPackage -Path ${psQuote(bundlePath)} -ErrorAction Stop`,
    `  Write-Output ${psQuote(PS_MARK_INSTALLED)}`,
    "}",
  ].join("\n");
}

/** PowerShell（静默、无窗口）的公共参数。 */
export function buildPowershellArgs(script: string): string[] {
  return [
    "-NoProfile", // 不加载用户 profile：现场机器上的 profile 可能改执行策略甚至报错
    "-NonInteractive", // 不交互：任何"要用户点一下"的路径都必须失败而不是挂住
    "-ExecutionPolicy", "Bypass",
    // 这里**故意没有 -WindowStyle Hidden**：本机实测加上它，PowerShell 会以 -1 退出、
    // 且 stdout/stderr 全空（连 "hi" 都打不出来）—— 窗口是外层 spawn 的 windowsHide
    // 关掉的，它已经没有窗口可隐藏，这个开关反而把进程搞死。表现是"检测结果永远为空"，
    // 很难联想到是参数问题。别再加回来。
    "-Command", script,
  ];
}

// ---- 权限 ----

/**
 * 从 `whoami /groups` 的输出里判断当前进程是不是管理员的（高完整性）令牌。
 *
 * 判 SID 而不是组名：组名随系统语言变（Administrators / 管理员），SID 不变。
 *   S-1-16-12288 = High（UAC 提升后的管理员）
 *   S-1-16-16384 = System（比管理员还高）
 * 为什么非要知道这个：VC 运行库的安装器要求管理员权限，非管理员会话直接跑会
 * **弹 UAC 对话框**（或在静默参数下干脆失败）。对"开机就跑的网吧客户端"来说，
 * 前者打扰玩家、后者静默失败 —— 都不如"不试、只记一条日志"。
 */
export function parseElevated(whoamiGroupsOutput: string): boolean {
  return /S-1-16-(12288|16384)\b/i.test(whoamiGroupsOutput);
}

// ---- 系统工具路径 ----

/**
 * System32 下某个系统自带工具的绝对路径。
 *
 * 为什么要写绝对路径、不直接用 `"reg"` / `"powershell"` 让系统去 PATH 里找：
 * 本机实测 `where.exe powershell` 指向的是 **PowerShell 7**
 * （`C:\Program Files\PowerShell\7\powershell.exe` —— 装了 PS7 之后它会插到 PATH 最前），
 * 而 PS7 里 `Get-AppxPackage` 直接报 "module could not be loaded … (0x80131539)"：
 * Appx 模块只在 Windows PowerShell 5.1 里存在。落在我们这边的表现是"永远检测不出
 * 已安装 / 永远装不上"，而且错误只在 stderr 里，很容易被忽略。
 * System32 是系统目录，走绝对路径既躲开 PATH 上的同名垫片，也保证是 **64 位**那一份
 * （Appx 模块只有 64 位 PowerShell 能用）。
 */
export function systemExePath(systemRoot: string | null | undefined, name: string): string {
  // SystemRoot 正常都有；取不到就按 Windows 的默认安装位置兜底（不猜别的盘符）。
  const root = (systemRoot ?? "").trim() || "C:\\Windows";
  return path.join(root, "System32", name);
}

/** Windows PowerShell 5.1（**不是** PowerShell 7）的绝对路径。 */
export function windowsPowerShellPath(systemRoot: string | null | undefined): string {
  return systemExePath(systemRoot, path.join("WindowsPowerShell", "v1.0", "powershell.exe"));
}

// ---- 运行库目录 ----

/**
 * 运行库目录的候选（按优先级，第一个存在的生效）。
 *
 *   1) 配置里的 `runtimeDir`（path-modes.json → config.json；默认 `<应用 exe 同级>/runtime`）
 *      —— 部署态写相对路径 `runtime`（正式机 X 盘、测试机 D 盘是同一套结构，只有盘符不同）。
 *      "配置优先"的意义：运维把运行库换到别处（比如共享盘）只需改配置，不必重新出包。
 *   2) `<resources>/runtime` —— 打包时 `extraResources` 带进去的那份，**兜底**。
 *
 * 为什么必须有兜底：配置指的那个目录在没有运维放文件时并不存在（典型是刚拷完包的机器，
 * 或者运维只维护了包内那份）。这时用包里的，检测安装照常工作；两者都没有时上层只记一条
 * 日志跳过，不报错。
 */
export function runtimeDirCandidates(
  configuredDir: string,
  exeDir: string,
  resourcesPath?: string,
): string[] {
  const out: string[] = [];
  const push = (dir: string) => {
    if (dir.trim() && !out.includes(dir)) out.push(dir);
  };
  push(configuredDir); // 配置说的那个（默认就是 <exe 同级>/runtime，所以通常与下一条重复、被去重）
  // exe 同级：配置指到别处（共享盘）时的**保险**。没有它就会出这种事：包在 A 处、
  // 配置指向 B 处，运维"把运行库放包里了"却因为两边不重合而静默不生效。
  push(path.join(exeDir, "runtime"));
  if (resourcesPath) push(path.join(resourcesPath, "runtime")); // 包内兜底
  return out;
}
