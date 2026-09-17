// 数据目录配置解析规则的"可执行说明"。
// 权威文档：docs/design/directory-structure.md 的「路径配置」一节。
// 末尾还有一组 **parity 测试**：网站端 server/paths.mjs 必须和这里算出完全一样的结果，
// 否则就是又出现"桌面端配了、网站端不认"的漂移。
import { describe, expect, it } from "vitest";
import {
  resolveAnnouncementFile,
  resolveConfiguredDir,
  resolveConfiguredPath,
  resolveLibraryPaths,
} from "./pathConfig";
import * as serverPaths from "../server/paths.mjs";

const DATA_ROOT = "D:/YunGame/Playnite/data";
/** 应用所在目录（exe 的"家"）= 相对路径的基准。刻意与 DATA_ROOT 不同，才能验出用的是哪一个。 */
const APP_ROOT = "D:/YunGame/Playnite";

describe("resolveConfiguredPath：未配置 / 绝对 / 相对", () => {
  it("未配置（undefined / 空串 / 空白 / 非字符串）→ null（用默认）", () => {
    expect(resolveConfiguredPath(undefined, DATA_ROOT)).toBeNull();
    expect(resolveConfiguredPath("", DATA_ROOT)).toBeNull();
    expect(resolveConfiguredPath("   ", DATA_ROOT)).toBeNull();
    expect(resolveConfiguredPath(123, DATA_ROOT)).toBeNull();
    expect(resolveConfiguredPath(null, DATA_ROOT)).toBeNull();
  });

  it("绝对路径原样（两种分隔符都认，输出统一 /）", () => {
    expect(resolveConfiguredPath("E:\\Covers", DATA_ROOT)).toBe("E:/Covers");
    expect(resolveConfiguredPath("E:/Covers", DATA_ROOT)).toBe("E:/Covers");
    expect(resolveConfiguredPath("D:\\x\\..\\Covers", DATA_ROOT)).toBe("D:/Covers");
  });

  it("UNC 网络路径两种写法都认（网吧/无盘常把数据放共享）", () => {
    expect(resolveConfiguredPath("\\\\NAS\\share\\covers", DATA_ROOT)).toBe("//NAS/share/covers");
    expect(resolveConfiguredPath("//NAS/share/covers", DATA_ROOT)).toBe("//NAS/share/covers");
  });

  it("相对路径以 baseDir（应用 exe 所在目录）为基准，且折叠 . 与 ..", () => {
    // 基准就是传进来的 baseDir —— 桌面端传 appRoot()，**不是**数据根。
    expect(resolveConfiguredPath("Covers", APP_ROOT)).toBe("D:/YunGame/Playnite/Covers");
    expect(resolveConfiguredPath("data\\Covers", APP_ROOT)).toBe("D:/YunGame/Playnite/data/Covers");
    expect(resolveConfiguredPath("..\\shared\\Covers", APP_ROOT)).toBe(
      "D:/YunGame/shared/Covers",
    );
    expect(resolveConfiguredPath("./a/b", APP_ROOT)).toBe("D:/YunGame/Playnite/a/b");
  });

  it("首尾空白被忽略（手改 config.json 时很容易多打空格）", () => {
    expect(resolveConfiguredPath("  E:\\Covers  ", DATA_ROOT)).toBe("E:/Covers");
  });
});

describe("resolveConfiguredDir：目录默认值", () => {
  it("未配置 → <数据根>/<默认名>", () => {
    expect(resolveConfiguredDir("", DATA_ROOT, "CoverImages")).toBe(
      "D:/YunGame/Playnite/data/CoverImages",
    );
    expect(resolveConfiguredDir("", DATA_ROOT, "Game_Details")).toBe(
      "D:/YunGame/Playnite/data/Game_Details",
    );
    expect(resolveConfiguredDir("", DATA_ROOT, "announcements")).toBe(
      "D:/YunGame/Playnite/data/announcements",
    );
  });

  it("配了就整体替换（不拼默认名）", () => {
    expect(resolveConfiguredDir("E:\\图片", DATA_ROOT, "CoverImages")).toBe("E:/图片");
    // 相对值挂在 baseDir 下（显式传 APP_ROOT，模拟桌面端）
    expect(resolveConfiguredDir("Addons", DATA_ROOT, "Game_Details", APP_ROOT)).toBe(
      "D:/YunGame/Playnite/Addons",
    );
    // 不传 baseDir 时保持旧行为（= 数据根）：网站端/老调用点不受影响
    expect(resolveConfiguredDir("Addons", DATA_ROOT, "Game_Details")).toBe(
      "D:/YunGame/Playnite/data/Addons",
    );
  });

  it('默认名传 "" 表示默认就是数据根本身', () => {
    expect(resolveConfiguredDir("", DATA_ROOT, "")).toBe("D:/YunGame/Playnite/data");
  });
});

describe("resolveLibraryPaths：权威库目录与库根都可配置，复制关系固定", () => {
  it("未配置 → 旧布局（权威库 <数据根>/Admin，运行时副本 <数据根>/library）", () => {
    expect(resolveLibraryPaths({ dataRoot: DATA_ROOT })).toEqual({
      root: "D:/YunGame/Playnite/data",
      sourceDir: "D:/YunGame/Playnite/data/Admin",
      source: "D:/YunGame/Playnite/data/Admin/library.db",
      runtime: "D:/YunGame/Playnite/data/library/library.db",
    });
  });

  it("只配库根 → 权威库跟着库根走（<库根>/Admin）", () => {
    expect(resolveLibraryPaths({ dataRoot: DATA_ROOT, libraryDir: "E:/Lib" })).toEqual({
      root: "E:/Lib",
      sourceDir: "E:/Lib/Admin",
      source: "E:/Lib/Admin/library.db",
      runtime: "E:/Lib/library/library.db",
    });
  });

  it("权威库固定在 <库根>/Admin（2026-09-17 收口：不再有 sourceLibraryDir 这个选项）", () => {
    // 只给数据根：权威库 = <数据根>/Admin、运行时副本 = <数据根>/library
    const p = resolveLibraryPaths({ dataRoot: DATA_ROOT });
    expect(p.sourceDir).toBe("D:/YunGame/Playnite/data/Admin");
    expect(p.source).toBe("D:/YunGame/Playnite/data/Admin/library.db");
    // 改库根 → 两处一起跟着动（"配置的库"与"被复制的库"不可能分家）
    const q = resolveLibraryPaths({ dataRoot: DATA_ROOT, libraryDir: "E:/Lib" });
    expect(q.sourceDir).toBe("E:/Lib/Admin");
    expect(q.runtime).toBe("E:/Lib/library/library.db");
  });
});

describe("resolveAnnouncementFile：跟着库根走（2026-09-17 起不再单独配公告目录）", () => {
  it("公告文件 = <库根>/announcements/announcement.html", () => {
    expect(resolveAnnouncementFile(DATA_ROOT)).toBe(
      "D:/YunGame/Playnite/data/announcements/announcement.html",
    );
    // 相对库根也照样规范化（两种分隔符都收）
    expect(resolveAnnouncementFile("dev-data")).toBe("dev-data/announcements/announcement.html");
  });
});

// ---------------------------------------------------------------------------
// parity：网站端（server/paths.mjs）与桌面端必须算出一样的结果。
// 网站端曾经把 CoverImages/Game_Details/announcements/library 全写死，
// 桌面端配了自定义目录它读不到 —— 这组用例就是防止那种漂移再回来。
// ---------------------------------------------------------------------------
describe("parity：网站端 server/paths.mjs 与桌面端规则一致", () => {
  const CASES: Array<string | undefined> = [
    undefined,
    "",
    "   ",
    "CoverImages",
    "sub\\Covers",
    "..\\shared\\Covers",
    "E:\\Covers",
    "E:/Covers",
    "\\\\NAS\\share\\covers",
    "//NAS/share/covers",
    "  E:\\带空格 的目录  ",
  ];

  it("resolveConfiguredPath 结果一致", () => {
    const diff: string[] = [];
    // 两种基准都要比：baseDir（新版语义）与不传（旧行为），避免只覆盖一边
    for (const base of [DATA_ROOT, APP_ROOT]) {
      for (const raw of CASES) {
        const a = resolveConfiguredPath(raw, base);
        const b = serverPaths.resolveConfiguredPath(raw, base);
        if (a !== b) diff.push(`base=${base} raw=${JSON.stringify(raw)} 桌面=${a} 网站=${b}`);
      }
    }
    expect(diff).toEqual([]);
  });

  it("resolveConfiguredDir / resolveLibraryPaths / resolveAnnouncementFile 结果一致", () => {
    const diff: string[] = [];
    for (const base of [DATA_ROOT, APP_ROOT]) {
      for (const raw of CASES) {
        for (const name of ["CoverImages", "Game_Details", "announcements"]) {
          const a = resolveConfiguredDir(raw, DATA_ROOT, name, base);
          const b = serverPaths.resolveConfiguredDir(raw, DATA_ROOT, name, base);
          if (a !== b) diff.push(`dir base=${base} raw=${JSON.stringify(raw)} name=${name}: ${a} vs ${b}`);
        }
        // 权威库目录 + 库根两个维度都要对齐
        for (const libraryDir of [undefined, raw] as Array<string | undefined>) {
          const opts = { dataRoot: DATA_ROOT, baseDir: base, libraryDir, sourceLibraryDir: raw };
          const la = resolveLibraryPaths(opts);
          const lb = serverPaths.resolveLibraryPaths(opts);
          if (JSON.stringify(la) !== JSON.stringify(lb)) {
            diff.push(`library ${JSON.stringify(opts)}: ${JSON.stringify(la)} vs ${JSON.stringify(lb)}`);
          }
        }
      }
    }
    // 公告：跟着库根走（2026-09-17 起不再单独配置公告目录）—— 两边都只接一个库根
    const aa = resolveAnnouncementFile(DATA_ROOT);
    const ab = serverPaths.resolveAnnouncementFile(DATA_ROOT);
    if (aa !== ab) diff.push(`announcement: ${aa} vs ${ab}`);
    expect(diff).toEqual([]);
  });
});
