// 路径模式表（path-modes.json）的"可执行说明"。
//
// 除了逐条验证解析/套用/校验逻辑，最后两组用例直接**读仓库里真实的 path-modes.json 与
// config.json**：
//   · 规则文件本身必须合法（缺字段/就地字段两模式写不一致都会被拦下）；
//   · 开发模式的规则套到 config.json 上必须"零改动" —— 也就是 config.json 没漂移。
// 这两条等于把"规则与配置一致"变成了测试，不依赖谁记得去跑脚本。

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PATH_FIELDS,
  PathModeError,
  copyPlan,
  readModeTable,
  resolveModeSettings,
  runtimeValue,
  targetIsFile,
  targetRoot,
} from "./pathModes";
import type { AppSettings } from "./models";

const ROOT = process.cwd();

/**
 * 一份合法的模式表（两模式都齐、字段齐、就地字段两模式一致）。
 *
 * 值类型故意放宽成 `unknown`：这些用例里有一半是**故意写坏的表**（数组只剩一项、
 * 目标用 .. 跑出根……），喂的本来就是"从 JSON 解析出来的原始值"。
 */
function table(overrides: Record<string, Record<string, unknown>> = {}) {
  const base = (): Record<string, unknown> => ({
    coverImagesDir: "dev-CoverImages",
    gameDetailsDir: "D:/Addons",
    musicDir: "D:/Addons/song",
    fontsDir: "dev-fonts",
    libraryDir: "dev-data",
    // 目的地根：dev = 仓库根（`.`）、release = 部署目的地。两模式可以不同，是唯一的例外。
    defaultGameRootPath: ".",
    runtimeDir: "dev-tools/runtime",
    yungamestartDir: "dev-tools/yungamestart/dist",
    YunGameConfigDir: "dev-YunGameConfig",
    gameSaveHelperDir: "dev-tools/GameSaveHelper/release",
  });
  return {
    modes: {
      dev: { ...base(), ...overrides.dev },
      release: { ...base(), ...overrides.release },
    },
  };
}

describe("readModeTable：结构校验（规则文件写坏要立刻说清哪里坏）", () => {
  it("正常表：两种模式都被接受", () => {
    const t = readModeTable(table());
    expect(t.dev.coverImagesDir).toBe("dev-CoverImages");
    expect(t.release.libraryDir).toBe("dev-data");
  });

  it("缺 modes 段 / 缺某个模式 → 报错并点名", () => {
    expect(() => readModeTable({})).toThrow(PathModeError);
    expect(() => readModeTable({ modes: { dev: {} } })).toThrow(/release/);
  });

  it("缺字段 / 值为空 → 报错并列出字段名", () => {
    const raw = table();
    delete raw.modes.dev.musicDir;
    expect(() => readModeTable(raw)).toThrow(/musicDir/);
    raw.modes.dev.musicDir = "   ";
    expect(() => readModeTable(raw)).toThrow(/musicDir/);
  });

  it("多出不认识的字段 → 报错（避免有人以为写了就生效）", () => {
    const raw = table();
    raw.modes.release.screenshotDir = "X:/shots";
    expect(() => readModeTable(raw)).toThrow(/screenshotDir/);
  });

  it("2026-09-17 删掉的老字段不再被认（改回旧写法会当场失败，不会静默失效）", () => {
    // 库/公告的位置由 libraryDir 推出来；用户表/存档工具只配目录 —— 老写法必须报错。
    for (const old of ["sourceLibraryDir", "announcementsDir", "yunGameUserListPath", "yunGameServerStatusPath", "gameSaveHelperPath"]) {
      const raw = table({ release: { [old]: "whatever" } });
      expect(() => readModeTable(raw)).toThrow(new RegExp(old));
    }
  });

  it("就地字段（字符串）两模式必须写一样（正式机盘符靠 promote 统一改写，不在表里写 X:）", () => {
    expect(() => readModeTable(table({ release: { gameDetailsDir: "X:/Addons" } }))).toThrow(/gameDetailsDir/);
    // defaultGameRootPath 例外：它是各自模式的**目的地根**（dev 就是仓库根）
    expect(() => readModeTable(table({ release: { defaultGameRootPath: "D:/YunGame/Playnite" } }))).not.toThrow();
  });
});

describe("两种写法：就地用（\"路径\"）vs 要搬（[\"源\", \"目标\"]）", () => {
  /** 一份混着两种写法的表：封面 / 库 / 运行库要搬，其余就地。 */
  const mixed = () =>
    readModeTable(
      table({
        release: {
          coverImagesDir: ["dev-CoverImages", "CoverImages"],
          libraryDir: ["dev-data", "data"],
          runtimeDir: ["dev-tools/runtime", "tools/runtime"],
          gameSaveHelperDir: ["dev-tools/GameSaveHelper/release", "tools/GameSaveHelper"],
        },
      }),
    );

  it("就地用：运行时值 = 自身，且不进搬运清单", () => {
    const t = mixed();
    expect(runtimeValue(t.release.gameDetailsDir)).toBe("D:/Addons");
    expect(copyPlan(t, "release").map((i) => i.field)).not.toContain("gameDetailsDir");
  });

  it("要搬：运行时值 = 目标，清单里能看到 源 → 目标", () => {
    const t = mixed();
    expect(runtimeValue(t.release.coverImagesDir)).toBe("CoverImages");
    expect(copyPlan(t, "release")).toContainEqual({
      field: "coverImagesDir",
      src: "dev-CoverImages",
      dst: "CoverImages",
    });
  });

  it("搬运清单的顺序 = PATH_FIELDS 顺序（清单稳定，人工核对 diff 才有意义）", () => {
    expect(copyPlan(mixed(), "release").map((i) => i.field)).toEqual([
      "coverImagesDir",
      "libraryDir",
      "runtimeDir",
      "gameSaveHelperDir",
    ]);
  });

  it("resolveModeSettings 写进 config 的是运行时值（目标），源只属于部署", () => {
    const devSettings = { coverImagesDir: "D:/old" } as unknown as AppSettings;
    const { settings } = resolveModeSettings(devSettings, mixed(), "release");
    expect(settings.coverImagesDir).toBe("CoverImages");
    expect((settings as unknown as Record<string, unknown>).runtimeDir).toBe("tools/runtime");
  });

  it("目标根 = defaultGameRootPath 的运行时值", () => {
    expect(targetRoot(readModeTable(table()), "dev")).toBe(".");
    expect(targetRoot(mixed(), "release")).toBe(".");
  });

  it("数组不是两项 / 有空白项 → 报错（并点名是哪个字段）", () => {
    expect(() => readModeTable(table({ release: { musicDir: ["only-one"] } }))).toThrow(/musicDir.*两项/);
    expect(() => readModeTable(table({ release: { musicDir: ["", "x"] } }))).toThrow(/musicDir.*源/);
    expect(() => readModeTable(table({ release: { musicDir: ["x", " "] } }))).toThrow(/musicDir.*目标/);
  });

  it("目标用 .. 跑出目标根 → 报错（部署只许往目的地里写）", () => {
    expect(() => readModeTable(table({ release: { fontsDir: ["dev-fonts", "../fonts"] } }))).toThrow(/\.\./);
    // 绝对目标不走"相对目标根"的解析，不受这条限制
    expect(readModeTable(table({ release: { fontsDir: ["dev-fonts", "D:/fonts"] } })).release.fontsDir).toEqual([
      "dev-fonts",
      "D:/fonts",
    ]);
  });

  it("defaultGameRootPath 不能写成数组（它是所有相对目标的基准，不能循环定义）", () => {
    expect(() => readModeTable(table({ release: { defaultGameRootPath: ["a", "X:/root"] } }))).toThrow(
      /defaultGameRootPath/,
    );
  });

  it("目标是文件还是目录：靠最后一段有没有扩展名判定", () => {
    expect(targetIsFile("tools/GameSaveHelper/GameSaveHelper.exe")).toBe(true);
    expect(targetIsFile("tools\\GameSaveHelper\\GameSaveHelper.exe")).toBe(true);
    expect(targetIsFile("YunGameConfig/YunGame_UserList.json")).toBe(true);
    expect(targetIsFile("CoverImages")).toBe(false);
    expect(targetIsFile("data/Admin")).toBe(false);
  });
});

describe("resolveModeSettings：把规则套到 settings（只动路径字段）", () => {
  const devSettings = {
    coverImagesDir: "dev-CoverImages",
    gameDetailsDir: "D:/Addons",
    musicDir: "D:/Addons/song",
    fontsDir: "dev-fonts",
    libraryDir: "dev-data",
    defaultGameRootPath: ".",
    runtimeDir: "dev-tools/runtime",
    yungamestartDir: "dev-tools/yungamestart/dist",
    YunGameConfigDir: "dev-YunGameConfig",
    gameSaveHelperDir: "dev-tools/GameSaveHelper/release",
    themeId: "p-light",
    musicVolume: 30,
    cardText: { color: "#fff8e7" },
  } as unknown as AppSettings;

  it("release：搬运项写目标、就地项原样", () => {
    const mixed = readModeTable(
      table({ release: { coverImagesDir: ["dev-CoverImages", "CoverImages"], libraryDir: ["dev-data", "data"] } }),
    );
    const { settings } = resolveModeSettings(devSettings, mixed, "release");
    expect(settings.coverImagesDir).toBe("CoverImages");
    expect(settings.libraryDir).toBe("data");
    expect(settings.gameDetailsDir).toBe("D:/Addons");
  });

  it(`只动 ${PATH_FIELDS.length} 个路径字段：主题/音量/颜色这些原样（并列出改动清单）`, () => {
    const rules = readModeTable(table({ release: { fontsDir: ["dev-fonts", "fonts"] } }));
    const { settings, changes } = resolveModeSettings(devSettings, rules, "release");
    expect(settings.themeId).toBe("p-light");
    expect(settings.musicVolume).toBe(30);
    expect(settings.cardText).toEqual({ color: "#fff8e7" });
    // 只改了那一个字段
    expect(changes.map((c) => c.field)).toEqual(["settings.fontsDir"]);
  });

  it("纯函数：不改入参", () => {
    const dev = { ...devSettings } as unknown as Record<string, unknown>;
    resolveModeSettings(devSettings, readModeTable(table()), "release");
    expect(dev.coverImagesDir).toBe("dev-CoverImages");
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

  it("path-modes.json 合法（两模式齐全、10 个字段一个不缺）", () => {
    const t = readModeTable(JSON.parse(fs.readFileSync(ruleFile, "utf-8")));
    for (const field of PATH_FIELDS) {
      expect(runtimeValue(t.dev[field])).toBeTruthy();
      expect(runtimeValue(t.release[field])).toBeTruthy();
    }
  });

  it("真实的搬运清单：dev 一条都不搬；release 的源带 dev- 前缀、目标是目的地里的正常名", () => {
    const t = readModeTable(JSON.parse(fs.readFileSync(ruleFile, "utf-8")));
    // dev 是"就地跑"：一条都不搬（对 dev 跑部署是误操作，由文档禁止）
    expect(copyPlan(t, "dev")).toEqual([]);
    expect(copyPlan(t, "release").map((i) => `${i.src} → ${i.dst}`)).toEqual([
      "dev-CoverImages → CoverImages",
      "dev-fonts → fonts",
      "dev-data → data",
      "dev-tools/runtime → tools/runtime",
      "dev-tools/YunGameStart/dist → YunGameStart",
      "dev-YunGameConfig → YunGameConfig",
      "dev-tools/GameSaveHelper/release → tools/GameSaveHelper",
    ]);
    // 就地的两项永不进清单：详情与音乐都在 D 盘上由运维维护
    const fields = copyPlan(t, "release").map((i) => i.field);
    expect(fields).not.toContain("gameDetailsDir");
    expect(fields).not.toContain("musicDir");
  });

  it("config.json 与 dev 模式规则一致（不一致就说明有人手工改了配置或忘了同步规则）", () => {
    const rules = readModeTable(JSON.parse(fs.readFileSync(ruleFile, "utf-8")));
    const settings = JSON.parse(fs.readFileSync(configFile, "utf-8")).settings as AppSettings;
    const { changes } = resolveModeSettings(settings, rules, "dev");
    expect(changes.map((c) => `${c.field}: ${c.from} → ${c.to}`)).toEqual([]);
  });

  it("开发态的自启工具目录里真的有那两个快捷方式图标（读不到就会静默退成应用默认图标）", () => {
    // 2026-09-17 踩过：appIcon.ts 把 tools/yungamestart/assets 写死在代码里，目录改名 dev-tools 后
    // 图标静默失效（等级判对、图标不对，且不报错）。现在它从本表取值，所以这里盯住"表说的目录里真有图"。
    const root = path.dirname(ruleFile);
    const t = readModeTable(JSON.parse(fs.readFileSync(ruleFile, "utf-8")));
    const dir = path.resolve(root, runtimeValue(t.dev.yungamestartDir));
    for (const file of ["1.ico", "2.ico"]) {
      const p = path.join(dir, file);
      const sibling = path.join(dir, "..", "assets", file); // 编译产物没生成时的源文件位置
      expect(fs.existsSync(p) || fs.existsSync(sibling)).toBe(true);
    }
  });

  it("config.json 里不许再有已废弃的路径字段（只剩名字会变成「配了但其实没人读」的假配置）", () => {
    const settings = JSON.parse(fs.readFileSync(configFile, "utf-8")).settings as Record<string, unknown>;
    // 2026-09-17 收口：用户表 / 维护表只配目录（YunGameConfigDir）、存档工具只配目录（gameSaveHelperDir）、
    // 权威库与公告从 libraryDir 推导。这些旧名字已经从代码里删干净，留在 config.json 里只会误导运维
    //（改它一点效果都没有）。resolveModeSettings 只写表里的字段、不会删旧的，所以这里专门盯一次。
    const legacy = [
      "yunGameUserListPath",
      "yunGameServerStatusPath",
      "gameSaveHelperPath",
      "sourceLibraryDir",
      "announcementsDir",
    ];
    expect(legacy.filter((k) => k in settings)).toEqual([]);
  });
});
