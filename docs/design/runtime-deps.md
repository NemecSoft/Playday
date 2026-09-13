# 运行库依赖的静默检测与安装

客户端启动时，**后台**检查三样运行库是否已在系统里，缺哪个装哪个：VC++ 运行库（x64 / x86）与
VP9 视频解码扩展。装不上不打扰用户，只写日志。

- 规则层（判据、安装参数、脚本内容）：`electron/core/runtimeDeps.ts`（纯函数，有单测）
- 执行层（找文件、起进程、写日志）：`electron/core/runtimeSetup.ts`
- 安装包本体：`tools/runtime/`（打包时用 `extraResources` 带到 `resources/runtime/`）

## 一、三条硬要求

需求原话是"**不要影响咱的应用的启动**"。落到代码里是三条：

| 要求 | 怎么落的 |
| --- | --- |
| 不阻塞启动 | `ensureRuntimeDeps()` 同步立刻返回，全程异步；而且**刻意延后 5 秒**才开始（`START_DELAY_MS`），避开"窗口创建 + 首次渲染"那一下的资源竞争 |
| 不弹任何窗口 | 静默安装参数 + `windowsHide` + **非管理员时干脆不试**（否则 VC 运行库的安装器会弹 UAC） |
| 不重启系统 | `/norestart`。网吧机器被安装器重启是事故 |

另外：安装器进程 `detached` + `unref()`，所以**我们退出它不会被带走**（网吧里客户端被关掉，
安装照样跑完）；反过来它也**不会拖住我们退出**。

失败只写日志 —— 运行库缺失的表现是"某些游戏跑不起来"，不是"应用打不开"，不该为它弹任何东西。
日志：`<数据根>\logs\runtime-setup.log`（与崩溃日志同一个目录，见 `errorCollector.ts`）。

## 二、三样依赖与各自的判据

| 依赖 | 装没装的判据 | 是否需要管理员 |
| --- | --- | --- |
| VC++ 运行库 x64 | 注册表 `HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64` 的 `Installed` | 需要 |
| VC++ 运行库 x86 | 同键、但在 `WOW6432Node\` 下（32 位视图） | 需要 |
| VP9 视频解码扩展 | `Get-AppxPackage -Name *VP9VideoExtensions*` | **不需要**（按当前用户注册） |

### 为什么 VC 运行库看注册表，而不是"看 dll 在不在"

`msvcp140.dll` / `vcruntime140.dll` 被**大量程序带在自己目录里**（编译时的那一份），
那种 dll 的存在完全不能说明系统装了运行库 —— 拿它当判据会得出"已安装"从而跳过真正的安装，
最后故障表现还是"某些游戏跑不起来"。注册表那个键是**微软安装器自己写的**，才是事实。

### 为什么只认 `Installed=1`，不比对版本号

14.x 系列（VS 2015 ~ 2022）的 VC 运行库是**二进制向后兼容**的：装了 14.0 就能跑用 14.4 编出来的
程序。反过来若按版本号比大小（"装了 14.38、我们发的是 14.51，得重装"），微软每发一版都会让所有
机器重新装一遍，纯属自找麻烦。版本号只读出来写进日志，不参与判断。

> 有单测锁这两条（`runtimeDeps.test.ts` 里的"14.x 之间不做版本号比较"）。

### 为什么 VP9 按包名通配匹配，不认版本

本机实测：系统里的 VP9 扩展是 **1.2.20.0**，而 `tools/runtime/` 里发的是 **1.2.6.0**。按版本比对会
得出"没装 → 装一遍旧的"（甚至可能因为版本更低而失败）。所以判据是包名通配 `*VP9VideoExtensions*`，
只看"有没有"，不看到底哪一版。

按名匹配还得配 `Get-AppxPackage` 的**名字**字段（`Microsoft.VP9VideoExtensions`），
与 `Add-AppxPackage` 的注册作用域一致 —— 都是**当前用户**，所以都不需要管理员权限。

## 三、四个真机踩出来的坑（都写进了单测）

这几条都不是推理出来的，是在本机实跑时撞出来的，而且**表现都极其误导**：

| 坑 | 现象 | 结论 |
| --- | --- | --- |
| 从 PATH 调 `powershell` | 本机 `where.exe powershell` → `C:\Program Files\PowerShell\7\powershell.exe`（**7.6.5**；装了 PS7 之后它会插到 PATH 最前）。在这个版本里 `Import-Module Appx` 直接失败：`Operation is not supported on this platform. (0x80131539)`、退出码 1；同一台机器上用 `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`（**5.1.19041.5129**）加载同一个模块正常 | 必须用**绝对路径**调 Windows PowerShell 5.1 |
| 给 PowerShell 加 `-WindowStyle Hidden` | PowerShell 以 **-1** 退出，stdout/stderr **全空**（连 `"hi"` 都打不出来）。窗口本来就是外层 `spawn` 的 `windowsHide` 关的，它无窗可隐，这个开关反而把进程搞死 | 参数里**不许**出现 `-WindowStyle` |
| `Write-Output 'x' + $y` | 命令是**参数模式**解析的，`+` 被当成第三个字面参数输出，而不是拼接 | 括号包起来：`Write-Output ('x' + $y)` |
| 进度流 | `Get-AppxPackage` 往 stderr 写进度记录，非交互会话里被序列化成 CLIXML 文本，把真出错时那几行错误淹掉 | 脚本里设 `$ProgressPreference = 'SilentlyContinue'` |
| PATH 上的同名程序 | 本机 `where.exe powershell` 还出现了 `C:\PowerShell\powershell.exe` 这种第三方垫片 | 系统工具（`reg.exe` / `whoami.exe` / PowerShell）一律走 `System32` 绝对路径；实在没有才退回 PATH，并且**会记一条日志** |

由此得出一条通用规则：**凡是要用 Windows PowerShell 专有模块（`Appx` 这类）的脚本，都必须写绝对路径**，
不能依赖 PATH 上的 `powershell`。PS7 更适合写脚本时用（跨平台、报错清楚），但它跑不了这些系统模块 ——
两者不是"新版本代替旧版本"的关系，是能力集不同：一个基于 .NET Core，一个基于 .NET Framework。

判据里还有一条：管理员权限不是看"在不在 Administrators 组"（UAC 会把令牌过滤掉），而是看
`whoami /groups` 里的完整性标签 SID —— `S-1-16-12288`（High）/ `S-1-16-16384`（System）。
判 SID 而不是组名，是因为组名随系统语言变（`Administrators` / `管理员`），SID 不变。

## 四、安装方式

| 依赖 | 怎么装 | 参数 |
| --- | --- | --- |
| VC++ 运行库 | 直接起 `VC_redist.x64.exe` / `VC_redist.x86.exe` | `/install /quiet /norestart /log <数据根>\logs\vc-redist-<arch>.log` |
| VP9 扩展 | 一次 PowerShell 里"查 + 装"（省一次进程启动） | `Add-AppxPackage -Path <bundle> -ErrorAction Stop` |

- 不用 `/passive`：那是"显示进度条"的有界面形态，与静默矛盾。
- VC 运行库退出码 `0` 与 `3010` 都算成功（3010 = 需重启才完全生效，我们按 `/norestart` 不重启）。
- VP9 脚本用**输出标记**回话（`PLAYDAY:RUNTIME:SKIP` / `…:INSTALLED`），不靠退出码猜做了什么。
- 脚本里**只用单引号、不出现双引号**：整段是当命令行参数传给 `-Command` 的，混进双引号就要和
  Windows/Node 的转义规则打架（有单测锁这条）。

## 五、安装包从哪来、运维怎么覆盖

查找顺序（第一个含目标文件的生效）：

1. `settings.runtimeDir` —— **配置项**（由 `path-modes.json` 定，出包时写进 `config.json`）：
   正式机 `X:/YunGame/Playnite/runtime`、测试机 `D:/YunGame/Playnite/runtime`、开发态 `tools/runtime`。
   它默认就是 `<应用 exe 同级>\runtime\` —— 但因为是配置，运维想换成别处（比如共享盘）不必重新出包。
2. `<应用 exe 同级>\runtime\` —— 出包时 `package.bat` 就把这三个文件放在这里，所以正常部署下
   它与第 1 条是**同一个目录**（去重后只剩一条）。这条是**保险**：配置若指到别处（比如共享盘），
   包就在手边却因为两边不重合而"静默不生效"，是最难查的那类故障。
3. `<resources>\runtime\` —— 代码里的兜底口子（目前出包流程不往这里放东西；留着它成本为零，
   将来若要改成随 asar 一起发，不用改代码）。

也就是说，**升级 VC 运行库或换 VP9 包版本是运维动作，不用出一版新客户端**：

- 只改**这台机器**、且不想重新出包：把新文件放进 `settings.runtimeDir` 指的目录即可。
- 那个目录暂时不存在也没关系（典型是刚拷完包的机器、或运维只维护了包内那份）：
  自动退回包内 `resources\runtime\`，检测安装照常工作。
- 两级都没有时才记一条日志跳过（不会报错刷屏）。

> 为什么把它做成配置而不是写死的默认值：写死时"运行库到底放在哪"是隐式的 —— 运维把文件放到
> 别处，客户端仍然只看 exe 同级，表现成"我明明放了却没装"。现在它和封面/音乐/库一样进
> `path-modes.json`，正式机 X 盘、测试机 D 盘在**出包时**就定死，且 `npm run check` 会校验一致性。

## 六、开关（现场临时处置用，不必重新打包）

| 环境变量 | 作用 |
| --- | --- |
| `PLAYDAY_SKIP_RUNTIME_SETUP=1` | 完全不检测（这台机器已由系统镜像铺好，或装机排查） |
| `PLAYDAY_FORCE_RUNTIME_SETUP=1` | 开发态也跑（默认**开发态不跑** —— 免得在开发者机器上装东西） |

## 七、相关文件

| 文件 | 作用 |
| --- | --- |
| `electron/core/runtimeDeps.ts` | 规则层：依赖清单、注册表判据、安装参数、PowerShell 脚本、系统工具路径 |
| `electron/core/runtimeDeps.test.ts` | 上面那层的单测（判据矩阵 + 上面几个坑的锁定） |
| `electron/core/runtimeSetup.ts` | 执行层：找目录、起进程、写日志；启动时由 `main.ts` 调 `ensureRuntimeDeps()` |
| `electron/core/paths.ts` | `runtimeDir()` / `yungamestartDir()`：读 `config.json` 并解析（相对路径以 exe 同级为基准） |
| `tools/runtime/` | 三个安装包本体（入库、随包发） |
| `package.bat` | 把 `tools\runtime` 复制成 `<包>\runtime\`（exe 同级目录，正是配置里的那个路径） |
| `path-modes.json` | 三种模式下这两个目录各在哪（唯一来源，出包时写进 `config.json`） |

## 待确认

- **VP9 是按用户注册的**：一台机器上每个 Windows 账号各注册一次是正常的（本方案由"每次启动检测
  一次"自然覆盖）。若希望**全机器一次性铺开**（含以后新建的账号），得用管理员跑
  `Add-AppxProvisionedPackage`（DISM）—— 那是运维动作，不在客户端里做。
- **若 `Add-AppxPackage` 因缺框架包失败**（少数机器上 VP9 依赖 `Microsoft.VCLibs` /
  `Microsoft.UI.Xaml`），日志里会有 PowerShell 的原始报错。届时把缺的框架包也放进
  `runtime/`，再在本文件与 `runtimeDeps.ts` 的清单里各加一条（按同一套判据）。
- **别把安装包挪回 electron-builder 的输出树里**：现在它们由 `package.bat` 在 electron-builder
  **之后**复制进包，不在签名范围内（微软原厂签名原样保留）。早先一版用 `extraResources` 把那三个
  文件放进了 `resources\runtime\`，出包日志里就出现过
  `signing with signtool.exe path=…\resources\runtime\VC_redist.x64.exe` —— 那等于给微软原版安装包
  再签一次名（配上证书之后就会真的发生）。
