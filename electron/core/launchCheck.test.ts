// 自检规则层的单测（被测实现：electron/core/launchCheck.ts）。
//
// 为什么值得锁：这是"上线前体检"，它误报/漏报的代价是**现场才发现游戏启动不了** ——
// 而它要预测的正是那条真实启动链路（{库名} / {InstallDir} / 安装目录相对路径 / 自动找 exe /
// 存档通配符）。所以断言尽量走**真实**纯函数（shared/launchPaths 的 resolvePath 与
// resolveActionPath），只把副作用（判存在、列目录）和主进程侧的 fs 函数换成假的。
import { describe, expect, it } from "vitest";
import { checkGame, checkGames, matchWildcard, type CheckDeps } from "./launchCheck";
import type { Game, GameAction, GameLibrary } from "./models";

const LIBS = [
  { name: "V", path: "X:/YunGame/V" },
  { name: "W", path: "X:/YunGame/W" },
] as unknown as GameLibrary[];

const GAME_ROOT = "D:/YunGame/PlayNite";

/** 假的文件系统世界（自检只用到 存在 / 是目录 / 列目录 三件事）。 */
function world(opts: { files?: string[]; dirs?: string[]; names?: Record<string, string[]> } = {}) {
  const files = new Set(opts.files ?? []);
  const dirs = new Set(opts.dirs ?? []);
  const listing = new Map(Object.entries(opts.names ?? {}));
  return { files, dirs, listing };
}

function makeDeps(w: ReturnType<typeof world>, over: Partial<CheckDeps> = {}): CheckDeps {
  const base: CheckDeps = {
    libraries: LIBS,
    gameRoot: GAME_ROOT,
    // 与真实 expandVariables 同义：{InstallDir} 换成 install_directory 的**原始值**，
    // 之后交给 launchPaths 再解析 —— 这个先后顺序就是当初出事故的地方。
    expandVariables: (s, game) =>
      s.replace(/\{InstallDir\}/gi, game.installDirectory ?? "").replace(/\{GameName\}/gi, game.name),
    resolveAction: (game) => game.actions.find((a) => a.isPlayAction),
    validateAction: (p) => ({
      valid: w.files.has(p),
      resolved: p,
      reason: w.files.has(p) ? "" : "文件不存在",
    }),
    findExecutable: (dir) => (w.files.has(`${dir}/game.exe`) ? { exe: `${dir}/game.exe` } : null),
    exists: (p) => w.files.has(p) || w.dirs.has(p),
    isDir: (p) => w.dirs.has(p),
    listDir: (p) => w.listing.get(p) ?? (w.dirs.has(p) ? [] : null),
  };
  return { ...base, ...over };
}

function game(over: Partial<Game> = {}): Game {
  const base = {
    id: "g1",
    name: "测试游戏",
    gameLevel: 1,
    installDirectory: "",
    savePaths: [] as string[],
    actions: [
      { id: "play", name: "开始游戏", type: "File", path: "TPC.exe", isPlayAction: true } as GameAction,
    ],
  };
  return { ...base, ...over } as unknown as Game;
}

const fileAction = (path: string) => [{ id: "play", type: "File", path, isPlayAction: true } as GameAction];
// URL 动作永远不产生问题（没有本地文件可查）—— 存档那组用例拿它当"干净的启动项"，
// 免得每条断言里都混进基类游戏那个"路径不存在"的 action-missing 噪声。
const urlAction = [{ id: "play", type: "URL", path: "https://example.invalid", isPlayAction: true } as GameAction];
const kinds = (findings: ReturnType<typeof checkGame>) => findings.map((f) => f.kind);

describe("启动项检查", () => {
  it("库占位符 + 文件存在 → 没问题（走真实 resolveActionPath）", () => {
    const w = world({ files: ["X:/YunGame/V/SomeGame/game.exe"] });
    const g = game({ installDirectory: "{V}/SomeGame", actions: fileAction("{V}/SomeGame/game.exe") });
    expect(checkGame(g, makeDeps(w))).toEqual([]);
  });

  it("目标文件不存在 → action-missing，并带上解析后的绝对路径（便于直接去核）", () => {
    const w = world({ dirs: ["X:/YunGame/V/SomeGame"] });
    const g = game({ installDirectory: "{V}/SomeGame", actions: fileAction("{V}/SomeGame/gone.exe") });
    const f = checkGame(g, makeDeps(w));
    expect(kinds(f)).toEqual(["action-missing"]);
    expect(f[0].detail).toContain("X:/YunGame/V/SomeGame/gone.exe");
  });

  it("用了 {InstallDir} 但没配安装目录 → action-resolve-error（755 个游戏踩过的那个坑）", () => {
    const g = game({ installDirectory: "", actions: fileAction("{InstallDir}\\game.exe") });
    const f = checkGame(g, makeDeps(world()));
    expect(kinds(f)).toEqual(["action-resolve-error"]);
    expect(f[0].detail).toContain("未配置安装目录");
  });

  it("配了安装目录时 {InstallDir} 正常展开 → 没问题", () => {
    const w = world({ files: ["X:/YunGame/V/SomeGame/game.exe"] });
    const g = game({ installDirectory: "{V}/SomeGame", actions: fileAction("{InstallDir}\\game.exe") });
    expect(checkGame(g, makeDeps(w))).toEqual([]);
  });

  it("相对路径（TPC.exe）以安装目录为基准 → 没问题", () => {
    const w = world({ files: ["X:/YunGame/V/SomeGame/TPC.exe"] });
    expect(checkGame(game({ installDirectory: "{V}/SomeGame" }), makeDeps(w))).toEqual([]);
  });

  it("path 配成目录 → 在里面找 exe；找不到则报 action-missing", () => {
    const dirs = ["X:/YunGame/V/SomeGame"];
    const g = game({ actions: fileAction("{V}/SomeGame") });
    expect(
      kinds(checkGame(g, makeDeps(world({ dirs, files: ["X:/YunGame/V/SomeGame/game.exe"] })))),
    ).toEqual([]);
    const f = checkGame(g, makeDeps(world({ dirs })));
    expect(kinds(f)).toEqual(["action-missing"]);
    expect(f[0].detail).toContain("启动目录里找不到可执行文件");
  });

  it("URL 启动项：没有本地文件可查，不算问题", () => {
    const g = game({ actions: [{ id: "play", type: "URL", path: "https://x/y", isPlayAction: true } as GameAction] });
    expect(checkGame(g, makeDeps(world()))).toEqual([]);
  });

  it("不认识的启动项类型 → action-unknown-type", () => {
    const g = game({ actions: [{ id: "play", type: "Script", path: "a.ps1", isPlayAction: true } as GameAction] });
    expect(kinds(checkGame(g, makeDeps(world())))).toEqual(["action-unknown-type"]);
  });

  it("没有启动项但有安装目录：目录里有 exe 就没问题，没有才报", () => {
    const ok = world({ dirs: ["D:/YunGame/PlayNite/SomeGame"], files: ["D:/YunGame/PlayNite/SomeGame/game.exe"] });
    const g = game({ actions: [], installDirectory: "SomeGame" });
    expect(checkGame(g, makeDeps(ok))).toEqual([]);
    expect(kinds(checkGame(g, makeDeps(world())))).toEqual(["no-play-action"]);
  });

  it("既没有启动项也没有安装目录 → no-play-action", () => {
    expect(kinds(checkGame(game({ actions: [] }), makeDeps(world())))).toEqual(["no-play-action"]);
  });
});

describe("存档路径检查", () => {
  const withSaves = (savePaths: string[]) => game({ savePaths, actions: urlAction });

  it("目录存在且有文件 → 没问题", () => {
    const w = world({ dirs: ["X:/YunGame/V/SomeGame/Save"], names: { "X:/YunGame/V/SomeGame/Save": ["save1.dat"] } });
    expect(checkGame(withSaves(["X:/YunGame/V/SomeGame/Save/*.*"]), makeDeps(w))).toEqual([]);
  });

  it("`*.*` 要匹配**没有扩展名**的文件（FindFirstFile 语义；按正则会漏）", () => {
    const w = world({ dirs: ["X:/S"], names: { "X:/S": ["profile", "settings"] } });
    expect(checkGame(withSaves(["X:/S/*.*"]), makeDeps(w))).toEqual([]);
    expect(matchWildcard("profile", "*.*")).toBe(true);
  });

  it("目录不存在 → save-path-missing", () => {
    const f = checkGame(withSaves(["X:/YunGame/V/SomeGame/Save/*.*"]), makeDeps(world()));
    expect(kinds(f)).toEqual(["save-path-missing"]);
    expect(f[0].detail).toContain("目录不存在");
  });

  it("目录在但没匹配上 → save-no-match（多数是还没玩过，不一定是配置错）", () => {
    const w = world({ dirs: ["X:/S"], names: { "X:/S": ["readme.txt"] } });
    expect(kinds(checkGame(withSaves(["X:/S/*.sav"]), makeDeps(w)))).toEqual(["save-no-match"]);
  });

  it("不带通配符的具体文件：不存在就报 save-path-missing", () => {
    expect(kinds(checkGame(withSaves(["X:/S/one.dat"]), makeDeps(world())))).toEqual(["save-path-missing"]);
    expect(checkGame(withSaves(["X:/S/one.dat"]), makeDeps(world({ files: ["X:/S/one.dat"] })))).toEqual([]);
  });

  it("空串跳过（数据库里确实有这种脏数据）", () => {
    expect(checkGame(withSaves(["", "   "]), makeDeps(world()))).toEqual([]);
  });

  it("同一个游戏可以同时报多条存档路径的问题", () => {
    const w = world({ dirs: ["X:/S"], names: { "X:/S": [] } });
    const f = checkGame(withSaves(["X:/S/*.dat", "X:/Missing/*.*"]), makeDeps(w));
    expect(kinds(f)).toEqual(["save-no-match", "save-path-missing"]);
  });

  it("启动项与存档路径的问题会同时出现在一条游戏的清单里", () => {
    const f = checkGame(game({ savePaths: ["X:/Missing/*.*"] }), makeDeps(world()));
    expect(kinds(f)).toEqual(["action-missing", "save-path-missing"]);
  });
});

describe("matchWildcard（Windows 语义）", () => {
  it("* 与 ? 的基本行为，大小写不敏感", () => {
    expect(matchWildcard("Save01.sav", "*.Sav")).toBe(true);
    expect(matchWildcard("Save01.sav", "save??.sav")).toBe(true);
    expect(matchWildcard("Save001.sav", "save??.sav")).toBe(false);
    expect(matchWildcard("anything", "*")).toBe(true);
    expect(matchWildcard("a.b", "")).toBe(false);
  });

  it("通配符不跨目录分隔符（只匹配单个文件名）", () => {
    expect(matchWildcard("sub/a.sav", "*.sav")).toBe(false);
    expect(matchWildcard("sub\\a.sav", "*.sav")).toBe(false);
  });

  it("正则元字符按字面处理（游戏名里有括号也不炸）", () => {
    expect(matchWildcard("save(1).dat", "save(1).dat")).toBe(true);
    expect(matchWildcard("saveX1).dat", "save(1).dat")).toBe(false);
  });
});

describe("汇总", () => {
  it("counts 按类型统计，checked 是游戏数（不是问题数）", () => {
    const games = [
      game({ id: "a", actions: fileAction("{V}/x.exe") }),
      game({ id: "b", actions: [] }),
      game({ id: "c", actions: fileAction("X:/ok.exe") }),
    ];
    const okWorld = world({ files: ["X:/ok.exe"] });
    const sum = checkGames(games, makeDeps(okWorld));
    expect(sum.checked).toBe(3);
    expect(sum.counts["action-missing"]).toBe(1); // a
    expect(sum.counts["no-play-action"]).toBe(1); // b
    expect(sum.findings.length).toBe(2); // c 没问题
  });
});
