// videos/ 扫描与分类的"可执行说明"。
// 被测实现：electron/core/videoLibrary.ts —— /api/videos（HTTP）与 get_game_videos（IPC）都走它。
// ⚠️ 本文件（以及被测模块）**不得 import electron**：这是主进程侧的测试，跑在 node 环境里，
//    没有 electron 模块。只依赖 node 内置模块 + 临时目录（见 vitest.config.mts 的 include）。
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  compareNatural,
  findVideoPoster,
  VIDEO_DIR_NAMES,
  findVideoDir,
  flattenVideos,
  isVideoFile,
  isWebPlayable,
  scanVideos,
} from "./videoLibrary";

let tmp = "";
let videosRoot = "";

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yungame-videos-"));
  videosRoot = path.join(tmp, "videos");
  fs.mkdirSync(path.join(videosRoot, "实况"), { recursive: true });
  fs.mkdirSync(path.join(videosRoot, "空目录"), { recursive: true });
  fs.writeFileSync(path.join(videosRoot, "实况10.mp4"), "");
  fs.writeFileSync(path.join(videosRoot, "实况2.mp4"), "");
  fs.writeFileSync(path.join(videosRoot, "说明.txt"), "");
  fs.writeFileSync(path.join(videosRoot, "实况", "第1期.mp4"), "");
  fs.writeFileSync(path.join(videosRoot, "实况", "封面.jpg"), "");
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

// 2026-09-17 需求：视频目录的候选名（`视频攻略&游戏实况` 优先、`videos` 兜底）。
// 探测错 = 视频整片不显示，而且**不报错**（扫描不到就是"没有视频"），所以把优先级钉住。
describe("findVideoDir：视频目录候选（新名优先、旧名兜底）", () => {
  /** 造一个"游戏目录"：dirs 为空时只建目录本身。 */
  const mk = (name: string, ...dirs: string[]) => {
    const game = path.join(tmp, name);
    fs.mkdirSync(game, { recursive: true });
    for (const d of dirs) fs.mkdirSync(path.join(game, d), { recursive: true });
    return game;
  };

  it("只有新名 → 命中新名（并给出要用来拼 URL 的目录名）", () => {
    const game = mk("g-new", VIDEO_DIR_NAMES[0]);
    expect(findVideoDir(game)).toEqual({
      path: path.join(game, VIDEO_DIR_NAMES[0]),
      name: VIDEO_DIR_NAMES[0],
    });
  });

  it("只有旧名 videos → 命中旧名（老数据还没搬的机器照样能看）", () => {
    expect(findVideoDir(mk("g-old", "videos"))?.name).toBe("videos");
  });

  it("两个都在 → 新名优先（需求：默认检测新名，有就用它）", () => {
    expect(findVideoDir(mk("g-both", "videos", VIDEO_DIR_NAMES[0]))?.name).toBe(VIDEO_DIR_NAMES[0]);
  });

  it("都没有 / 游戏目录都不存在 → null（没有视频是正常状态，不是错误）", () => {
    expect(findVideoDir(mk("g-none"))).toBeNull();
    expect(findVideoDir(path.join(tmp, "根本没有这个游戏"))).toBeNull();
  });
});

describe("哪些文件算视频", () => {
  it("认视频扩展名，大小写都认", () => {
    for (const n of ["a.mp4", "a.MP4", "a.mkv", "a.webm", "a.flv"]) {
      expect(isVideoFile(n), n).toBe(true);
    }
  });

  it("不认非视频（图片/文本/无后缀）", () => {
    for (const n of ["a.jpg", "a.txt", "a", "a.mp4.bak"]) {
      expect(isVideoFile(n), n).toBe(false);
    }
  });
});

describe("能不能内置播放", () => {
  it("mp4 / m4v / webm / ogv 可以", () => {
    for (const n of ["a.mp4", "a.m4v", "a.webm", "a.ogv"]) {
      expect(isWebPlayable(n), n).toBe(true);
    }
  });

  it("mkv / flv / avi / mov 判为不能 —— 前端据此给「用系统播放器打开」", () => {
    for (const n of ["a.mkv", "a.flv", "a.avi", "a.mov"]) {
      expect(isWebPlayable(n), n).toBe(false);
      // 但它们仍然要被列出来（用户放了就得看得见，只是换个播放方式）
      expect(isVideoFile(n), n).toBe(true);
    }
  });
});

describe("扫描与排序", () => {
  it("实况2 排在 实况10 前（自然序，不是字符串序）", () => {
    expect(compareNatural("实况2.mp4", "实况10.mp4")).toBeLessThan(0);
  });

  it("根目录视频按自然序、非视频被排除、空子目录不占位", () => {
    const scan = scanVideos(videosRoot);
    expect(scan.root).toEqual(["实况2.mp4", "实况10.mp4"]);
    expect(scan.dirs.map((d) => d.name)).toEqual(["实况"]);
    expect(scan.dirs[0].files).toEqual(["实况/第1期.mp4"]);
  });

  it("目录不存在 → 空结果，不抛错（没视频是正常状态）", () => {
    expect(scanVideos(path.join(tmp, "nope"))).toEqual({ root: [], dirs: [] });
  });

  it("摊平后：先根下、再按组展开；name 去掉组名前缀，group 带上组名", () => {
    const flat = flattenVideos(scanVideos(videosRoot));
    expect(flat).toEqual([
      { name: "实况2.mp4", rel: "实况2.mp4", group: "" },
      { name: "实况10.mp4", rel: "实况10.mp4", group: "" },
      { name: "第1期.mp4", rel: "实况/第1期.mp4", group: "实况" },
    ]);
  });
});

describe("findVideoPoster：与视频同名的图片当预览封面", () => {
  it("找到同名图片（含子目录里的）", () => {
    fs.writeFileSync(path.join(videosRoot, "实况10.jpg"), "");
    fs.writeFileSync(path.join(videosRoot, "实况", "第1期.webp"), "");
    expect(findVideoPoster(videosRoot, "实况10.mp4")).toBe("实况10.jpg");
    expect(findVideoPoster(videosRoot, "实况/第1期.mp4")).toBe("实况/第1期.webp");
  });

  it("没有同名图片 → null（这时页面脚本会抓视频的一帧来当封面）", () => {
    expect(findVideoPoster(videosRoot, "实况2.mp4")).toBeNull();
    expect(findVideoPoster(videosRoot, "不存在的视频.mp4")).toBeNull();
  });

  it("扩展名优先级固定（jpg 先于 png），不随文件系统返回顺序漂移", () => {
    fs.writeFileSync(path.join(videosRoot, "实况2.png"), "");
    fs.writeFileSync(path.join(videosRoot, "实况2.jpg"), "");
    expect(findVideoPoster(videosRoot, "实况2.mp4")).toBe("实况2.jpg");
  });
});
