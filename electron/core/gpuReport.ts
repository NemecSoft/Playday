// GPU 状态的"读取 + 落盘"层：本文件 import electron，所以不参与单测（判读逻辑在 gpuStatus.ts，
// 那里有单测覆盖）。
//
// 写进 <数据根>\logs\gpu.log：网吧现场"界面发涩/滚动掉帧"时先看这个文件，就能知道这台机器
// 到底有没有在用硬件加速、用的是哪块卡 —— 不用再写临时探针去现场跑（我 2026-09 就是这么查的）。
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { configRoot } from "./paths";
import { judgeGpuStatus } from "./gpuStatus";

/**
 * 等 GPU 信息定下来的最长等待（毫秒）。
 * 实测本机 ~230ms 就绪；这里给 2 秒是兜底：`gpu-info-update` 可能在我们订阅之前就已经发过，
 * 那就只能等超时。**不能读太早** —— GPU 初始化未完成时状态是 disabled_software，会被误判成
 * "这台机器没在用 GPU"（这个坑见 gpuStatus.ts 的文件头）。
 */
const GPU_INFO_TIMEOUT_MS = 2000;

/** 启动时调用一次：等信息就绪 → 判读 → 追加一行日志。绝不抛错、绝不阻塞启动。 */
export async function reportGpuStatus(): Promise<void> {
  try {
    await waitForGpuInfo();
    const status = app.getGPUFeatureStatus();
    let glRenderer: string | null = null;
    let jpeg: boolean | undefined;
    try {
      // 必须用 "complete"：`getGPUInfo("basic")` 里**没有** glRenderer（显卡名就在那儿），
      // 只有 complete 才有（实测踩过：用 basic 时日志里显卡显示"未识别"）。
      // Electron 的返回类型是 `{}`（很宽松），这里断言成我们真正会读的那几项。
      const info = (await app.getGPUInfo("complete")) as {
        auxAttributes?: { glRenderer?: string; jpegDecodeAcceleratorSupported?: boolean };
      } | null;
      const aux = info?.auxAttributes;
      glRenderer = aux?.glRenderer ?? null;
      jpeg = aux?.jpegDecodeAcceleratorSupported;
    } catch {
      /* 拿不到细节就少报几项，判读照样给结论 */
    }
    const verdict = judgeGpuStatus(status, { glRenderer, jpegDecodeAcceleratorSupported: jpeg });
    console.log("[gpu]", verdict.summary);
    writeLine(`[${new Date().toISOString()}] ${verdict.summary}`);
  } catch (e) {
    // 记 GPU 状态失败绝不能影响启动。
    console.error("[gpu] 记录 GPU 状态失败:", e instanceof Error ? e.message : String(e));
  }
}

/** 等 `gpu-info-update`；事件已经发过时靠超时兜底。 */
function waitForGpuInfo(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    app.once("gpu-info-update", finish);
    const timer = setTimeout(finish, GPU_INFO_TIMEOUT_MS);
    timer.unref?.();
  });
}

/** 追加一行到 <数据根>/logs/gpu.log（写失败不影响流程）。 */
function writeLine(line: string): void {
  try {
    const dir = path.join(configRoot(), "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "gpu.log"), line + "\n", "utf-8");
  } catch {
    /* ignore */
  }
}
