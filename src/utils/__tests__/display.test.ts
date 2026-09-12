// 显示名辅助函数的单元测试。验证 displayName 的中文优先 / 英文回退逻辑。

import { describe, it, expect } from "vitest";
import { displayName } from "../display";
import type { Game } from "../../types/models";
import { makeGame as makeBaseGame } from "../../test/factories";

// 本文件的默认主名是英文名（用于验证"无本地化名时回退到英文主名"）。
function makeGame(over: Partial<Game> = {}): Game {
  return makeBaseGame({ name: "English Name", ...over });
}

describe("displayName", () => {
  it("无本地化名时回退到英文主名", () => {
    expect(displayName(makeGame({}))).toBe("English Name");
  });

  it("优先用 zh-CN 本地化名", () => {
    const g = makeGame({
      localizedNames: [
        { language: "zh-TW", name: "星海爭霸" },
        { language: "zh-CN", name: "星际争霸" },
      ],
    });
    expect(displayName(g)).toBe("星际争霸");
  });

  it("没有 zh-CN 时用 zh-TW", () => {
    const g = makeGame({ localizedNames: [{ language: "zh-TW", name: "星海爭霸" }] });
    expect(displayName(g)).toBe("星海爭霸");
  });

  it("忽略空白的本地化名，回退英文", () => {
    const g = makeGame({ localizedNames: [{ language: "zh-CN", name: "  " }] });
    expect(displayName(g)).toBe("English Name");
  });
});
