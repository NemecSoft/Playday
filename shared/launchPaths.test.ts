// 启动路径规则的"可执行说明"。
// 权威文档：docs/design/launch-and-paths.md（每条规则对应这里的用例）。
// 用的都是真实踩过的案例（赛菲莉娅的 golan.bat、存档备份的 ..\Tools\ 等）。
// 分隔符约定：**输出的规范形式是 `/`**，输入 `\` 与 `/` 都收（见 launchPaths.ts 顶部）。
import { describe, expect, it } from "vitest";
import {
  batConsoleArgs,
  isAbsolutePath,
  joinPaths,
  normalizePath,
  resolveActionPath,
  resolveLibraryPlaceholder,
  resolvePath,
  startsWithPlaceholder,
  toCmdPath,
} from "./launchPaths";

const LIBS = [
  { name: "Gamelibrary1", path: "D:/Games" },
  { name: "Gamelibrary2", path: "D:/games2" },
  { name: "库3", path: "D:/Code" },
];
const GAME_ROOT = "D:/YunGame/Playnite";

/** 复刻主进程的 expandVariables：只关心 {InstallDir} 等占位符的替换。 */
const makeExpand =
  (installDir: string, gameName = "测试游戏") =>
  (s: string) =>
    s
      .replace(/\{InstallDir\}/gi, installDir)
      .replace(/\{GameName\}/gi, gameName);

describe("normalizePath / joinPaths / toCmdPath", () => {
  it("折叠 . 与 ..、把分隔符统一成 /、去掉空段（输入两种都收）", () => {
    expect(normalizePath("..\\\\Z\\\\Sephiria")).toBe("../Z/Sephiria");
    expect(normalizePath("D:/YunGame/Playnite/../X/Sephiria")).toBe("D:/YunGame/X/Sephiria");
    expect(normalizePath("D:\\YunGame\\X")).toBe("D:/YunGame/X");
    expect(normalizePath("bin\\Inversion.exe")).toBe("bin/Inversion.exe");
    expect(normalizePath("a\\.\\b")).toBe("a/b");
  });

  it("必须保留 UNC 前缀（网吧常把游戏放网络共享），统一输出 //server/share", () => {
    expect(normalizePath("\\\\NAS\\Games")).toBe("//NAS/Games");
    expect(normalizePath("//NAS/Games/Covers")).toBe("//NAS/Games/Covers");
    expect(normalizePath("\\\\NAS\\Games\\..\\Covers")).toBe("//NAS/Covers");
  });

  it("joinPaths 拼接后规范化（含 .. 上跳）", () => {
    expect(joinPaths("D:/YunGame/Playnite", "../X/Sephiria")).toBe("D:/YunGame/X/Sephiria");
    expect(joinPaths("D:\\YunGame\\Playnite", "..\\X\\Sephiria")).toBe("D:/YunGame/X/Sephiria");
  });

  it("toCmdPath：交给 cmd.exe 前换回 \\（cmd 会把 / 开头的 token 当开关）", () => {
    expect(toCmdPath("D:/YunGame/X/golan.bat")).toBe("D:\\YunGame\\X\\golan.bat");
    expect(toCmdPath("//NAS/share/x.bat")).toBe("\\\\NAS\\share\\x.bat");
    expect(toCmdPath("D:\\YunGame\\X")).toBe("D:\\YunGame\\X");
  });
});

// §5 的"显示控制台窗口"启动参数。2026-09-14 修过：用户报"退出游戏后那个窗口卡在
// 提示符上不关"，根因就在这一串（`start` 对 .bat 是用 `cmd /K` 跑的）。所以把形状
// 钉住，谁想简化成旧写法就会红。
describe("batConsoleArgs：显示控制台地启动 .bat", () => {
  const COMSPEC = "C:\\Windows\\system32\\cmd.exe";
  const BAT = "D:/YunGame/X/Sephiria/golan.bat"; // 用户报问题的那一个

  it("必须经 start（直接把 bat 交给 cmd /c，在 GUI 父进程里不会弹窗口）", () => {
    expect(batConsoleArgs(COMSPEC, BAT).slice(0, 6)).toEqual(["/d", "/s", "/c", "start", "", "/wait"]);
  });

  it("start 里必须再套一层 cmd /c：否则 start 用 cmd /K 跑脚本 → 窗口不关、/wait 不返回", () => {
    const a = batConsoleArgs(COMSPEC, BAT);
    const i = a.indexOf(toCmdPath(BAT));
    expect(i).toBeGreaterThan(0);
    expect(a[i - 1]).toBe("/c"); // 脚本前面紧跟 /c
    expect(a[i - 2]).toBe(COMSPEC); // 且这个 /c 属于 comspec（不是把脚本直接丢给 start）
  });

  it("脚本路径用 cmd 的反斜杠形式（//NAS/... 不能被当成开关）", () => {
    expect(batConsoleArgs(COMSPEC, "//NAS/share/x.bat")).toContain("\\\\NAS\\share\\x.bat");
  });

  it("脚本参数原样跟在路径后面，顺序不变", () => {
    expect(batConsoleArgs(COMSPEC, BAT, ["-a", "b c"])).toEqual([
      "/d",
      "/s",
      "/c",
      "start",
      "",
      "/wait",
      COMSPEC,
      "/c",
      toCmdPath(BAT),
      "-a",
      "b c",
    ]);
  });
});

describe("路径形状判定", () => {
  it("startsWithPlaceholder 只认开头的 {", () => {
    expect(startsWithPlaceholder("{InstallDir}/a.exe")).toBe(true);
    expect(startsWithPlaceholder("  {Gamelibrary1}/a.exe")).toBe(true);
    expect(startsWithPlaceholder("bin/{x}/a.exe")).toBe(false);
  });

  it("isAbsolutePath 认盘符与 UNC 的两种写法", () => {
    expect(isAbsolutePath("D:\\Games\\a.exe")).toBe(true);
    expect(isAbsolutePath("D:/Games/a.exe")).toBe(true);
    expect(isAbsolutePath("\\\\server\\share\\a.exe")).toBe(true);
    expect(isAbsolutePath("//server/share/a.exe")).toBe(true);
    expect(isAbsolutePath("TPC.exe")).toBe(false);
    expect(isAbsolutePath("../Z/a.exe")).toBe(false);
    expect(isAbsolutePath("{Gamelibrary1}/a.exe")).toBe(false);
  });
});

describe("库占位符 {库名}/rest", () => {
  it("命中库名（大小写不敏感）→ 库根 + 剩余段", () => {
    expect(resolveLibraryPlaceholder("{Gamelibrary1}\\game1\\g.exe", LIBS)).toEqual({
      rest: "game1\\g.exe", // rest 是原文切片（不在这里规范化，交给 joinPaths）
      root: "D:/Games",
    });
    expect(resolveLibraryPlaceholder("{gamelibrary1}/game1/g.exe", LIBS)?.root).toBe("D:/Games");
  });

  it("非库名的占位符必须落空（{InstallDir} 不是库）", () => {
    expect(resolveLibraryPlaceholder("{InstallDir}\\a.exe", LIBS)).toBeNull();
    expect(resolveLibraryPlaceholder("{未知库}\\a.exe", LIBS)).toBeNull();
  });
});

describe("resolvePath：库占位符 / 绝对 / 相对（游戏根）", () => {
  it("{库名} → 库根（输出统一 /）", () => {
    expect(resolvePath("{Gamelibrary1}\\game1\\g.exe", LIBS, GAME_ROOT)).toBe(
      "D:/Games/game1/g.exe",
    );
  });

  it("绝对路径原样返回，但分隔符统一为 /", () => {
    expect(resolvePath("X:\\YunGame\\Z\\a.exe", LIBS, GAME_ROOT)).toBe("X:/YunGame/Z/a.exe");
    expect(resolvePath("//NAS/share/a.exe", LIBS, GAME_ROOT)).toBe("//NAS/share/a.exe");
  });

  it("相对路径以游戏根为基准（install_directory 的存储形式）", () => {
    expect(resolvePath("..\\Z\\Supermarket Simulator", LIBS, "X:\\YunGame\\Playnite")).toBe(
      "X:/YunGame/Z/Supermarket Simulator",
    );
    expect(resolvePath("..\\X\\Sephiria", LIBS, GAME_ROOT)).toBe("D:/YunGame/X/Sephiria");
  });
});

describe("resolveActionPath：游玩指令 path 的三种基准", () => {
  const installAbs = "D:/YunGame/X/Sephiria";

  it("规则1：原始数据就是相对路径 → 以安装目录为基准", () => {
    // 真实案例：双点校园 "TPC.exe"、重力反转 "bin\Inversion.exe"
    expect(
      resolveActionPath({
        actionPath: "TPC.exe",
        installDir: "D:/YunGame/III/TwoPointCampusYuZU",
        libraries: LIBS,
        gameRoot: GAME_ROOT,
        expand: makeExpand("D:/YunGame/III/TwoPointCampusYuZU"),
      }),
    ).toMatchObject({ path: "D:/YunGame/III/TwoPointCampusYuZU/TPC.exe", basis: "installDir" });

    expect(
      resolveActionPath({
        actionPath: "bin\\Inversion.exe",
        installDir: "D:/YunGame/Inversion",
        libraries: LIBS,
        gameRoot: GAME_ROOT,
        expand: makeExpand("D:/YunGame/Inversion"),
      }).path,
    ).toBe("D:/YunGame/Inversion/bin/Inversion.exe");
  });

  it("规则1：含 .. 上跳（存档备份动作）", () => {
    // 从安装目录 X:/YunGame/X/Sephiria 上跳一级 → X:/YunGame/X，再进 Tools/。
    // ⚠️ 注意这里得到的是 X:/YunGame/X/Tools/...，**不是** X:/YunGame/Tools/...。
    // 该游戏 bat 里硬编码的是 X:\YunGame\Tools\nircmd\... —— 两者是否本该一致、
    // 数据是不是少写了一层 ..，见 docs/design/launch-and-paths.md 的「待确认」。
    expect(
      resolveActionPath({
        actionPath: "..\\Tools\\GameSaveHelper\\GameSaveHelper",
        installDir: "X:/YunGame/X/Sephiria",
        libraries: LIBS,
        gameRoot: "X:/YunGame/Playnite",
        expand: makeExpand("X:/YunGame/X/Sephiria"),
      }).path,
    ).toBe("X:/YunGame/X/Tools/GameSaveHelper/GameSaveHelper");
  });

  it("规则2：{库名} 开头 → 库根", () => {
    expect(
      resolveActionPath({
        actionPath: "{Gamelibrary1}\\game1\\g.exe",
        installDir: "",
        libraries: LIBS,
        gameRoot: GAME_ROOT,
        expand: makeExpand(""),
      }),
    ).toMatchObject({ path: "D:/Games/game1/g.exe", basis: "library" });
  });

  it("规则3：{InstallDir} 展开后是相对游戏根的路径 → 以游戏根为基准", () => {
    // 真实案例：赛菲莉娅 {InstallDir}\golan.bat（installDir=..\X\Sephiria）
    expect(
      resolveActionPath({
        actionPath: "{InstallDir}\\golan.bat",
        installDir: installAbs,
        libraries: LIBS,
        gameRoot: GAME_ROOT,
        expand: makeExpand("..\\X\\Sephiria"),
      }),
    ).toMatchObject({ path: "D:/YunGame/X/Sephiria/golan.bat", basis: "gameRoot" });
  });

  it("绝对路径始终原样（仅统一分隔符）", () => {
    expect(
      resolveActionPath({
        actionPath: "X:\\YunGame\\Z\\a.exe",
        installDir: installAbs,
        libraries: LIBS,
        gameRoot: GAME_ROOT,
        expand: makeExpand(installAbs),
      }),
    ).toMatchObject({ path: "X:/YunGame/Z/a.exe", basis: "absolute" });
  });

  it("网络路径（//NAS/...）也能解析：{库名} 与绝对两种形式", () => {
    const nasLibs = [{ name: "NAS", path: "//NAS/Games" }];
    expect(
      resolveActionPath({
        actionPath: "{NAS}\\Z\\a.exe",
        installDir: "",
        libraries: nasLibs,
        gameRoot: GAME_ROOT,
        expand: makeExpand(""),
      }).path,
    ).toBe("//NAS/Games/Z/a.exe");
    expect(
      resolveActionPath({
        actionPath: "//NAS/Games/Z/a.exe",
        installDir: "",
        libraries: nasLibs,
        gameRoot: GAME_ROOT,
        expand: makeExpand(""),
      }).path,
    ).toBe("//NAS/Games/Z/a.exe");
  });

  it("需要 {InstallDir} 但没配安装目录 → 给明确原因（不是含糊的「文件不存在」）", () => {
    const r = resolveActionPath({
      actionPath: "{InstallDir}\\golan.bat",
      installDir: "",
      libraries: LIBS,
      gameRoot: GAME_ROOT,
      expand: makeExpand(""),
    });
    expect(r.path).toBe("");
    expect(r.error).toContain("未配置安装目录");
    expect(r.error).toContain("{InstallDir}\\golan.bat");
  });

  it("空路径 → 报错", () => {
    const r = resolveActionPath({
      actionPath: "   ",
      installDir: installAbs,
      libraries: LIBS,
      gameRoot: GAME_ROOT,
      expand: (s) => s,
    });
    expect(r.error).toBe("启动指令路径为空");
  });
});
