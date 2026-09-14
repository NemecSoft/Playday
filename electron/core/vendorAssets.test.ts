// vendor 资源解析的守门测试（实现：electron/core/vendorAssets.ts）。
//
// 为什么值得单独钉：这个目录是**由本地 HTTP 服务器发给详情页**的（内置播放器 DPlayer 的 js），
// 所以"只放行裸文件名 + 扩展名白名单"这条边界一旦松了，就等于把整个磁盘开成一个下载口。
import * as path from "path";
import { describe, expect, it, vi } from "vitest";

// paths.ts 会 import electron 的 app；单测里不需要真的 Electron。
vi.mock("electron", () => ({ app: { isPackaged: false } }));
// paths.ts 的 appRoot() 是按**编译后**的目录层级算的（dist-electron/electron/core → 往上三级
// 才是仓库根），单测跑的是源码路径，算出来会少一级。这是既有设计（不该为测试改生产代码），
// 所以这里直接把 vendor 目录指到仓库根 —— 本文件要守的是"白名单/防穿越"，不是路径推导。
vi.mock("./paths", () => ({
  vendorDir: () => path.join(process.cwd(), "vendor"),
}));

import { activeVendorDir, resolveVendorRequest } from "./vendorAssets";

describe("resolveVendorRequest：只放行 vendor 目录下的裸文件名", () => {
  it("随包的 DPlayer 能解析到（顺便守住文件名没被改坏）", () => {
    const full = resolveVendorRequest("DPlayer.min.js");
    expect(full).toBeTruthy();
    expect(full!.replace(/\\/g, "/").endsWith("/vendor/DPlayer.min.js")).toBe(true);
  });

  it("拒绝路径穿越：..、绝对路径、子目录、空串", () => {
    expect(resolveVendorRequest("../../package.json")).toBeNull();
    expect(resolveVendorRequest("..\\..\\package.json")).toBeNull();
    expect(resolveVendorRequest("D:/secret.txt")).toBeNull();
    expect(resolveVendorRequest("sub/DPlayer.min.js")).toBeNull();
    expect(resolveVendorRequest("")).toBeNull();
  });

  it("扩展名白名单之外一律拒绝（别把 vendor 当通用下载口）", () => {
    expect(resolveVendorRequest("README.md")).toBeNull();
    expect(resolveVendorRequest("DPlayer.LICENSE.txt")).toBeNull();
  });

  it("不存在的文件名返回 null（而不是抛异常）", () => {
    expect(resolveVendorRequest("nope.js")).toBeNull();
  });

  it("生效目录就是仓库根的 vendor/（开发态）", () => {
    const dir = activeVendorDir();
    expect(dir).toBeTruthy();
    expect(dir!.replace(/\\/g, "/").endsWith("/vendor")).toBe(true);
  });
});
