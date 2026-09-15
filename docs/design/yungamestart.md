# YunGameStart：开机自启、判定黄金版/钻石版并建桌面快捷方式

> 需求原话：*"还有实现一个 `YunGameTools\YunGameStart\YunGameStart`，这个是开机启动。核心逻辑就 1 个：
> 解密 userlist，获取当前电脑的外网 ip，比对是黄金版还是钻石版，并自动创建图标，黄金版用 1.ico、
> 钻石版用 2.ico。我们用一个 c++ 来实现吧。编译放入路径是 `yungame/playnite/yungamestart/yungamestart.exe`。
> 同样的，路径寻找，可以用 config.json。"*

一句话：**原 WPF 程序 `YunGameTools/YunGameStart` 的等价 C++ 重写** —— 无窗口、开机不打扰，
判定本机等级后在桌面放一个对应版本的快捷方式（黄金版 `1.ico` / 钻石版 `2.ico`）。

## 一、为什么重写

| 原因 | 说明 |
| --- | --- |
| 无感 | 原版是 WPF 程序，靠"窗口高宽都设成 0"来隐藏 —— 有 UI 就有 UI 的代价（启动慢、可能闪现、需要 .NET 运行时）。C++ 版是纯 Win32，GUI 子系统（`-mwindows`），**根本没有窗口** |
| 自包含 | 只链系统库（WinHTTP 取 IP、IShellLink 建快捷方式），静态链接 → 单文件 exe，目标机不需要装任何运行时 |
| 依赖更少 | 原版 `bin/` 目录 605 个 DLL；新版一个 exe + 两个图标 |

## 二、核心链路（与原版逐条对应）

```
1. 找路径      ← config.json（用户表 / 游戏根），读不到则按原版回退 X: → D:
2. 取外网 IP   ← 三个服务轮流试，每个重试 2 次、5 秒超时、校验 IPv4
3. 读用户表    ← 明文或原版 JsonCrypt 密文都吃（base64 + XOR "yungameplaynite"）
4. 比对等级    ← 按 IP 命中取 UserLevel；未命中 = 黄金版
5. 建快捷方式  ← 黄金版 1.ico / 钻石版 2.ico，目标 <游戏根>\PlayniteUI.exe
```

| 环节 | 细节（都与原版一致） |
| --- | --- |
| IP 服务 | `https://ipv4.icanhazip.com` → `https://v4.ident.me` → `https://ipinfo.io/ip` |
| 加密 | 原版 JsonCrypt 的固定密钥 `yungameplaynite`（与 `shared/userLevel.ts`、`scripts/encrypt-userlist.mjs` 同一套） |
| 快捷方式名 | `YunGame  黄金版.lnk` / `YunGame  钻石版.lnk`（原文就是两个空格；沿用老名字，老用户不觉得换了东西） |
| 快捷方式内容 | 目标 = `<游戏根>\PlayniteUI.exe`，工作目录 = 游戏根，图标 = 本 exe 同目录的 `1.ico` / `2.ico` |

## 三、三处**有意**与原版不同（都是安全/正确性考虑）

1. **等级判定按客户端的权威规则**：只有 `UserLevel == 2` 才算钻石，其余（1、脏值 3、未命中）都是黄金。
   原版是"≠1 就钻石"，等级 3 会被它当成钻石版。
2. **外网 IP 取不到时不动桌面**（退出码 2）。原版会当作黄金版继续建快捷方式 ——
   在"本来是钻石版、只是开机时网络还没起来"的机器上，那会把钻石版快捷方式删掉换成黄金版，属于降级事故。
   宁可不动：保持现状，日志里写清原因，网维重跑一次即可。
3. **建完当前等级后，删掉另一个等级的 `.lnk`**。原版只建当前那个，等级变化（黄金→钻石）后桌面上会
   同时留着两个，其中一个的图标和名字必然是错的。

## 四、路径从哪来

优先级（`--config` 可覆盖第一项）：

| 顺序 | 位置 | 取什么 |
| --- | --- | --- |
| 1 | `--config <文件>` | 命令行指定 |
| 2 | `<exe 上级目录>\config.json` | 常规部署（见下面的布局） |
| 3 | `<exe 同目录>\config.json` | exe 与客户端同级的临时摆法 |

从 config.json 读**两个**字段（都是既有字段，不新增）：

- `settings.yunGameUserListPath` → 用户表（生产环境里它是**绝对路径**，正式 X 盘 / 测试 D 盘各一份，
  所以这里必须跟着 config.json 走，不能写死）
- `settings.defaultGameRootPath` → 游戏根，也就是客户端 exe 所在目录、快捷方式的目标目录

读不到时的兜底（与原版 appsettings 的 `MainPath.Primary/Fallback` 对应）：
用户表 → `X:\YunGame\PlayNite\YunGameConfig\YunGame_UserList.json` → `D:\...`（同路径）；
游戏根 → `<exe 上级目录>`（`yungamestart\` 的上一级就是客户端目录）。

### 部署布局

```
<YunGame>\Playnite\                 ← release\ 里的内容整包拷过来
├── PlayniteUI.exe                  ← 客户端（build.config.ts 的 CLIENT_EXE_NAME）
├── config.json
├── data\
└── yungamestart\                   ← 需求里的 yungame/playnite/yungamestart/
    ├── yungamestart.exe
    ├── 1.ico                       ← 黄金版快捷方式图标
    ├── 2.ico                       ← 钻石版快捷方式图标
    └── yungamestart.log            ← 运行时生成（超过 512KB 自动滚动成 .old）
```

> 这个目录的绝对位置也记在 `config.json` → `settings.yungamestartDir`（由 `path-modes.json` 定：
> 正式机 `X:/YunGame/Playnite/yungamestart`、测试机 `D:/YunGame/Playnite/yungamestart`、开发态
> `tools/yungamestart` —— 那份是编译源头）。目前**没有代码消费者**：工具由用户自己开机启动（见下），
> 记下来是为了让"工具在哪"能从配置里读出来（运维脚本可以直接读 config.json；将来要在客户端里
> 拉起它时也不必再找路径）。读写入口见 `electron/core/paths.ts` 的 `yungamestartDir()`。

**开机自启由用户自己设置**（与原版 readme 第 0 条一致）：把 `yungamestart.exe` 的快捷方式丢进
`shell:startup`，或用计划任务。程序**不会**自己去改注册表/启动项。

## 五、命令行（默认不带参数就是开机自启要的行为）

| 参数 | 作用 |
| --- | --- |
| 无 | 静默跑完：判定等级 + 建/更新桌面快捷方式，只写日志 |
| `-d` / `--debug` | 附带一个控制台显示每一步（原版也有 `-d`）；若控制台是它自己开的，结束前等一次按键 |
| `-n` / `--dry-run` | 只算不写：不动桌面（排障：先看会判定成什么） |
| `--config <文件>` | 指定 config.json |
| `--lnk-dir <目录>` | 快捷方式写到别的目录（排障；默认是当前用户桌面） |
| `--ip <地址>` | 跳过 IP 探测（排障：模拟某门店的机器） |

退出码：`0` 成功 / `1` 致命错误（拿不到目录、写 .lnk 失败）/ `2` 外网 IP 取不到（跳过，未动桌面）/
`3` 用户表读不出或解不开（跳过，未动桌面）。

## 六、图标（1.ico / 2.ico）

桌面快捷方式的图标：**黄金版用 `1.ico`、钻石版用 `2.ico`**（`main.cpp` 按等级选，文件缺了就退回启动器自身图标）。
两个图标是**同一个手柄剪影 + 两套渐变**：1 = 红→橙→金（黄金版）、2 = 洋红→紫→青（钻石版）。
形状完全一致、只有颜色不同 —— 用户一眼分得出自己是什么版本，又不觉得是两个不相干的东西。

### 6.1 怎么重新生成（2026-09-16 加深过一版）

```bat
cd tools\yungamestart\assets
node make-icons.mjs                :: 重生成两个 ico（原文件自动备份成 *.bak-<日期>）
node make-icons.mjs --dry          :: 只算不写：看色标变成什么、文件会多大
node make-icons.mjs --list         :: 列出当前 ico 里有哪些帧（查看用）
node make-icons.mjs --saturate 1.7 --darken 0.8   :: 想更艳 / 更深就调这两个旋钮
```

默认参数（= 2026-09-16 那版"加深"用的）：**提饱和 ×1.5、压亮度 ×0.86**。

> ⚠️ **但当前仓库里这两张图是原版**（= `release\yungamestart\1.ico` / `2.ico`，303785 / 303480 字节，
> ≤192 全 DIB + 256 PNG）。2026-09-16 先做过一版"加深"，随后用户拍板**先用原版、先不动**，资产已回退。
> 所以：**上面那条命令（默认参数）会生成"加深版"并覆盖原图**。要复原就从 `release\yungamestart\`
> 或同目录的 `*.bak-20260916` 拷回来（三处内容一致，可直接用哈希核对）。

### 6.2 做法与理由

| 决定 | 为什么 |
| --- | --- |
| **保留剪影与白色按键**，只换渐变 | 剪影取自原图的 alpha（一个像素都没动）；用户认的就是这个形状，重画风险大、收益零 |
| 逐像素**重画渐变**，而不是"整图过一遍滤镜" | 滤镜（saturate / contrast）只能把浅黄变成**鲜**黄，变不成**深**金 —— "深度"要的是压亮度。两版都做出来比对过，滤镜版右端仍是亮黄 |
| 色标从原图**采样**（对角线 6 个点）再在 HSL 上改 | 不动色相顺序，只加深加艳；每次跑都把"原色 → 新色"打出来，可核对 |
| 用 Electron 当画布（`make-icons-canvas.cjs`） | 解码 ico 内嵌 PNG、高质量缩放、`getImageData` —— node 没有现成能力，而项目零原生依赖（不为一个图标引 sharp）。**只用于开发，不进包** |
| 9 帧：**≤48 封 DIB、≥64 封 PNG** | 小尺寸那几帧走最老的 shell 代码路径，DIB 最保险；大尺寸用 PNG 省体积（原文件 ≤192 全 DIB + 256 PNG = 303KB，新文件 52KB） |

**验证方式**（图形文件不像代码，看一眼不能算数）：`--list` 看帧结构，再用 **Windows 自己的图标加载器**渲染出来看：

```powershell
Add-Type -AssemblyName System.Drawing
$i = New-Object System.Drawing.Icon("assets\1.ico", 48, 48)
$i.ToBitmap().Save("out.png", [System.Drawing.Imaging.ImageFormat]::Png)
```

2026-09-16 实测：16 / 32 / 48 三帧（都走 **DIB**）被 Windows 正确解出（形状、朝向、透明均正确），
小尺寸帧的字节数（1128 / 2440 / 4264 / 9640）与原文件**完全一致** —— 说明封装方式与当年生成它的工具一致。

> ⚠️ 一个已知现象：`System.Drawing.Icon` 请求 256 时给出的是 **192**（这个老 API 不认目录里
> "宽高写 0 = 256"的帧）。那是 .NET 的毛病，不是文件的问题 —— Explorer 与 `--list` 都正常看到 256 那帧。

## 七、编译与出包

```bash
tools\yungamestart\build.bat        # 用 MinGW g++ 编译 → dist\yungamestart.exe（+ 1.ico / 2.ico）
build-prerelease.bat / build-release.bat
```

`package.bat` 在**清空输出目录之后**把 `tools\yungamestart\dist\*` 复制成
`<包>\yungamestart\`（顺序很重要：输出目录每次打包都会被清空）。没有编译过不是错误 ——
只是包里的 `yungamestart\` 不存在，并打印一行提示。所以顺序是：
**先 `build.bat`，再出包**。

编译命令的取舍（`tools/yungamestart/build.bat`）：`-mwindows`（无窗口）、
`-static -static-libgcc -static-libstdc++`（目标机不需要 MinGW 运行时）、
`-finput-charset=UTF-8 -fexec-charset=UTF-8`（源码含中文）。

## 八、实测记录（2026-09-14）

| 用例 | 结果 |
| --- | --- |
| 真机 dry-run（`-n --config <仓库>\config.json`） | 取到外网 IP `110.167.93.100` → 用户表 117 条无命中 → 黄金版，未动桌面 ✓ |
| `--ip 125.72.52.124`（钻石门店「竞界超级电竞馆」） | 命中 → 等级 2 → 建 `YunGame  钻石版.lnk`，图标 `2.ico,0`，工作目录 `<游戏根>` ✓ |
| 紧接着 `--ip 125.72.52.123`（黄金门店「雷神电竞」） | 建 `YunGame  黄金版.lnk` 并**删掉**上一条钻石版 ✓ |

## 九、相关文件

| 文件 | 职责 |
| --- | --- |
| `tools/yungamestart/src/main.cpp` | 主流程：路径 → IP → 用户表 → 等级 → 快捷方式 |
| `tools/yungamestart/src/util.h` | 宽窄字符串、路径、日志（文件 + 控制台）、base64/XOR、IPv4 校验 |
| `tools/yungamestart/src/json_lite.h` | 极简 JSON 扫描（只为我们需要的几个字段，不引第三方库） |
| `tools/yungamestart/src/http.h` | WinHTTP GET（跟随重定向、超时、UA） |
| `tools/yungamestart/src/shortcut.h` | IShellLink 建快捷方式 + 删"另一个等级"的快捷方式 |
| `tools/yungamestart/build.bat` | 编译并暂存到 `dist\` |
| `tools/yungamestart/assets/1.ico`、`2.ico` | 两个快捷方式图标（黄金 / 钻石），随包分发。**当前是原版那份图**（用户 2026-09-16 拍板先用原版、先不动）；同目录的 `make-icons.mjs` 默认参数会产出"加深版"，跑之前先看 §六.1 的警告 |
| `tools/yungamestart/assets/make-icons.mjs` | 图标的**生成工具**：拆 ico 取源图 → 调画布 → 封 9 帧（≤48 DIB / ≥64 PNG）→ 备份原文件（见 §六） |
| `tools/yungamestart/assets/make-icons-canvas.cjs` + `.html` | 上面那个工具的**画布半边**（Electron 里做像素活：换渐变、缩放、导出），开发用，不进包 |
| `shared/userLevel.ts` | **等级判定的权威实现**（客户端侧），C++ 里按同一规则重写 |
| `scripts/encrypt-userlist.mjs` | 用户表加密（同一个密钥/算法） |

> ⚠️ C++ 里的 `kLauncherExe = PlayniteUI.exe` 与 `build.config.ts` 的 `CLIENT_EXE_NAME`
> 是**两处**写死的同一个名字（C++ 读不到 TS）。改名时两边一起改，否则快捷方式会指向不存在的 exe。
