# 封面图：体积、显示尺寸与规范化工具

回答两个问题：**封面大一点小一点影响有多大**，以及**怎么在不牺牲画面的前提下把体积降下来**。

## 一、封面是怎么被选中的

`shared/coverMatch.ts`：按游戏名归一化匹配封面目录里的文件；同名多个文件时按**格式优先级**
取一个：

```
APNG(png 且带 acTL) 100  >  webp 80  >  gif 60  >  jpg/jpeg 40  >  png 20  >  bmp 10
```

这条优先级是下面工具设计的依据：**在同目录放一个 `.jpg`（或 `.webp`），会自动顶掉原来的
`.png`，而原图可以留着随时回退。**

## 二、实测：现在的库有多大问题

`D:\YunGame\PlayNite\CoverImages`（2026-09 实测）：

```
1373 张 / 447.7 MB / 平均 334 KB
<200KB 34%   200-500KB 48%   0.5-1MB 15%   1-3MB 2.5%   >3MB 0
```

没有 5MB 级的怪物（用户之前担心的是这种情况，实际还没有）。真正浪费的是**同尺寸不同格式**：
抽样里 `800×450` 的 JPEG 只有 43KB，而另一张 `800×450` 的 PNG 要 501KB —— 11 倍，画面无差。

PNG 的透明情况（决定能不能转 JPEG）：

```
PNG 共 71 张：不透明 41 张（20.7 MB，可转 JPEG）  带透明 29 张（23.6 MB，只能留 PNG）
```

## 三、影响有多大（与 GPU 无关的那部分）

本地封面**不走 HTTP**，链路是 `read_images_batch` → **base64 过 IPC** → 渲染进程 `atob` →
`new Uint8Array` → Blob（`src/utils/assets.ts`）。实测真实文件：

| 文件 | 大小 | base64 | atob | 拷贝 | 合计（渲染主线程） |
| --- | --- | --- | --- | --- | --- |
| 三位一体4-联机版.jpeg | 1781 KB | 0.5ms | 1.1ms | 8.0ms | **9.5 ms** |
| 幽灵行动：荒野.jpg | 287 KB | 1.4ms | 0.6ms | 1.2ms | **3.1 ms** |

这段是纯 JS + 内存拷贝，**开不开硬件解码都一样**（`jpegDecodeAcceleratorSupported = false`，
Windows 上图片本来就没有硬解通路，见 [gpu-acceleration.md](./gpu-acceleration.md)）。
60Hz 一帧 16.7ms，一屏 5~6 张大图就是 50ms 量级 —— 懒加载 + `requestIdleCallback` 把开销打散了，
快速滚动时才露出来。**成本 ∝ 像素数**，与有没有 GPU 无关。

另外 `src/utils/assets.ts` 的 blob 缓存上限是**按张数**（`BLOB_LRU_CAP = 220`）而不是按字节：
图越大，最坏内存越不可控（平均 334KB ≈ 74MB，全 1.8MB 则 ≈ 400MB）。这是个已知隐患，见「非目标」。

## 四、工具：`dev-tools/cover-optimizer/`

零新依赖（Windows PowerShell 5.1 + GDI+，不需要 ImageMagick / sharp / node 库）。
2026-09-14 从「仓库根 bat + `scripts/` 下的 ps1」搬成 `tools/` 下自成一个目录（与
`dev-tools/yungamestart/`、`dev-tools/GameSaveHelper/` 同一套约定），用法细节见该目录的 README。

```bat
REM 1) AI 出的大图 → 直接产出能放进 CoverImages 的封面
dev-tools\cover-optimizer\optimize-covers.bat -Source "D:\ai-covers\2026-09" -OutDir "D:\YunGame\PlayNite\CoverImages"

REM 2) 给现有库瘦身：把过大的 PNG 转成同目录 JPEG（原图保留，删掉 jpg 即可回退）
dev-tools\cover-optimizer\optimize-covers.bat -Slim
```

规则：

| 规则 | 原因 |
| --- | --- |
| **只缩不放**（宽 > 1920 才缩到 1920） | 放大小图只会更糊更大；1920 覆盖了"封面滚到一行一张"的最大显示尺寸 |
| 有透明通道 → 保 PNG；否则 → JPEG q82 | 透明转 JPEG 会丢透明；q82 是"屏幕上与高质量原图看不出差别"的常用档 |
| 跳过动图（GIF / APNG） | 静态图会顶掉动图（jpg 40 低于 gif 60 不会，但 webp 80 会高于 gif 60）—— 保守起见一律不动动图 |
| `-Slim` 只处理 PNG | JPEG 已经是有损压缩，重编码既掉质量又省不了多少；PNG→JPEG 才是主要浪费 |

实测（真实封面放大成"AI 尺寸"再跑工具）：

```
[完成] 死或生6.jpg  5760x3240 -> 1920px   3,086 KB -> 392 KB  (省 87%)
画面一致性：源平均亮度 119.7  →  产物平均亮度 119.7（64×64 采样，完全一致）

[瘦身] 看门狗：军团.png   1500x843 -> 1500px  1,706 KB -> 233 KB  (省 86%)
[瘦身] 黑暗之魂3.png      1280x800 -> 1280px  1,581 KB -> 192 KB  (省 88%)
[跳过] 植物大战僵尸：幼儿园版.png  有透明通道、只能存 PNG，不改原图
```

## 五、相关文件

| 文件 | 职责 |
| --- | --- |
| `dev-tools/cover-optimizer/optimize-covers.bat` | 双击/命令行入口（纯 ASCII；写死 Windows PowerShell 5.1 绝对路径 —— `System.Drawing` 在 PowerShell 7 里不可用） |
| `dev-tools/cover-optimizer/optimize-covers.ps1` | 实现（**必须 UTF-8 with BOM**，否则 5.1 按 ANSI 解析中文会乱码，同 `tools/GameSaveHelper/tools/Build-GameSave.ps1` 的约定）。找仓库根靠"向上找 `path-modes.json`"，不依赖目录深度 |
| `dev-tools/cover-optimizer/README.md` | 这个工具的用法/规则/两个坑 |
| `shared/coverMatch.ts` | 封面匹配与格式优先级（唯一来源） |
| `electron/core/db.ts` → `game_level` / `cover_image` | 封面不入库，运行期扫描目录按名字匹配 |

## 六、性能：滚动为什么"卡一下"，以及 2026-09 的修复

用户反馈："主界面滚动、显示图片，中间停顿太明显。"排查后是两个真问题（都实测过）：

**1. 主进程的图片缓存只增不减，而且存的是 base64 字符串**

`electron/ipc/covers.ts` 里的 `imageCache` 原来是个裸 Map（只有手动的 `clear_image_cache` 清，
平时没人调）。实测：读 300 张（原始 102MB）后 RSS 从 34MB 涨到 **182MB**；按比例滚完整个库
（1369 张）≈ **675MB 常驻**。大堆的代价是主 GC 停顿 —— 表现就是"滚动中间明显卡一下"。

→ 改为 `electron/core/imageCache.ts`：**按总字节数 96MB 封顶的 LRU**（纯逻辑 + 6 条单测）。
实测读 504 张 → 800 张时 RSS **不再增长**（249.9MB → 223.4MB），而旧实现会继续线性上涨。

**2. base64 过 IPC 太贵**

渲染进程拿到 base64 后要 `atob` + 逐字节 `charCodeAt` 填数组（`src/utils/assets.ts`）。
桌面端其实可以直接传二进制：`Buffer` 经结构化克隆到渲染进程就是 `Uint8Array`。
（网站端仍保持 base64 —— HTTP JSON 传不了二进制，见 `server/server.mjs`，所以 `payloadToBytes()`
两种形态都要容。）

实测渲染进程落地成本（含 IPC 反序列化，6 轮取中位数、丢弃首轮冷启动）：

| 文件 | base64（旧） | 二进制（新） | 提速 |
| --- | --- | --- | --- |
| 1920×1080 JPEG 414 KB | 4.1 ms | 0.5 ms | 8.2× |
| 1920×1080 PNG 4408 KB | 43.1 ms | 2.7 ms | 16.0× |
| 1500×843 PNG 1706 KB | 19.9 ms | 1.5 ms | 13.3× |

→ 滚动时每张图落在渲染主线程上的成本，从"几毫秒到几十毫秒"降到 **0.5–2.8 ms**。
端到端验证：真实 IPC 返回 `[object Uint8Array]`（不再是字符串）。

**3. 延迟上界与排队顺序（2026-09-14，用户报"图片要 3 秒才出来"）**

先把链路量清楚（真机、真实文件、真实 IPC）：

| 测量 | 结果 |
| --- | --- |
| 一屏 30 张封面：fetch → Blob → `img.onload` | 冷读 **133ms**、热读 82ms（并发 3）；并发 8 时 79ms |
| `requestIdleCallback` 在"每帧忙 14ms"的页面里的实际触发 | **17ms**（空闲页面 0ms）—— 不是它被饿到超时 |
| 前面排 100 条"已滚过去"的请求时，当前视野那 6 张要等多久 | FIFO+并发 3：**208ms**；后进先出+并发 6：**19ms** |

结论：**读图/解码链路本身很快（一屏 100ms 量级）**，3 秒来自两处**延迟上界**与队列顺序：

1. `useLazyImage` 用 `requestIdleCallback(run, { timeout: 1500 })` 才**开始**取图，
   `decodeBlob` 又用 `requestIdleCallback(run, { timeout: 900 })` 才解码 —— 两段上界相加
   **2.4s**，与用户看到的"3 秒"吻合。
   **已确认为主因**：改完之后用户回报"现在就很快啦"（2026-09-14）。
   注意合成测试（每帧忙 14ms）没能复现它被饿到超时 —— 说明现场主线程的繁忙形态
   （滚动 + React 重渲染 + 并发解码叠在一起）才是关键，别用"我本地测 idle 很快"来否定这条。
2. 单图队列是 FIFO：滚动时它服务的是"已经滚过去"的行，**当前视野里的图排在队尾**。

改法（三处，都很小）：**去掉两层 idle 推迟**（要"让路"时用 `suspendImageLoading()`，那是确定的、
可恢复的）；**并发 3 → 6**；**队列 FIFO → 后进先出**（最近滚到的那批优先）。批量预载那条路仍会
每张之间让出一**帧**（`setTimeout(0)`），只是不再"等到空闲"。

## 七、非目标 / 待办

1. **JPEG 重编码未做**：库里还有 34 个 1–3MB 的 JPEG（源图本就 ≤1920，省的是 q95→q82 那部分，
   约能省 40–50 MB）。做它需要**覆盖原图**（先备份），比 PNG 转换风险高，所以单独评估。
2. **blob 缓存上限仍是"按张数"**：改成按字节（例如 256MB）是独立的小改动。
3. **不做 WebP**：GDI+ 不能编码 WebP；要转 WebP 得引第三方工具或走 Chromium 的 canvas 编码。
   JPEG q82 已经能把 3MB 降到 400KB，"看起来一样"这个目标已经达成。
4. ~~`preloadImages()` 每个路径被加载了两遍~~ —— **已修（2026-09-14）**。
   `loadBatch` 里那行 `inflight.set(p, loadOne(p))` 本意是"登记在飞"，实际是**真的又取了一遍**
   （同一张图被单图 IPC + 批量 IPC 各读一次，预载的耗时/IPC 流量/内存全翻倍）。
   现在只登记占位 promise、不另起请求，并加了回归测试
   （`src/utils/__tests__/assets.test.ts`：断言预载期间**单图 IPC 一次都没被调用** ——
   把旧代码装回去跑，这条测试确实会失败，守卫有效）。
   不变式同时收到 `loadBatch` 自己身上：**同一张图、同一时刻只有一条读取在飞** ——
   批量开始前先挑出"已经有人读过 / 正在读"的路径（卡片抢在预载前面的情况），只读剩下的。
   ⚠️ 挑的时机必须在"登记占位"**之前**：反过来会把刚登记的占位当成"有人在读"，整批被跳过
   （这个顺序错写完就被单测抓到，已固化成用例）。
5. **预加载一批 24 张仍是连着解码**：二进制后约 12–67ms；现在每张之间让出**一帧**
   （`setTimeout(0)`），不再是"等到空闲"（那个延迟不确定，最多可到 timeout）。
   想再进一步可做成"每帧只用 X 毫秒、剩下的下一帧继续"的解码预算；滚动路径不受影响（一张一取）。
