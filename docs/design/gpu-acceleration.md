# GPU 加速：现状、日志与排查

**结论先说**：Electron 默认就开着硬件加速，本项目**没有关它、也不需要加开关**。
客户端每次启动会往 `<数据根>\logs\gpu.log` 记一行实际状态，网吧现场"界面发涩/滚动掉帧"时
先看这一行，就能判断是不是软件渲染引起的。

## 一、为什么会有这篇文档

2026-09 排查"图片显示不流畅"时，我在开发机上把 `app.getGPUFeatureStatus()` **在 GPU 初始化
完成之前**读了一次，拿到 `disabled_software`，差点得出"这台机器只能软件渲染、要加开关"的
错误结论。等 `gpu-info-update` 之后再读，真相是：

```
刚 ready                 +0ms     compositing=disabled_software   ← 读早了就是这个
等 gpu-info-update 之后   +228ms   compositing=enabled
最终                      +2741ms  compositing=enabled  raster=enabled  video_decode=enabled
glRenderer = ANGLE (AMD, AMD Radeon RX 580 2048SP, Direct3D11 vs_5_0 ps_5_0, D3D11-31.0.21925.1001)
```

现在这条日志就是防止再踩一次 —— 判读逻辑会把"状态还没定下来"和"确实是软件渲染"分开：
前者记"未知"不告警，后者才写明"软件渲染"并给出常见原因。

## 二、日志长什么样

`<数据根>\logs\gpu.log`（与崩溃日志、运行库日志同一个目录），每次启动追加一行：

```
[2026-09-14T06:20:00.151Z] 硬件加速=开  合成=enabled  光栅化=enabled  视频硬解=enabled  显卡=AMD Radeon RX 580 2048SP  图片硬解=无（Windows 上正常）
```

看到 `硬件加速=关 … 软件渲染` 时，按这个顺序查（都是现场可查的）：

1. **显卡驱动**装了没有、是不是"Microsoft 基本显示适配器"（`Get-CimInstance Win32_VideoController`）；
2. **显示器是不是挂在虚拟适配器上** —— 远程控制软件会装虚拟显示器（本机就有向日葵的
   `OrayIddDriver Device` 和 `AskLink Display Adapter`），Chromium 挑错适配器就没法用 D3D11；
3. **是不是在远程桌面会话里跑**（RDP 会话会强制软件渲染）。

## 三、图片和视频是两条路（别混）

| 能力 | 本机实测 | 说明 |
| --- | --- | --- |
| `video_decode` | **enabled** | 视频走 GPU 硬解（Chromium 媒体管线），视频播放吃这一条 |
| `jpegDecodeAcceleratorSupported` | **false** | **Windows 上图片没有硬解通路**，解码在 CPU |

所以"图片显示不流畅"不要往 GPU 开关上找原因 —— 要往"每张图的像素数/字节数"上找
（实测数据与对策见 [cover-images.md](./cover-images.md)）。

## 四、相关文件

| 文件 | 职责 |
| --- | --- |
| `electron/core/gpuStatus.ts` | **判读**（纯函数、有单测）：状态 → 一句人话；从 ANGLE 串里取显卡名 |
| `electron/core/gpuStatus.test.ts` | 单测：enabled / software / unknown 三种情形，以及真实 ANGLE 串的解析 |
| `electron/core/gpuReport.ts` | 读状态（等 `gpu-info-update`，2 秒兜底）+ 写 `<数据根>\logs\gpu.log` |
| `electron/main.ts` | 启动时 `void reportGpuStatus()`（不阻塞、失败只记日志） |

## 五、非目标

- **不加任何 GPU 命令行开关**：默认已是硬件加速，多余的 `--use-angle` / `--ignore-gpu-blocklist`
  只会引入驱动相关的副作用（本机实测这几组开关对状态没有任何改变）。
- 不做"检测到软件渲染就提示用户"：那是运维层面的事，写日志足够。
