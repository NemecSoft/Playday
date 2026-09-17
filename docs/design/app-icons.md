# 应用图标与托盘图标

> 2026-09-16：系统图标换成"黄金 + 钻石两套最深色"的渐变；**同日需求变更**：应用图标与托盘图标
> **按当前用户等级分** —— 黄金版用 `1.ico`、钻石版用 `2.ico`，那两个图标作为资源随包发出。
> 桌面快捷方式也用那两个图标（YunGameStart 建的 .lnk），见 [yungamestart.md §六](./yungamestart.md)。

## 1. 有哪些、用在哪

| 图标 | 文件 | 谁在找它 |
| --- | --- | --- |
| 应用图标（窗口 / 任务栏） | **按等级**：`1.ico`（黄金） / `2.ico`（钻石） | `electron/core/appIcon.ts::currentLevelIconPath()`，被 `electron/windows.ts::appIconPath()` 调用 |
| 托盘 | 同上（**同一份文件**）→ 兜底 `public/icons/tray.ico` → `tray.png` | `electron/core/tray.ts::loadTrayIcon()` |
| exe 自身图标 | `public/icons/icon.ico`（**静态** —— 一个 exe 没法按等级变） | `electron-builder.yml` 的 `win.icon`（多尺寸 ico 直接嵌进 exe） |
| 浏览器标签页 | `public/icons/icon.png`（静态） | `index.html` 的 `<link rel="icon">`（favicon 用 PNG 就够，浏览器自己缩放） |

**为什么 .ico 优先**：ico 是**多尺寸容器**。但这里要分两种情况（2026-09-16 实测，别混为一谈）：

| 场景 | 多尺寸有用吗 | 说明 |
| --- | --- | --- |
| **嵌进 exe**（`win.icon`，打包时写进 exe 资源） | ✅ **有用** | 资源管理器按视图大小直接取 16/32/256 对应那一帧 |
| **运行期**（窗口 / 托盘，走 `nativeImage.createFromPath()`） | ❌ **会被压平** | 实测：四个 .ico 读出来**都是 256×256** —— Electron 只取最大那一帧，多尺寸没了 |

所以运行期那条路实际是"递给 shell 一张 256 的图，由 Windows 按当前 DPI 缩到 16/20/24/32"。
⚠️ 因此**别**再主动 `resize()` 到 16（125%/150% 缩放下系统要放大 16 的图，一定糊）——
tray.ts 里那条"ico 不 resize"的注释就是这个原因。
真在某台机器上嫌托盘糊，正确做法是预渲 16/24/32 三张、用 `nativeImage.addRepresentation({ scaleFactor })`
拼成一张多倍率图交给托盘（需要时再做，目前没做）。

## 1.1 按等级切换（2026-09-16 需求变更）

> "如果用户是黄金版用 1.ico，如果是钻石版用 2.ico，并且把这 2 个图标作为资源。"

| 环节 | 做法 |
| --- | --- |
| 判据 | `shared/userLevel.ts::iconNameForLevel(level)` —— 与 `canPlay` 同口径：**≥2 算钻石**（3 = 全解锁也归这档），脏值/缺值按黄金。有单测（`shared/userLevel.test.ts`） |
| 谁执行 | `electron/core/appIcon.ts::refreshAppIcons()`：给**所有窗口** `setIcon()` + 给托盘 `setImage()` |
| 什么时候 | ① 启动时（用上次落库的 `settings.currentUserLevel`，首帧就是对的）；② 每条"把等级写进 settings"的命令之后 —— `get_current_user` / `resolve_enterprise` / `login_personal` / `logout`（都在 `electron/ipc/auth.ts`） |
| 为什么必须运行期刷新 | 等级是**开机后才判出来**的（读用户表按公网 IP 命中），个人会话登录/退登还会再变。启动时定死会出现"钻石门店顶着黄金图标" |
| 资源从哪来 | 源文件只有一处：`dev-tools/yungamestart/assets/1.ico`、`2.ico`（make-icons.mjs 生成，同时也是快捷方式图标）。`electron-builder.yml` 的 `extraResources` 把它俩发到 `resources/` 下；dev 则直接读仓库路径 —— 两条候选路径都在 `appIcon.ts` 里 |
| 兜底 | 等级图标找不到 → 退 `1.ico`；再找不到 → 返回 null，窗口/托盘各自回落到 `tray.ico`/`tray.png`/`icon.ico`，不崩 |

**⚠️ 漏了会怎样**：某条命令忘了调 `refreshAppIcons()` 不会报错，表现只是"这台机器图标不对"
（比如退登后图标还留着钻石版）。所以 `electron/ipc/auth.ts` 文件头写了这条约定。

**托盘的一个坑**（已在 tray.ts 注明）：`.ico` **不要** `resize()` —— 那段代码原本是给 PNG 准备的，
对多尺寸 ico 压成单张 16 等于把 20/24/32 那几档白扔。

## 2. 矢量源与配色

`public/icons/icon.svg` 是**唯一的手柄形状来源**，它是 `playnite.svg` 的副本 ——
两个文件**只差 4 行 `<stop>`**，那条 path（含挖空的十字键与按键）与渐变方向完全一致：

| 文件 | 渐变 | 对应 |
| --- | --- | --- |
| `playnite.svg` | `#FF1658 → #FF612E → #FF9D0D → #FFB400` | 红→金，即 `1.ico`（黄金版快捷方式）那套 |
| `icon.svg` | `#DB9B00 → #EE0042 → #AA0094 → #930BB0` | 金→深红→洋红→深紫（**当前系统图标**） |

⚠️ **`playnite.svg` 别动**：它是快捷方式图标那条出图链路的源
（`make-icons.mjs` 需要"原图里有颜色可采样"）。要改系统图标配色改 `icon.svg`。

### 2.1 这四个颜色怎么来的（2026-09-16 需求："用 1、2 最深的颜色做渐变"）

取两个快捷方式图标的关键色：黄金版最深的 `#DB9B00`（深金）与钻石版最深的
`#930BB0`（深紫），一个图标里同时代表两个版本。

> ⚠️ 这四个色是从那两个图标的**"加深版"**上取的关键色；而那两个图标后来按用户决定
> **回退成原版**了（`dev-tools/yungamestart/assets/*.ico` = `release/yungamestart/` 那份，
> 见 [yungamestart.md §六.1](./yungamestart.md)）。**系统图标沿用这四个色、没有跟着回退** ——
> 两者是各自独立的资产，别因为"1/2.ico 回到原版"就把 `icon.svg` 也改回去。

**中间那两站（`#EE0042` 深红 / `#AA0094` 深洋红）不是凑数**：金 → 紫在 sRGB 上直连，
中段会掉进棕/酱紫（饱和度塌下去，看着发浑）—— 两版都渲染出来比过。补上红/洋红两站之后，
整条渐变是"暖 → 冷"连续过渡，没有浑段。

> 顺带：挖空的那几个按键是**透明**的（不是白色）—— 所以图标落在浅色背景上是白圈、
> 落在深色壁纸上就透出壁纸颜色。这是原图的画法，两个 SVG 都如此，别"顺手补白"。

## 3. 出图（一条命令）

```bat
:: 仓库根目录执行；四个产物一次全出
node_modules\electron\dist\electron.exe public\icons\render-icon.cjs
:: 只重出其中一个
... render-icon.cjs --target icon
... render-icon.cjs --target tray
```

| 产物 | 尺寸（帧） | 说明 |
| --- | --- | --- |
| `icon.png` | 512×512 | favicon + PNG 回退路径 |
| `icon.ico` | 16, 24, 32, 48, 64, 128, 256 | 应用图标；256 那帧是资源管理器"超大图标"看的 |
| `tray.png` | 16×16 | 托盘回退（旧路径） |
| `tray.ico` | 16, 20, 24, 32, 48, 64 | 托盘兜底。⚠️ 运行期那些档**用不上**（见上面第 1 节的实测：Electron 只取最大帧）；留着是为了将来真要用 `addRepresentation` 做多倍率托盘图时不用重渲 |

- 渲染用 **Electron 的 canvas**（SVG → 任意尺寸都清晰）：node 没有 SVG 渲染器，
  项目也零原生依赖（不为出图引 sharp）。**这个脚本只用于开发出图，不进包。**
- 帧的封装：**≤48 用 DIB、≥64 用 PNG**（`scripts/lib/ico.cjs`，与快捷方式图标共用同一份实现）。
  DIB 是老式位图帧，最老的那批 shell 代码路径只认它；大尺寸用 PNG 省体积。
- ⚠️ 改配色的**唯一正确做法**是改 `icon.svg` 的 4 行 `<stop>` 再重跑渲染 ——
  **别手改 PNG/ICO**，下次出图就被覆盖了。

## 4. 怎么验证（图形文件不能靠"看着像"）

1. **帧结构**：`node dev-tools\yungamestart\assets\make-icons.mjs --list` 那套是给快捷方式图标的；
   看 `public/icons/*.ico` 可以用同一份 `scripts/lib/ico.cjs` 的 `parseIco` 列一列（帧数/尺寸/编码）。
2. **真 Windows 加载器**（最有说服力 —— 走的正是 Explorer 那套解码）：

   ```powershell
   Add-Type -AssemblyName System.Drawing
   $i = New-Object System.Drawing.Icon("public\icons\icon.ico", 48, 48)
   $i.ToBitmap().Save("out.png", [System.Drawing.Imaging.ImageFormat]::Png)
   ```

   2026-09-16 实测：`icon.ico` 与 `tray.ico` 的 16 / 32 / 48 三帧都被正确解出
   （形状、渐变方向、透明都对）。
   > 已知现象：`System.Drawing.Icon` 请求 256 时给的是 **192**（这个老 API 不认目录里
   > "宽高写 0 = 256"的帧）。那是 .NET 的毛病，不是文件的问题。

3. 渲染时脚本自己会打印中心色与角上透明度（角上必须是 `0,0,0,0`），可以当快速的健全性检查。

## 5. 换配色的三步

1. 改 `public/icons/icon.svg` 里那 4 行 `stop-color`（比例也一起调，别只改颜色）；
2. 跑一遍第 3 节那条命令；
3. 用第 4 节第 2 条渲染出来看一眼（尤其 16 与 32 —— 那两档最容易糊成一团）。

## 6. 落点

| 文件 | 职责 |
| --- | --- |
| `public/icons/icon.svg` | **系统图标的矢量源**（手柄形状 + 当前渐变） |
| `public/icons/playnite.svg` | 手柄图的原始矢量（红→金那套，快捷方式图标链路的源，别动） |
| `public/icons/render-icon.cjs` + `.html` | 出图工具：SVG → `icon.png` / `icon.ico` / `tray.png` / `tray.ico`（开发用，不进包） |
| `scripts/lib/ico.cjs` | ICO 容器（拆帧 / 封 DIB / 封 PNG 帧），两个出图工具共用 |
| `shared/userLevel.ts` | `iconNameForLevel(level)`：等级 → 图标文件名（与 `canPlay` 同口径，有单测） |
| `electron/core/appIcon.ts` | **图标中枢**：按等级解析路径（dev / `resources/` 两种形态）、`refreshAppIcons()` 给所有窗口 + 托盘换图。托盘那边靠注册回调接入，避免与 tray.ts 循环依赖 |
| `electron/windows.ts` | 窗口 / 任务栏图标：构造时给初值（`appIconPath()` → `currentLevelIconPath()`） |
| `electron/core/tray.ts` | 托盘图标：**优先等级图标**，兜底 `tray.ico` → `tray.png`（⚠️ **ico 不做 resize**，见那里的注释） |
| `electron/ipc/auth.ts` | 每条"写 currentUserLevel"的命令之后调 `refreshAppIcons()`（文件头写了这条约定） |
| `electron/main.ts` | 启动时先按上次落库的等级刷一遍（窗口 + 托盘） |
| `electron-builder.yml` | `win.icon`（嵌进 exe）+ `extraResources`：`1.ico`/`2.ico`（等级图标，客户端运行期要读）+ `tray.*`/`icon.*`（通用/兜底） |
| `index.html` | favicon → `icon.png` |
| ~~`scripts/gen-tray-icon.mjs`~~ | **已废弃**：旧的那个蓝方块托盘图标生成器。加了 `--force` 闸门，不加参数跑会被拒绝，免得把 `tray.png` 覆盖回旧图标 |
