// 存档路径解析规则的"可执行说明"。实现：scripts/playnite-savepaths.mjs
// 这里的样本全部来自真实的 games.db 导出（1283 个游戏 / 2574 条 action），
// 包括那几个"看起来就该出错"的：含空格的路径、中文左引号、注册表格式、多路径。
import { describe, expect, it } from "vitest";
import {
  collectSavePaths,
  isSaveBackupAction,
  normalizeSavePath,
  parseSavePathArgs,
} from "./playnite-savepaths.mjs";

describe("isSaveBackupAction：按工具路径识别（覆盖 action 名字的各种变体）", () => {
  it("指向 GameSaveHelper 的都算，大小写不敏感", () => {
    expect(isSaveBackupAction({ Path: "..\\Tools\\GameSaveHelper\\GameSaveHelper" })).toBe(true);
    expect(isSaveBackupAction({ Path: "../../tools/gamesavehelper/GameSaveHelper.exe" })).toBe(true);
  });

  it("别的 action 不算（空/缺字段也不能崩）", () => {
    expect(isSaveBackupAction({ Path: "StarCraft II Launcher.exe" })).toBe(false);
    expect(isSaveBackupAction({})).toBe(false);
    expect(isSaveBackupAction(null)).toBe(false);
    expect(isSaveBackupAction(undefined)).toBe(false);
  });
});

describe("parseSavePathArgs：游戏名（不带引号）+ 若干带引号的路径", () => {
  it("单路径：游戏名丢掉，只留引号里的", () => {
    expect(
      parseSavePathArgs('星际争霸2 "C:\\Users\\Administrator\\Documents\\StarCraft II\\*.*"'),
    ).toEqual(["C:\\Users\\Administrator\\Documents\\StarCraft II\\*.*"]);
  });

  it("多路径：全都要，顺序不变（实测 116 个游戏是两条以上）", () => {
    expect(
      parseSavePathArgs(
        '我们到了吗-网吧联机版 "C:\\Users\\Administrator\\AppData\\Local\\Ride\\*.*" "X:\\YunGame\\W\\Ride\\settings\\*.*"',
      ),
    ).toEqual([
      "C:\\Users\\Administrator\\AppData\\Local\\Ride\\*.*",
      "X:\\YunGame\\W\\Ride\\settings\\*.*",
    ]);
  });

  it("路径里含空格也不能被切坏（这就是「不按空格分词」的全部理由）", () => {
    expect(
      parseSavePathArgs('双点校园 "C:\\Users\\Administrator\\AppData\\LocalLow\\Two Point Studios\\Two Point Campus\\*.*"'),
    ).toEqual(["C:\\Users\\Administrator\\AppData\\LocalLow\\Two Point Studios\\Two Point Campus\\*.*"]);
    expect(
      parseSavePathArgs('掘地求升 "HKEY_CURRENT_USER\\SOFTWARE\\Bennett Foddy\\Getting Over It"'),
    ).toEqual(["HKEY_CURRENT_USER\\SOFTWARE\\Bennett Foddy\\Getting Over It"]);
  });

  it("中文左引号也要认（真实数据里有 2 条写成了 “...）", () => {
    expect(
      parseSavePathArgs('空洞骑士 “C:\\Users\\Administrator\\AppData\\LocalLow\\Team Cherry\\Hollow Knight\\*.*"'),
    ).toEqual(["C:\\Users\\Administrator\\AppData\\LocalLow\\Team Cherry\\Hollow Knight\\*.*"]);
  });

  it("一个引号都没有时兜底：去掉第一个 token（游戏名），剩下当一条路径", () => {
    expect(parseSavePathArgs("某游戏 D:/saves/*.*")).toEqual(["D:/saves/*.*"]);
    expect(parseSavePathArgs("")).toEqual([]);
    expect(parseSavePathArgs(undefined)).toEqual([]);
  });
});

describe("normalizeSavePath：分隔符统一成 /", () => {
  it("反斜杠转正斜杠、去首尾空白、折掉重复斜杠", () => {
    expect(normalizeSavePath("  C:\\Users\\Administrator\\Documents\\StarCraft II\\*.*  ")).toBe(
      "C:/Users/Administrator/Documents/StarCraft II/*.*",
    );
    expect(normalizeSavePath("X:\\\\YunGame\\\\W\\\\Ride\\\\settings\\\\*.*")).toBe(
      "X:/YunGame/W/Ride/settings/*.*",
    );
  });

  it("注册表格式也照样转（需求：统一用 /）", () => {
    expect(normalizeSavePath("HKEY_CURRENT_USER\\SOFTWARE\\Bennett Foddy\\Getting Over It")).toBe(
      "HKEY_CURRENT_USER/SOFTWARE/Bennett Foddy/Getting Over It",
    );
  });
});

describe("collectSavePaths：按游戏归集 + 统计", () => {
  const games = [
    {
      Name: "甲游戏",
      GameId: "aaaa-bbbb",
      GameActions: [
        { Name: "开始游戏", Path: "Game.exe", Arguments: "" },
        { Name: "备份游戏存档", Path: "..\\Tools\\GameSaveHelper\\GameSaveHelper", Arguments: '甲游戏 "C:\\saves\\*.*"' },
      ],
    },
    {
      // 没有备份 action 的游戏：不进表
      Name: "乙游戏",
      GameId: "cccc",
      GameActions: [{ Name: "开始游戏", Path: "Game.exe" }],
    },
    {
      // 名字不标准（"开始游戏"）但路径指向备份工具：仍然算（统计里会点出来）
      Name: "丙游戏",
      GameId: "dddd",
      GameActions: [{ Name: "开始游戏", Path: "..\\Tools\\GameSaveHelper\\GameSaveHelper", Arguments: '丙游戏 "D:\\save2\\*.*"' }],
    },
    {
      // 一个游戏两条备份 action：路径合并去重
      Name: "丁游戏",
      GameId: "eeee",
      GameActions: [
        { Name: "备份游戏存档", Path: "GameSaveHelper", Arguments: '丁游戏 "E:\\a\\*.*"' },
        { Name: "备份游戏存档", Path: "GameSaveHelper", Arguments: '丁游戏 "E:\\a\\*.*" "E:\\b\\*.*"' },
      ],
    },
  ];

  const r = collectSavePaths(games);

  it("按 id（归一化）与名字都能查到路径", () => {
    expect(r.byGameId.get("aaaabbbb")).toEqual(["C:/saves/*.*"]);
    expect(r.byName.get("甲游戏")).toEqual(["C:/saves/*.*"]);
    expect(r.byName.get("乙游戏")).toBeUndefined(); // 没有备份 action
  });

  it("同一游戏多条 action 的路径合并去重且保持顺序", () => {
    expect(r.byName.get("丁游戏")).toEqual(["E:/a/*.*", "E:/b/*.*"]);
  });

  it("统计：有问题 action 的游戏数、多路径数都如实报出来", () => {
    expect(r.stats.games).toBe(4);
    expect(r.stats.withPaths).toBe(3);
    expect(r.stats.multiPath).toBe(1); // 丁游戏
    expect(r.stats.emptyArgs).toEqual([]); // 四条都解析成功
    expect(r.stats.oddActionNames.join()).toContain("丙游戏"); // 名字不标准，供人工确认
  });

  it("空输入不抛错", () => {
    expect(collectSavePaths([]).stats.withPaths).toBe(0);
    expect(collectSavePaths(null).stats.games).toBe(0);
  });
});
