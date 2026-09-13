// 路径模式表（path-modes.json）的"可执行说明"。
//
// 除了逐条验证解析/套用/校验逻辑，最后两组用例直接**读仓库里真实的 path-modes.json 与
// config.json**：
//   · 规则文件本身必须合法（缺字段/混盘符都会被拦下）；
//   · 开发模式的规则套到 config.json 上必须"零改动" —— 也就是 config.json 没漂移。
// 这两条等于把"规则与配置一致"变成了测试，不依赖谁记得去跑脚本。

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PATH_FIELDS, PathModeError, readModeTable, resolveModeSettings } from "./pathModes";
import type { AppSettings } from "./models";

const ROOT = process.cwd();

/** 一份合法的模式表（三个模式都齐、盘符与环境一致）。 */
function table(overrides: Record<string, Record<string, string>> = {}) {
  const base = (drive: string, data: string, source: string, ann: string) => ({
    coverImagesDir: `${drive}:/YunGame/PlayNite/CoverImages`,
    gameDetailsDir: `${drive}:/Addons`,
    musicDir: `${drive}:/KwDownload/song`,
    libraryDir: data,
    sourceLibraryDir: source,
    announcementsDir: ann,
    defaultGameRootPath: `${drive}:/YunGame/Playnite`,
    runtimeDir: `${drive}:/YunGame/Playnite/runtime`,
    yungamestartDir: `${drive}:/YunGame/Playnite/yungamestart`,
    yunGameUserListPath: `${drive}:/YunGame/PlayNite/YunGameConfig/YunGame_UserList.json`,
    yunGameServerStatusPath: `${drive}:/YunGame/PlayNite/YunGameConfig/YunGame_ServerStatus.json`,
    gameSaveHelperPath: `${drive}:/AI/nsis/GameSaveHelper.exe`,
  });
  return {
    modes: {
      dev: { ...base("D", "dev-data", "dev-data/Admin", "dev-data/announcements"), ...overrides.dev },
      prerelease: {
        ...base("D", "D:/repo/dev-data", "D:/repo/dev-data/Admin", "D:/repo/dev-data/announcements"),
        ...overrides.prerelease,
      },
      release: { ...base("X", "data", "data/Admin", "data/announcements"), ...overrides.release },
    },
  };
}

describe("readModeTable：结构校验（规则文件写坏要立刻说清哪里坏）", () => {
  it("正常表：三个模式都被接受", () => {
    const t = readModeTable(table());
    expect(t.dev.coverImagesDir).toBe("D:/YunGame/PlayNite/CoverImages");
    expect(t.release.libraryDir).toBe("data");
  });

  it("缺 modes 段 / 缺某个模式 → 报错并点名", () => {
    expect(() => readModeTable({})).toThrow(PathModeError);
    expect(() => readModeTable({ modes: { dev: {}, prerelease: {} } })).toThrow(/release/);
  });

  it("缺字段 / 值为空 → 报错并列出字段名", () => {
    const raw = table() as { modes: Record<string, Record<string, string>> };
    delete raw.modes.dev.musicDir;
    expect(() => readModeTable(raw)).toThrow(/musicDir/);
    raw.modes.dev.musicDir = "   ";
    expect(() => readModeTable(raw)).toThrow(/musicDir/);
  });

  it("多出不认识的字段 → 报错（避免有人以为写了就生效）", () => {
    const raw = table() as { modes: Record<string, Record<string, string>> };
    raw.modes.release.screenshotDir = "X:/shots";
    expect(() => readModeTable(raw)).toThrow(/screenshotDir/);
  });

  it("盘符与环境不符 → 报错（dev 里混 X 盘 / release 里混 D 盘）", () => {
    expect(() => readModeTable(table({ dev: { musicDir: "X:/KwDownload/song" } }))).toThrow(/dev.*D 盘环境/);
    expect(() => readModeTable(table({ release: { gameDetailsDir: "D:/Addons" } }))).toThrow(/release.*X 盘环境/);
  });

  it("runtimeDir / yungamestartDir 也受盘符规则管（正式机误写成 D 盘要当场失败）", () => {
    expect(() =>
      readModeTable(table({ release: { runtimeDir: "D:/YunGame/Playnite/runtime" } })),
    ).toThrow(/runtimeDir/);
    expect(() =>
      readModeTable(table({ prerelease: { yungamestartDir: "X:/YunGame/Playnite/yungamestart" } })),
    ).toThrow(/yungamestartDir/);
  });
});

describe("resolveModeSettings：把规则套到 settings（只动路径字段）", () => {
  const devSettings = {
    coverImagesDir: "D:/old/Covers",
    gameDetailsDir: "D:/old/Addons",
    musicDir: "D:/old/song",
    libraryDir: "dev-data",
    sourceLibraryDir: "dev-data/Admin",
    announcementsDir: "dev-data/announcements",
    defaultGameRootPath: "D:/old/Playnite",
    runtimeDir: "D:/old/runtime",
    yungamestartDir: "D:/old/yungamestart",
    yunGameUserListPath: "D:/old/users.json",
    yunGameServerStatusPath: "D:/old/status.json",
    gameSaveHelperPath: "D:/old/helper.exe",
    themeId: "p-light",
    musicVolume: 30,
    cardText: { color: "#fff8e7" },
  } as unknown as AppSettings;

  it("release：环境路径全换 X 盘、数据随包（相对 data）", () => {
    const { settings } = resolveModeSettings(devSettings, readModeTable(table()), "release");
    expect(settings.coverImagesDir).toBe("X:/YunGame/PlayNite/CoverImages");
    expect(settings.gameDetailsDir).toBe("X:/Addons");
    expect(settings.libraryDir).toBe("data");
    expect(settings.sourceLibraryDir).toBe("data/Admin");
    expect(settings.announcementsDir).toBe("data/announcements");
  });

  it("prerelease：全 D 盘，库指向开发数据（绝对路径）", () => {
    const { settings } = resolveModeSettings(devSettings, readModeTable(table()), "prerelease");
    expect(settings.coverImagesDir).toBe("D:/YunGame/PlayNite/CoverImages");
    expect(settings.libraryDir).toBe("D:/repo/dev-data");
  });

  it(`只动 ${PATH_FIELDS.length} 个路径字段：主题/音量/颜色这些原样（并列出改动清单）`, () => {
    const { settings, changes } = resolveModeSettings(devSettings, readModeTable(table()), "release");
    expect(settings.themeId).toBe("p-light");
    expect(settings.musicVolume).toBe(30);
    expect(settings.cardText).toEqual({ color: "#fff8e7" });
    expect(changes.map((c) => c.field.replace(/^settings\./, "")).sort()).toEqual([...PATH_FIELDS].sort());
  });

  it("纯函数：不改入参", () => {
    const dev = { ...devSettings } as unknown as Record<string, unknown>;
    resolveModeSettings(devSettings, readModeTable(table()), "release");
    expect(dev.coverImagesDir).toBe("D:/old/Covers");
  });

  it("已经一致时改动清单为空（这是 --check 判定的依据）", () => {
    const t = readModeTable(table());
    const already = resolveModeSettings(devSettings, t, "release").settings;
    const again = resolveModeSettings(already, t, "release");
    expect(again.changes).toEqual([]);
  });
});

describe("仓库里的真实文件（规则与配置都不许漂移）", () => {
  const ruleFile = path.join(ROOT, "path-modes.json");
  const configFile = path.join(ROOT, "config.json");

  it("path-modes.json 合法（三模式齐全、盘符与环境一致）", () => {
    const raw = JSON.parse(fs.readFileSync(ruleFile, "utf-8"));
    const t = readModeTable(raw);
    for (const field of PATH_FIELDS) {
      expect(t.dev[field]).toBeTruthy();
      expect(t.prerelease[field]).toBeTruthy();
      expect(t.release[field]).toBeTruthy();
    }
  });

  it("运行库/自启工具目录跟着环境走盘符（正式 X 盘、测试 D 盘）", () => {
    const t = readModeTable(JSON.parse(fs.readFileSync(ruleFile, "utf-8")));
    expect(t.release.runtimeDir).toBe("X:/YunGame/Playnite/runtime");
    expect(t.release.yungamestartDir).toBe("X:/YunGame/Playnite/yungamestart");
    expect(t.prerelease.runtimeDir).toBe("D:/YunGame/Playnite/runtime");
    expect(t.prerelease.yungamestartDir).toBe("D:/YunGame/Playnite/yungamestart");
    // 开发态指仓库里的源头（那份是编译与打包的输入），不是某个机器的绝对盘符
    expect(t.dev.runtimeDir).toBe("tools/runtime");
    expect(t.dev.yungamestartDir).toBe("tools/yungamestart");
  });

  it("config.json 与 dev 模式规则一致（不一致就说明有人手工改了配置或忘了同步规则）", () => {
    const rules = readModeTable(JSON.parse(fs.readFileSync(ruleFile, "utf-8")));
    const settings = JSON.parse(fs.readFileSync(configFile, "utf-8")).settings as AppSettings;
    const { changes } = resolveModeSettings(settings, rules, "dev");
    expect(changes.map((c) => `${c.field}: ${c.from} → ${c.to}`)).toEqual([]);
  });
});
