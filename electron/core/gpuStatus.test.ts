// GPU 状态判读的可执行说明。被测实现：electron/core/gpuStatus.ts。
//
// ⚠️ 本文件（以及被测模块）不得 import electron（见 vitest.config.mts）。
import { describe, expect, it } from "vitest";
import { extractGpuName, judgeGpuStatus } from "./gpuStatus";

// 本机实测到的真实字符串（RX 580 + D3D11）。
const REAL_GL_RENDERER =
  "ANGLE (AMD, AMD Radeon RX 580 2048SP (0x00006FDF) Direct3D11 vs_5_0 ps_5_0, D3D11-31.0.21925.1001)";

describe("judgeGpuStatus", () => {
  it("合成与光栅化都 enabled → 硬件加速开着、不告警", () => {
    const v = judgeGpuStatus(
      { gpu_compositing: "enabled", rasterization: "enabled", video_decode: "enabled" },
      { glRenderer: REAL_GL_RENDERER, jpegDecodeAcceleratorSupported: false },
    );
    expect(v.accelerated).toBe(true);
    expect(v.warn).toBe(false);
    expect(v.summary).toContain("硬件加速=开");
    expect(v.summary).toContain("AMD Radeon RX 580 2048SP");
    // 厂商名不该重复（串里第一个 AMD 是厂商，名字里也带 AMD）
    expect(v.summary).not.toContain("AMD AMD");
    expect(v.summary).toContain("图片硬解=无（Windows 上正常）");
  });

  it("出现 software → 判为软件渲染并告警，且说明常见原因", () => {
    const v = judgeGpuStatus({
      gpu_compositing: "disabled_software",
      rasterization: "disabled_software",
      video_decode: "disabled_software",
    });
    expect(v.accelerated).toBe(false);
    expect(v.warn).toBe(true);
    expect(v.summary).toContain("软件渲染");
    expect(v.summary).toContain("虚拟适配器"); // 给运维的排查线索
  });

  it("状态还没定下来（unknown）→ 不告警，只写“未知”", () => {
    // 早读一次就报"这台机器没在用 GPU"是误报 —— 2026-09 我自己踩过，别把它变回告警。
    const v = judgeGpuStatus({});
    expect(v.accelerated).toBe(false);
    expect(v.warn).toBe(false);
    expect(v.summary).toContain("未知");
  });

  it("只有一项 enabled 不算硬件加速", () => {
    expect(judgeGpuStatus({ gpu_compositing: "enabled", rasterization: "disabled_off" }).accelerated).toBe(
      false,
    );
  });

  it("拿不到 glRenderer 也不报错，显卡显示为未识别", () => {
    const v = judgeGpuStatus({ gpu_compositing: "enabled", rasterization: "enabled" });
    expect(v.summary).toContain("显卡=(未识别)");
  });
});

describe("extractGpuName", () => {
  it("从真实 ANGLE 串里取显卡名", () => {
    expect(extractGpuName(REAL_GL_RENDERER)).toBe("AMD Radeon RX 580 2048SP");
  });

  it("厂商名与名字不重复时才拼接", () => {
    expect(extractGpuName("ANGLE (NVIDIA, GeForce GTX 1660 (0x00002184) Direct3D11, D3D11-1.2.3)")).toBe(
      "NVIDIA GeForce GTX 1660",
    );
  });

  it("软件渲染的串（不是 ANGLE）也能取个名字", () => {
    expect(extractGpuName("Google SwiftShader")).toBe("Google SwiftShader");
    expect(extractGpuName(null)).toBeNull();
    expect(extractGpuName("")).toBeNull();
  });
});
