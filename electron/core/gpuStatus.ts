// GPU 加速状态的"判读层"：把 Chromium 的原始状态判成一句人话 —— 这台机器到底有没有在用
// 硬件加速。不 import electron（可单测），读状态与落盘在 gpuReport.ts。
//
// 为什么值得专门记一条日志：
//   1) 2026-09 排查"图片显示不流畅"时，我在开发机上把 app.getGPUFeatureStatus() 在 GPU 还
//      没初始化完的时候读了一次，拿到 disabled_software，差点得出"这台机器只能软件渲染"的
//      结论 —— 真相是它一直用 ANGLE + D3D11 + 独显 RX 580（等 gpu-info-update 之后再读就是
//      enabled）。这个坑不写进注释，下一个人还会再踩一次。
//   2) 网吧机器上真出软件渲染时（显卡驱动没装、显示器挂在虚拟适配器上、远程桌面会话…），
//      症状是"界面发涩、滚动掉帧"，但现场没人会去翻 GPU 状态 —— 写进日志才能一眼确认。
//
// 注意"图片"与"视频"是两条不同的路（本机实测）：
//   video_decode = enabled        —— 视频走 GPU 硬解（Chromium 媒体管线）
//   jpegDecodeAcceleratorSupported = false —— Windows 上图片没有硬解通路，解码在 CPU
// 所以"图片不流畅"别往 GPU 开关上找原因，要往"每张图的像素数/字节数"上找。

/**
 * 我们真正用到的几个 GPU 特性字段（值形如 `enabled` / `disabled_software`）。
 * 为什么不写成 `Record<string, string>`：Electron 自己的 `GPUFeatureStatus` 类型没有索引签名，
 * 写成 Record 反而要求调用方强制断言一次 —— 窄结构类型可以直接接收它。
 */
export interface GpuFeatureStatusLike {
  gpu_compositing?: string;
  rasterization?: string;
  video_decode?: string;
}

export interface GpuVerdict {
  /** 是否真的在用硬件加速（合成 + 光栅化都是 enabled 才算）。 */
  accelerated: boolean;
  /** 是否值得运维关注（明确是软件渲染时为真）。 */
  warn: boolean;
  /** 一行结论，直接进日志。 */
  summary: string;
}

/**
 * 判读 GPU 状态。
 *
 * 只把**明确写着 software** 的状态当成"软件渲染/需要关注"；`unknown`（状态还没定下来）不算
 * —— 早读一次就报"你的机器没在用 GPU"是误报，正是上面记的那个坑。
 */
export function judgeGpuStatus(
  status: GpuFeatureStatusLike,
  opts: { glRenderer?: string | null; jpegDecodeAcceleratorSupported?: boolean } = {},
): GpuVerdict {
  const compositing = (status.gpu_compositing ?? "unknown").trim();
  const raster = (status.rasterization ?? "unknown").trim();
  const video = (status.video_decode ?? "unknown").trim();
  const software = /software/i.test(compositing) || /software/i.test(raster);
  const accelerated = compositing === "enabled" && raster === "enabled";
  const gpuName = extractGpuName(opts.glRenderer);

  const parts = [
    `硬件加速=${accelerated ? "开" : software ? "关" : "未知"}`,
    `合成=${compositing}`,
    `光栅化=${raster}`,
    `视频硬解=${video}`,
    `显卡=${gpuName ?? "(未识别)"}`,
    `图片硬解=${opts.jpegDecodeAcceleratorSupported ? "有" : "无（Windows 上正常）"}`,
  ];
  let summary = parts.join("  ");
  if (!accelerated && software) {
    summary +=
      "  ← 软件渲染，界面发涩/滚动掉帧的常见来源。常见原因：显卡驱动没装或太旧、" +
      "显示器挂在虚拟适配器上（远程控制软件）、或在远程桌面会话里跑。";
  } else if (!accelerated) {
    summary += "  ← 状态未知（GPU 信息还没定下来就读取了，正常启动流程不会这样）。";
  }
  return { accelerated, warn: software, summary };
}

/**
 * 从 ANGLE 的渲染器串里取显卡名。
 * 真实样例（本机）：
 *   ANGLE (AMD, AMD Radeon RX 580 2048SP (0x00006FDF) Direct3D11 vs_5_0 ps_5_0, D3D11-31.0.21925.1001)
 *   → `AMD Radeon RX 580 2048SP`（厂商名别重复：串里第一个 "AMD" 是厂商，名字里也带了 "AMD"）
 */
export function extractGpuName(glRenderer?: string | null): string | null {
  if (!glRenderer) return null;
  const m = /^ANGLE\s*\(([^,]+),\s*(.+?)\s*\(0x[0-9A-Fa-f]+\)/.exec(glRenderer.trim());
  if (m) {
    const vendor = m[1].trim();
    const name = m[2].trim();
    return name.toLowerCase().startsWith(vendor.toLowerCase()) ? name : `${vendor} ${name}`;
  }
  // 兜底：不是 ANGLE 串（比如软件渲染下是 "Google SwiftShader"），原样取第一段。
  return glRenderer.trim().split(/[,，(]/)[0]?.trim() || null;
}
