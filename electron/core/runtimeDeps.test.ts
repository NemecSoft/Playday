// 运行库依赖"规则层"的可执行说明。被测实现：electron/core/runtimeDeps.ts。
//
// ⚠️ 本文件（以及被测模块）**不得 import electron**：这是主进程侧的测试，跑在 node 环境里，
//    没有 electron 模块（见 vitest.config.mts）。所以判据/拼命令行这些必须留在 runtimeDeps.ts，
//    副作用（起进程、写日志）留在 runtimeSetup.ts。
import { describe, expect, it } from "vitest";
import * as path from "path";
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
  psQuote,
  runtimeDirCandidates,
  systemExePath,
  vcRedistRegKey,
  windowsPowerShellPath,
} from "./runtimeDeps";

describe("VC 运行库的注册表判据", () => {
  it("x64 走 SOFTWARE 下、x86 走 WOW6432Node 下（不能拼串拼出两个 SOFTWARE）", () => {
    expect(vcRedistRegKey("x64")).toBe(
      "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64",
    );
    expect(vcRedistRegKey("x86")).toBe(
      "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x86",
    );
    // x64 那条不许被误写成 32 位视图（写错会永远查不到 → 每次启动都白装一遍）
    expect(vcRedistRegKey("x64")).not.toContain("WOW6432Node");
  });

  it("能按 reg query 的真实输出取出值（值里带空格也要原样取出）", () => {
    const out = [
      "",
      "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64",
      "    Installed    REG_DWORD    0x1",
      "    Version      REG_SZ       v14.38.33130.00",
      "",
    ].join("\r\n");
    expect(parseRegValue(out, "Installed")).toBe("0x1");
    expect(parseRegValue(out, "Version")).toBe("v14.38.33130.00");
    expect(parseRegValue(out, "不存在的值")).toBeNull();
  });

  it("键不存在时 reg 只在 stderr 报错、stdout 为空 → 判为没装（这就是首次安装的路径）", () => {
    // reg query 打不到键时：stdout 为空，stderr 是 "ERROR: The system was unable to find…"
    expect(parseRegValue("", "Installed")).toBeNull();
    expect(decideVcRedist({ installed: parseRegValue("", "Installed") }).install).toBe(true);
  });

  it("Installed=0x1 视为已安装（reg query 的 DWORD 是十六进制写法）", () => {
    const d = decideVcRedist({ installed: "0x1", version: "v14.38.33130.00" });
    expect(d.install).toBe(false);
    expect(d.reason).toContain("v14.38.33130.00"); // 版本号只用于日志，不参与判断
  });

  it("注册表里查不到（没装过）→ 要装", () => {
    const d = decideVcRedist({ installed: null, version: null });
    expect(d.install).toBe(true);
  });

  it("Installed=0x0 → 要装", () => {
    expect(decideVcRedist({ installed: "0x0" }).install).toBe(true);
  });

  it("取值不是预期的 0x0/0x1 → 保守按未安装处理（宁可装一遍）", () => {
    expect(decideVcRedist({ installed: "0x2" }).install).toBe(true);
  });

  it("14.x 之间不做版本号比较：装了 14.0 就不必为 14.4 再装一遍", () => {
    // 判据只看 Installed。若哪天有人加上"版本低于 VC_redist 自带版本就重装"，
    // 微软每发一版都会让所有机器重装一次 —— 这条测试就是拦这个的。
    expect(decideVcRedist({ installed: "0x1", version: "v14.0.23026.00" }).install).toBe(false);
  });
});

describe("VC 运行库的安装参数", () => {
  it("静默、不重启、留日志", () => {
    const args = buildVcRedistArgs("D:\\logs\\vc-redist-x64.log");
    expect(args).toContain("/install");
    expect(args).toContain("/quiet");
    expect(args).toContain("/norestart"); // 网吧机器绝不能被安装器重启
    expect(args).toEqual(["/install", "/quiet", "/norestart", "/log", "D:\\logs\\vc-redist-x64.log"]);
  });

  it("不能用 /passive（那是带进度条的有界面形态）", () => {
    expect(buildVcRedistArgs("x.log")).not.toContain("/passive");
  });

  it("退出码 0 与 3010 都算成功（3010 = 需重启才完全生效，我们不重启）", () => {
    expect(isVcRedistSuccess(0)).toBe(true);
    expect(isVcRedistSuccess(3010)).toBe(true);
    expect(isVcRedistSuccess(1603)).toBe(false);
    expect(isVcRedistSuccess(null)).toBe(false);
  });
});

describe("VP9 扩展的 PowerShell 脚本", () => {
  const bundle = "X:\\YunGame\\PlayDay\\runtime\\Microsoft.VP9VideoExtensions_1.2.6.0_neutral.AppxBundle";

  it("已注册 → 只打印 SKIP，不再安装", () => {
    const s = buildAppxScript(bundle, "*VP9VideoExtensions*");
    expect(s).toContain("Get-AppxPackage -Name '*VP9VideoExtensions*'");
    expect(s).toContain(PS_MARK_SKIP);
    expect(s).toContain(PS_MARK_INSTALLED);
    // Add-AppxPackage 必须在 else 分支里
    expect(s.indexOf("Add-AppxPackage")).toBeGreaterThan(s.indexOf("} else {"));
  });

  it("安装分支用 Add-AppxPackage（按当前用户注册，不需要管理员）", () => {
    const s = buildAppxScript(bundle, "*VP9VideoExtensions*");
    expect(s).toContain(`Add-AppxPackage -Path '${bundle}'`);
    expect(s).toContain("$ErrorActionPreference = 'Stop'");
  });

  it("脚本里不出现双引号 —— 整段是当命令行参数传给 -Command 的，双引号会和转义规则打架", () => {
    expect(buildAppxScript(bundle, "*VP9VideoExtensions*")).not.toContain('"');
  });

  it("路径里的单引号写成两个（PowerShell 单引号串的转义）", () => {
    expect(psQuote("a'b")).toBe("'a''b'");
    expect(buildAppxScript("C:\\it's here\\x.AppxBundle", "*VP9*")).toContain(
      "'C:\\it''s here\\x.AppxBundle'",
    );
  });

  it("PowerShell 参数：不加载 profile、不交互", () => {
    expect(buildPowershellArgs("Get-Date")).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "Get-Date",
    ]);
  });

  it("不许加 -WindowStyle Hidden —— 加了 PowerShell 会以 -1 退出且什么都不输出（本机实测）", () => {
    // 窗口是外层 spawn 的 windowsHide 关的；-WindowStyle 在没有控制台的会话里
    // 反而会把进程搞死，表现为"检测结果永远是空的"。这条测试就是拦住它被加回来。
    expect(buildPowershellArgs("x")).not.toContain("-WindowStyle");
    expect(buildPowershellArgs("x")).not.toContain("Hidden");
  });

  it("关掉进度流，免得 CLIXML 噪声盖住真正的报错", () => {
    expect(buildAppxScript("C:\\a.AppxBundle", "*VP9*")).toContain("$ProgressPreference = 'SilentlyContinue'");
  });
});

describe("管理员权限判据", () => {
  it("高完整性/系统 SID 才算管理员", () => {
    expect(parseElevated("Mandatory Label\\High Mandatory Level  Label  S-1-16-12288")).toBe(true);
    expect(parseElevated("Mandatory Label\\System Mandatory Level  Label  S-1-16-16384")).toBe(true);
  });

  it("普通用户（Medium）不算 —— 这时不试装 VC 运行库，避免弹 UAC", () => {
    expect(parseElevated("Mandatory Label\\Medium Mandatory Level  Label  S-1-16-8192")).toBe(false);
    expect(parseElevated("")).toBe(false);
  });

  it("按 SID 判，不看组名（中文系统里组名是「管理员」，认名字就会漏判）", () => {
    expect(parseElevated("BUILTIN\\Users  Alias  S-1-5-32-545")).toBe(false);
  });
});

describe("系统工具路径", () => {
  it("走 System32 绝对路径，且 PowerShell 那份是 5.1 目录下的（不是 PATH 上的 PS7）", () => {
    const root = "C:\\Windows";
    expect(systemExePath(root, "reg.exe")).toBe(path.join(root, "System32", "reg.exe"));
    expect(windowsPowerShellPath(root)).toBe(
      path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    );
    // 绝不能是 System32\WindowsPowerShell\v1.0 之外的东西（那里没有 Appx 模块）
    expect(windowsPowerShellPath(root)).toContain(path.join("WindowsPowerShell", "v1.0"));
  });

  it("SystemRoot 取不到时兜底 C:\\Windows，而不是拼出空路径", () => {
    expect(systemExePath(undefined, "whoami.exe").startsWith("C:\\Windows\\System32")).toBe(true);
    expect(systemExePath("   ", "reg.exe").startsWith("C:\\Windows\\System32")).toBe(true);
    expect(systemExePath(null, "reg.exe")).toContain("System32");
  });

  it("跟着 SystemRoot 走（系统装在 D 盘也能找到）", () => {
    expect(systemExePath("D:\\Win", "reg.exe")).toBe(path.join("D:\\Win", "System32", "reg.exe"));
  });
});

describe("运行库目录候选", () => {
  it("顺序：配置 → exe 同级 → resources（配置指到别处时，exe 同级那份是保险）", () => {
    expect(
      runtimeDirCandidates("X:/YunGame/Playnite/runtime", "C:/app", "C:/app/resources"),
    ).toEqual([
      "X:/YunGame/Playnite/runtime",
      path.join("C:/app", "runtime"),
      path.join("C:/app/resources", "runtime"),
    ]);
  });

  it("配置就是 exe 同级（出厂默认）时去重，不重复 stat 同一个目录", () => {
    expect(runtimeDirCandidates(path.join("C:/app", "runtime"), "C:/app", "C:/app/resources")).toEqual([
      path.join("C:/app", "runtime"),
      path.join("C:/app/resources", "runtime"),
    ]);
  });

  it("没有 resources（开发态）时只剩前两个", () => {
    expect(runtimeDirCandidates("tools/runtime", "D:/repo")).toEqual([
      "tools/runtime",
      path.join("D:/repo", "runtime"),
    ]);
  });

  it("配置为空串不产出空目录项（否则会去 stat 当前工作目录）", () => {
    expect(runtimeDirCandidates("   ", "C:/app", "C:/app/resources")).toEqual([
      path.join("C:/app", "runtime"),
      path.join("C:/app/resources", "runtime"),
    ]);
  });
});

describe("依赖清单", () => {
  it("三样东西都在，文件名与 tools/runtime 里的一致", () => {
    expect(RUNTIME_DEPS.map((d) => d.fileName)).toEqual([
      "Microsoft.VP9VideoExtensions_1.2.6.0_neutral.AppxBundle",
      "VC_redist.x64.exe",
      "VC_redist.x86.exe",
    ]);
  });

  it("x64 / x86 各一项（只装 x86 不等于 x64 够用）", () => {
    const archs = RUNTIME_DEPS.filter((d) => d.kind === "vc-redist").map((d) => d.arch);
    expect(archs).toEqual(["x64", "x86"]);
  });
});
