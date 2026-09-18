// 封面路由的守门测试（实现：electron/core/coverAssets.ts）。
//
// 为什么值得单独钉：这条路由是**由本地 HTTP 服务器发给详情页**的（页面里就是
// `<img src="/CoverImages/…">`），"只放行裸文件名 + 封面扩展名白名单"这条边界一旦松了，
// 就等于把整个磁盘开成一个下载口。与 vendorAssets.test.ts 是同一类边界。
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// paths.ts 会 import electron 的 app；单测里不需要真的 Electron。
vi.mock("electron", () => ({ app: { isPackaged: false } }));
// 封面目录指向**临时夹具目录**：不依赖开发机上真实的封面库（那份不在版本管理里，
// fresh clone 跑测试不能挂）。与 vendorAssets.test.ts 用仓库根 vendor/ 同理。
const FIXTURE_DIR = path.join(os.tmpdir(), "playday-cover-assets-test");
vi.mock("./paths", () => ({
  coverImagesDir: () => path.join(os.tmpdir(), "playday-cover-assets-test"),
}));

import { resolveCoverRequest } from "./coverAssets";

beforeAll(() => {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(path.join(FIXTURE_DIR, "大富翁11-网吧联机版.jpg"), "x");
  fs.writeFileSync(path.join(FIXTURE_DIR, "带 空格#号.jpg"), "x");
  fs.writeFileSync(path.join(FIXTURE_DIR, "secret.txt"), "x");
});

describe("resolveCoverRequest：只放行封面目录下的裸文件名", () => {
  it("中文名封面能解析到（详情页里引用的就是这种名字）", () => {
    const full = resolveCoverRequest("大富翁11-网吧联机版.jpg");
    expect(full).toBeTruthy();
    expect(full!.replace(/\\/g, "/").endsWith("/playday-cover-assets-test/大富翁11-网吧联机版.jpg")).toBe(true);
  });

  it("含空格 / 井号的文件名照样解析（URL 编码由页面那一侧负责）", () => {
    expect(resolveCoverRequest("带 空格#号.jpg")).toBeTruthy();
  });

  it("拒绝路径穿越：..、绝对路径、子目录、空串", () => {
    expect(resolveCoverRequest("../../package.json")).toBeNull();
    expect(resolveCoverRequest("..\\..\\package.json")).toBeNull();
    expect(resolveCoverRequest("D:/secret.txt")).toBeNull();
    expect(resolveCoverRequest("sub/x.jpg")).toBeNull();
    expect(resolveCoverRequest("")).toBeNull();
  });

  it("扩展名白名单之外一律拒绝（别把封面目录当通用下载口）", () => {
    expect(resolveCoverRequest("secret.txt")).toBeNull();
  });

  it("不存在的文件返回 null（而不是抛异常）", () => {
    expect(resolveCoverRequest("nope.jpg")).toBeNull();
  });
});
