// 运行库依赖的"执行层"：启动时后台检测 + 缺了就静默装（VC++ 运行库 x64/x86、VP9 解码扩展）。
//
// 判据、安装参数、脚本内容都在 runtimeDeps.ts（纯函数、有单测）；本文件只负责
// "找文件、起进程、写日志"。启动时由 main.ts 调一次 ensureRuntimeDeps()。
//
// 三条硬性要求（都是"不能影响应用启动"的具体落法）：
//   1) 绝不 await —— ensureRuntimeDeps() 同步立刻返回，安装全程在后台。窗口该多快弹出来
//      就多快（再具体一点：还刻意延后几秒才开始，避开窗口创建那一下的资源竞争）。
//   2) 绝不弹任何窗口 —— 静默参数 + windowsHide + 非管理员时干脆不试（否则 UAC 框会跳出来）。
//   3) 绝不重启系统 —— /norestart；安装器进程 detached + unref，我们退出它也不会半路夭折，
//      反过来它也不会拖住我们退出。
//
// 失败只写日志、不打扰用户：运行库缺失的表现是"某些游戏跑不起来"，不是"应用打不开"，
// 所以不该为它弹任何东西。日志在 <数据根>\logs\runtime-setup.log（与崩溃日志同一个目录，
// 运维现场直接看这个文件就知道装没装、为什么跳过）。

import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { appRoot, configRoot, runtimeDir } from "./paths";
import {
  PS_MARK_INSTALLED,
  PS_MARK_SKIP,
  RUNTIME_DEPS,
  buildAppxScript,
  buildPowershellArgs,
  buildVcRedistArgs,
  decideVcRedist,
  isVcRedistSuccess,
  parseElevated,
  parseRegValue,
  runtimeDirCandidates,
  systemExePath,
  vcRedistRegKey,
  windowsPowerShellPath,
  type RuntimeDep,
} from "./runtimeDeps";

/**
 * 启动后延后多久才开始检测（毫秒）。
 * 为什么不立刻做：这三个检测要起 3~5 个子进程（其中 PowerShell 启动本身就有几百毫秒的
 * CPU 开销），和"窗口创建 + 首次渲染"撞在一起会让弱一点的网吧机器明显卡一下。
 * 延后到窗口稳定之后，玩家已经在正常用界面了，后台那点开销完全无感。
 */
const START_DELAY_MS = 5000;

/** 收集子进程输出时保留的最大字节数（够看清报错就行，别把内存吃满）。 */
const MAX_OUTPUT_BYTES = 8192;

/**
 * 运行库目录候选（顺序与理由见 runtimeDeps.runtimeDirCandidates）：
 *   1) 配置里的 `runtimeDir`（`path-modes.json` → `config.json`）：部署态（测试/正式）写**相对路径**
 *      `runtime` —— 就是 <应用 exe 同级>/runtime（正式机 X 盘、测试机 D 盘同一套结构，只有盘符不同）；
 *      开发态指仓库里的 `dev-tools/runtime`（编译与打包的源头）。
 *   2) `<应用 exe 同级>/runtime` —— 配置指到别处时的保险（出包时 package.bat 就放在这）
 *   3) `<resources>/runtime` —— 包内兜底
 */
function depDirs(): string[] {
  return runtimeDirCandidates(runtimeDir(), appRoot(), process.resourcesPath);
}

/** 找到含指定安装包的目录；都找不到返回 null。 */
function findDepDir(dep: RuntimeDep): string | null {
  for (const dir of depDirs()) {
    try {
      if (fs.statSync(path.join(dir, dep.fileName)).isFile()) return dir;
    } catch {
      /* 这个目录没有就试下一个 */
    }
  }
  return null;
}

/** 写一行日志：控制台 + <数据根>/logs/runtime-setup.log（写失败不影响流程）。 */
function log(line: string): void {
  console.log("[runtime-setup]", line);
  try {
    const dir = path.join(configRoot(), "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, "runtime-setup.log"),
      `[${new Date().toISOString()}] ${line}\n`,
      "utf-8",
    );
  } catch {
    /* 日志写不进去不是致命问题，安装照旧 */
  }
}

interface RunResult {
  /** 退出码；进程没起来（ENOENT/权限等）时为 null。 */
  code: number | null;
  stdout: string;
  stderr: string;
  /** 起进程本身失败的原因（不是"安装失败"，是"根本没跑起来"）。 */
  error?: string;
}

/**
 * 起一个子进程并等它结束。**只在这条后台流程里用**，不要在启动路径上同步等它。
 * windowsHide + stdio 全接管：保证不闪黑框。
 * detached 时额外 unref：子进程不再吊住事件循环 —— 应用要退出就退出，别被安装器拖住。
 */
function run(cmd: string, args: string[], opts: { detached?: boolean } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, {
        windowsHide: true,
        detached: !!opts.detached,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      resolve({ code: null, stdout: "", stderr: "", error: e instanceof Error ? e.message : String(e) });
      return;
    }
    let stdout = "";
    let stderr = "";
    const collect = (into: "out" | "err") => (chunk: Buffer | string) => {
      const s = String(chunk);
      if (into === "out") {
        if (stdout.length < MAX_OUTPUT_BYTES) stdout += s;
      } else if (stderr.length < MAX_OUTPUT_BYTES) stderr += s;
    };
    child.stdout?.on("data", collect("out"));
    child.stderr?.on("data", collect("err"));
    child.on("error", (err: NodeJS.ErrnoException) => {
      // 典型：ERROR_ELEVATION_REQUIRED（要管理员）、ENOENT（文件没了）。
      resolve({ code: null, stdout, stderr, error: `${err.code ?? ""} ${err.message}`.trim() });
    });
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
    if (opts.detached) child.unref();
  });
}

/**
 * 系统工具一律用绝对路径调（理由见 runtimeDeps.systemExePath）：
 * 绝对路径不存在时退回裸名字（PATH 兜底），并把这件事记进日志 —— 如果哪天日志里
 * 出现"退回 PATH"，那就是"检测结果不对"的第一嫌疑。
 */
function sysExe(absolute: string, bareName: string): string {
  try {
    if (fs.statSync(absolute).isFile()) return absolute;
  } catch {
    /* 没有就往 PATH 兜底 */
  }
  log(`注意：找不到 ${absolute}，改用 PATH 上的 ${bareName}（PATH 上可能是别的版本，见 runtimeDeps.ts 的说明）`);
  return bareName;
}

/** 当前进程是不是管理员（判据见 runtimeDeps.parseElevated）。 */
async function isElevated(): Promise<boolean> {
  const r = await run(sysExe(systemExePath(process.env.SystemRoot, "whoami.exe"), "whoami.exe"), ["/groups"]);
  return parseElevated(r.stdout);
}

/** VC++ 运行库：查注册表 → 缺（或标记未装）→ 管理员才静默装。 */
async function handleVcRedist(dep: RuntimeDep, elevated: boolean): Promise<void> {
  const dir = findDepDir(dep);
  if (!dir) {
    log(`${dep.label}：没找到安装包 ${dep.fileName}，跳过`);
    return;
  }
  const reg = await run(sysExe(systemExePath(process.env.SystemRoot, "reg.exe"), "reg.exe"), [
    "query",
    vcRedistRegKey(dep.arch ?? "x64"),
  ]);
  const decision = decideVcRedist({
    installed: parseRegValue(reg.stdout, "Installed"),
    version: parseRegValue(reg.stdout, "Version"),
  });
  if (!decision.install) {
    log(`${dep.label}：${decision.reason}，跳过`);
    return;
  }
  if (!elevated) {
    // 不试：VC 运行库的安装器要求管理员，非管理员会话直接跑会弹 UAC（或在 /quiet 下失败）。
    // 只记日志 —— 运维用管理员账号装一次，之后这里自然会走"已安装，跳过"。
    log(`${dep.label}：${decision.reason}；但当前不是管理员，未安装（避免弹 UAC）。请运维用管理员账号装一次 ${dep.fileName}`);
    return;
  }
  const exe = path.join(dir, dep.fileName);
  const installLog = path.join(configRoot(), "logs", `vc-redist-${dep.arch ?? "x64"}.log`);
  log(`${dep.label}：${decision.reason} → 静默安装（${exe}）`);
  const r = await run(exe, buildVcRedistArgs(installLog), { detached: true });
  if (r.error) {
    log(`${dep.label}：安装进程没起来 —— ${r.error}`);
    return;
  }
  log(
    `${dep.label}：安装结束，退出码 ${r.code ?? "未知"}` +
      (isVcRedistSuccess(r.code) ? "（成功；已按 /norestart 禁止自动重启）" : "（失败，安装器日志见上面的 /log 路径）"),
  );
}

/** VP9 解码扩展：一次 PowerShell 里"查 + 注册"，按当前用户（不需要管理员）。 */
async function handleAppx(dep: RuntimeDep): Promise<void> {
  const dir = findDepDir(dep);
  if (!dir) {
    log(`${dep.label}：没找到安装包 ${dep.fileName}，跳过`);
    return;
  }
  const bundle = path.join(dir, dep.fileName);
  // 必须走 Windows PowerShell 5.1 的绝对路径：Appx 模块在 PowerShell 7 里加载不了
  // （实测报 0x80131539），而装了 PS7 的机器 PATH 上的 `powershell` 正是 PS7。
  const ps = sysExe(windowsPowerShellPath(process.env.SystemRoot), "powershell.exe");
  const r = await run(ps, buildPowershellArgs(buildAppxScript(bundle, dep.appxNamePattern ?? dep.fileName)));
  const out = r.stdout.trim();
  if (out.includes(PS_MARK_SKIP)) {
    log(`${dep.label}：${out.slice(out.indexOf(PS_MARK_SKIP) + PS_MARK_SKIP.length).trim() || "已注册"}，跳过`);
  } else if (out.includes(PS_MARK_INSTALLED)) {
    // 注意：AppX 注册对**当前用户**生效；已注册到媒体管线要等下次启动，这不影响本机后续使用。
    log(`${dep.label}：未安装 → 已静默注册`);
  } else {
    log(
      `${dep.label}：结果无法判定（退出码 ${r.code ?? "未知"}${r.error ? `，${r.error}` : ""}）` +
        `；stderr：${(r.stderr || "(空)").trim().slice(0, 500)}`,
    );
  }
}

/** 依次处理三样依赖。任何一项失败都只记日志，继续下一项。 */
async function runAll(): Promise<void> {
  const candidates = depDirs();
  const dirs = candidates.filter((d) => {
    try {
      return fs.statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
  if (dirs.length === 0) {
    log(`没有运行库目录（找过 ${candidates.join(" / ")}），跳过全部检测`);
    return;
  }
  const elevated = await isElevated();
  log(`开始检测运行库（目录：${dirs[0]}；管理员权限：${elevated ? "有" : "无"}）`);
  for (const dep of RUNTIME_DEPS) {
    try {
      if (dep.kind === "vc-redist") await handleVcRedist(dep, elevated);
      else await handleAppx(dep);
    } catch (e) {
      log(`${dep.label}：检测异常 —— ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  log("运行库检测结束");
}

/** 一次运行只做一次（重复调用直接返回）。 */
let started = false;

/**
 * 启动时调用：后台检测 + 缺什么装什么。**同步立刻返回**，调用方不要 await（也没得 await）。
 *
 * 环境变量开关（现场临时处置用，不必重新打包）：
 *   PLAYDAY_SKIP_RUNTIME_SETUP=1   完全不检测（装机排查、或这台机器已由镜像铺好）
 *   PLAYDAY_FORCE_RUNTIME_SETUP=1  开发态也跑（默认开发态不跑 —— 免得在开发者机器上装东西）
 */
export function ensureRuntimeDeps(): void {
  if (started) return;
  started = true;
  if (process.platform !== "win32") return; // 这三样都只跟 Windows 有关
  if (process.env.PLAYDAY_SKIP_RUNTIME_SETUP === "1") {
    log("按 PLAYDAY_SKIP_RUNTIME_SETUP=1 跳过运行库检测");
    return;
  }
  if (!app.isPackaged && process.env.PLAYDAY_FORCE_RUNTIME_SETUP !== "1") return;
  // 全部异步：异常也只在内部落日志。这里再兜一层 catch —— 绝不能让它的失败冒泡成
  // 主进程未捕获异常（那会弹崩溃处理窗口，等于"装不上运行库"变成了"应用崩了"）。
  const timer = setTimeout(() => {
    void runAll().catch((e) =>
      log(`检测流程异常 —— ${e instanceof Error ? e.message : String(e)}`),
    );
  }, START_DELAY_MS);
  // 这个定时器不该拖住应用退出（玩家开机点一下就走也不少见）。
  timer.unref?.();
}
