# 用户等级检测（黄金版 / 钻石版）

本文档定义「当前这台机器是谁、能玩什么」——即原版 YunGame 的**按 IP 判定用户等级**机制，
以及它在 Playday 里的门禁与界面表现。

> 一句话：**用户表（`YunGame_UserList.json`）里按 IP 命中、且 `UserLevel=2` → 钻石版；
> 其余一律黄金版**。黄金版能看不能玩钻石版游戏（`gameLevel > 1`）。

## 1. 判定规则

### 1.1 用户表是什么

`YunGame_UserList.json`：一个 JSON 数组，一条一台机器/一个账号。

| 字段 | 说明 |
| --- | --- |
| `UserId` / `UserAccount` | 账号标识（实测就是 IP 字符串） |
| `UserName` | 网吧/门店名（状态栏显示用） |
| `UserIpAddress` | **判定依据**：该机器的公网 IP |
| `UserLevel` | `1` = 黄金版、`2` = 钻石版 |

**实测现状（2026-09-13，用于校准，不是契约）**：共 **117 条 = 86 个 L1 + 31 个 L2**，
IP 形如 `125.72.52.124`（公网地址）。

### 1.2 加密格式（两种都要能吃）

原版工具 `YunGameTools/JsonCrypt/jsoncrypt`（C#，`Program.cs`）的做法**极简**：

```
key = "yungameplaynite"
cipher = base64( UTF8(明文) XOR key[i % key.length] )      // XOR 对称，解密同式
```

- 加密产物文件名是 `YunGame_UserList_加密文件.json`；**源文件 `YunGame_UserList.json` 是明文**。
- ⚠️ 实测：用户给出的那份 `bin/Debug/YunGame_UserList.json` **是明文**（首字节就是 `[`），
  同目录下**没有**加密文件。生产机部署的可能是加密版。
- 因此实现必须**自动判别**：内容以 `[` / `{` 开头 → 当明文解析；否则按上面的算法解一次。
  （只认一种会在这两种部署里挂掉一种。）
- **一键加密**：`encrypt-userlist.bat`（实现在 `scripts/encrypt-userlist.mjs`）。
  默认就是"把 jsoncrypt 里的明文加密成线上密文"这一步：

  ```
  源  ：D:\AI\Code\YunGameProject\YunGameTools\JsonCrypt\jsoncrypt\bin\Debug\YunGame_UserList.json
  目标：D:\YunGame\PlayNite\YunGameConfig\YunGame_UserList.json
  ```

  可用参数覆盖（一个参数换源、两个参数源与目标都换；脚本层还支持 `--in/--out`）。
  三道安全闸：① 目标已存在时先备份 `<文件>.bak-<时间戳>`；② **源文件已经是密文就直接拒绝**
  （二次加密会毁数据）；③ 源文件不是合法 JSON 也拒绝。
  另外**部署前会报出"会改掉哪些记录"**（只提示不阻拦）—— 加密是原样搬运，源与目标若是不同
  版本会静默替换线上数据（真实踩过：源里「鹊踏枝酒店」是 L2、线上是 L1）。
  已用**字节级比对**验证：对同一份明文，本工具与原版 JsonCrypt 的输出 **SHA256 完全相同**。

### 1.3 判定优先级（单一入口，别在多处各判一遍）

```
1. 用户表按 IP 命中   → UserLevel=2 ? 钻石(2) : 黄金(1)
2. 已登录的个人会话  → 取该账号的 level（管理员建的账号；3 = 全解锁）
3. 都没有           → 黄金(1)
```

- **IP 匹配范围**：先比公网 IP（表里存的就是公网 IP），再兜底比本机内网 IPv4。
- **没有任何"等级覆盖开关"**（2026-09-14 用户要求彻底去掉后门）：想在开发/测试机上自测，
  就把本机 IP 写进用户表 —— 见 §1.4。
- ⚠️ 与旧行为的差别：以前"没命中 = 游客(等级 3) = 全权限"，现在**没命中 = 黄金(1)**。
  这是需求（"否则就是黄金版用户"）的直接结果，但影响面很大，见下。

### 1.4 ⚠️ 副作用：开发/测试机也会变黄金版（以及怎么自测）

实测本机（开发机）的 IP **不在名单里** → 按规则就是黄金版 → **半锁定**：卡片上没有「开始游戏」
按钮、右键菜单只有「详情」，`gameLevel=2` 的游戏一律玩不到（库里绝大多数是 2）。这是预期行为。

**自测办法（唯一一条路，没有后门）**：把**本机当前的 IP 写进用户表**，要什么等级就把那条记录的
`UserLevel` 设成什么（`1` = 黄金、`2` = 钻石），改完**重启客户端**生效（用户表每次启动读一次）。

| 步骤 | 说明 |
| --- | --- |
| 1. 查本机 IP | 判定是"公网 IP 优先、内网 IPv4 兜底"，两个填哪个都能命中。本机实测：公网 `110.167.93.100`、真实网卡 `192.168.1.2`（另有 WSL / 虚拟网卡的 `172.x`、`192.168.x.1`，别填） |
| 2. 改用户表 | 表可能是**明文**也可能是**密文**（base64+XOR，两种都能读）。生产那份 `D:/YunGame/PlayNite/YunGameConfig/YunGame_UserList.json` 实测**是密文** → 手改会读不出来：要么改**明文源文件**再跑 `encrypt-userlist.bat` 覆盖过去，要么把目标文件整份换成明文（代码认明文） |
| 3. 重启核对 | 底部状态栏会显示命中的门店名（未命中显示「未知网吧」）—— 据此确认 IP 有没有填对 |

> 为什么不做开关：给了开关就等于给了**绕过门禁**的方式（改一个 JSON 字段就能玩钻石版游戏），
> 与"按 IP 判定等级"的初衷相悖。要提权就改用户表 —— 那条路本身就是运维的正常动作。

## 2. 门禁矩阵（谁能做什么）

| 能力 | 黄金版 (1) | 钻石版 (2) |
| --- | --- | --- |
| 浏览列表 / 搜索 / 分组 / 看封面 | ✅ | ✅ |
| **看详情页**（含截图、攻略、视频） | ✅ | ✅ |
| 玩 `gameLevel = 1` 的游戏 | ✅ | ✅ |
| 玩 `gameLevel > 1` 的游戏 | ❌ 明确拒绝 | ✅ |
| **备份存档**（GameSaveHelper） | ✅ | ✅ |
| 查看自己是什么版本 | ✅（状态栏 / 卡片角标） | ✅ |

> **存档备份不在此列**（2026-09-14 需求变更）：黄金版也能备份**任何**游戏的存档 —— 存档是玩家自己的
> 东西，不该因为版本不同就拿不出来。备份这条链路上**没有任何等级判断**（原先的两处 `canPlay`
> 门禁已从 `electron/ipc/saveManager.ts` 删除）。
>
> ⚠️ **半锁定（2026-09-14 策略）**：`canPlay` 为假的游戏"**只能看详情**"，开始游戏与存档入口
> **默认都没有** ——
>   · **卡片上不渲染**「开始游戏」按钮（`src/components/views/GridView.tsx`，只留「详情」+ 封面锁定角标）；
>   · **右键菜单只给「详情」**（`src/components/GameContextMenu.tsx`，渲染测试
>     `src/components/__tests__/GameContextMenu.render.test.tsx` 钉住，断言看图标类名、语种无关）；
>   · **详情页顶栏正中的「开始游戏」也不渲染**（2026-09-15 追加，`src/pages/GameDetailPage.tsx`，
>     渲染测试 `src/pages/__tests__/GameDetailPage.render.test.tsx` 钉住）。条件是
>     `authStore.loaded && canPlay(userLevel, game.gameLevel)` —— **必须连 `loaded` 一起判**：
>     等级算完之前 `userLevel` 暂定是 3（见 `src/stores/authStore.ts`），只看 `canPlay` 会让
>     黄金版用户先看到按钮、几十毫秒后再消失（闪一下）。
> 两件事不矛盾：**链路**上没有等级判断（谁走到都能用），**入口**按"能不能玩"收；
> 能玩该游戏的用户照常看到「开始游戏」与「备份游戏存档」。

判定函数唯一：`canPlay(userLevel, gameLevel) = userLevel >= gameLevel`（`electron/core/auth.ts`，
前端 `src/stores/authStore.ts` 同一语义）。**任何"能不能玩"的判断都必须走它**，不许各处自己写比较。

## 2.5 维护状态（不能进入系统）

`YunGame_ServerStatus.json`（与用户表同目录）控制**维护开关**，格式：

```json
[
  { "UserLevel": 1, "Status": 1 },
  { "UserLevel": 2, "Status": 1 }
]
```

- **按用户等级分别控**：`Status = 0` 表示该等级**正在维护**；`1`（或缺字段）表示正常。
  典型用途：黄金版定期维护 → 只把 `UserLevel: 1` 那行改成 0，钻石版照常营业。
- **只认显式 0**：找不到该等级的行 / 缺 `Status` / 文件不存在 / 解析失败 → **一律按正常营业**。
  配错或漏配不该把所有人锁在门外。
- 加密与用户表同一套（明文或 base64+XOR 都能读）。

**行为（需求：公告自动提示服务器在维护，不能进入系统，直接退出）**：

> 2026-09-17 加强（需求原话：*"这个提示不够明显，要直接在中间大大的显示服务器维护。
> 而不要再显示通用内容了"*）：命中门禁时**整屏只说这一件事** —— 居中大字「服务器维护中」，
> 正文 = **`（YunGame黄金版）正在维护`**（同一天的第二条需求原话：*"不要本版本正在维护，
> 直接 （YunGame黄金版）正在维护"* —— 不再用"该版本正在定期维护，暂时无法进入…"那套说法，
> 直接点名是哪个版本在维护）；通用公告内容（含"自定义公告：编辑本文件 …"那行提示）**不再渲染**。
> 样式 `.ann-block`。
> 品牌与档位走 `tier_badge_gold` / `tier_badge_diamond`（**带品牌**的那两个键，与右下角徽标**同源**：
> 品牌串来自 `build.config.ts` 的 APP_NAME，经 preload 的 sendSync 到渲染层）；`tier_gold` /
> `tier_diamond` 是**无品牌版**，留给「游戏级别分组」组名，别混进这条文案。等级取不到（0）时按黄金版
> —— 与全局兜底一致（用户表缺失 / 未命中一律按黄金版）。

| 位置 | 行为 |
| --- | --- |
| 公告窗口 | 启动即查一次；维护中 → **整屏居中大字**「服务器维护中」（按等级注明是哪个版本），**不再显示公告内容** |
| 底部按钮 | 「进入系统」**换成「退出」**，点击直接退出程序 |
| 进系统 | 主进程 `enter_system` **再判一次**并拒绝（`{ok:false, reason:"maintenance"}`）—— 不能只靠前端拦（改前端就能绕过） |
| 前端兜底 | 若点击时刚被置为维护，前端据 `{ok:false}` 切到维护态，避免"点了没反应" |

## 2.6 库过旧（不能进入系统）

需求：**数据库一个月没有发生变化 → 提示「系统过旧」，只能退出，不允许进入**。

判定依据 = **权威库文件**（`<sourceLibraryDir>/library.db`，默认 `<数据根>/Admin/library.db`）
的**最后修改时间**：满 30 天未变化即判为过旧。阈值写死在 `shared/libraryAge.ts`
（`MAX_LIBRARY_AGE_DAYS = 30`），**不给配置开关** —— 给了开关就等于给了绕过方式。

为什么用"库文件时间"而不是"库里存一个版本日期字段"：

1. **零维护**：脚本导入游戏、同步标签、手工改库……任何改动都会刷新文件时间，
   不需要每个写入方都记得去更新某个字段（漏改一处就静默失效）；
2. **与既有体系一致**：`electron/core/db.ts` 把权威库复制成运行时副本时刻意**保留 mtime**
   （`shared/librarySync.ts` 的 `shouldSyncDatabase` 正是靠它判断要不要复制），
   说明「文件时间 = 内容最后变化时间」这条语义在本体系里已经成立。

> ⚠️ **绝不能用运行时副本的时间**：副本在运行期会被写设置刷新（实测比权威库还新），
> 拿它判定等于永远"刚更新过"，这条校验就废了。

行为（与维护状态同构）：

| 位置 | 行为 |
| --- | --- |
| 公告窗口 | 启动即查一次；过旧 → **整屏居中大字**「系统过旧」（文案带"已 N 天未更新"）；公告内容同样不再显示（2026-09-17 与维护态统一：命中门禁就整屏只说这一件事） |
| 底部按钮 | 「进入系统」**换成「退出」**，点击直接退出程序 |
| 进系统 | 主进程 `enter_system` **再判一次**并拒绝（`{ok:false, reason:"outdated", ageDays}`） |
| 前端兜底 | 若点击时刚好被判过旧，前端据 `{ok:false}` 切到过旧态，避免"点了没反应" |

三条**不锁**的兜底（宁可放过，不可错锁 —— 被锁的人是**真进不去**；实现见 `shared/libraryAge.ts`）：

1. 读不到库文件（不存在 / 没权限 / 新装机还没拷库）→ 不锁；
2. 文件时间比"现在"还新（系统时间被往前调过、或从别的机器拷来未来时间）→ 不锁；
3. 差 1 天以内 → 不锁（**满 30 天才锁**）。

> 运维对应关系：开发/测试机若被拦，把本机权威库的时间刷一下即可
> （`(Get-Item "<数据根>/Admin/library.db").LastWriteTime = Get-Date`）；
> 生产上就是"每月至少更新一次库"，与本需求初衷一致。

## 3. 黄金版用户的「强烈反馈」（UX 规范）

需求原话：*"给黄金版用户有强烈的反馈，知道自己能看到但玩不到"*。所以锁定态不能只是"按钮灰了"，
要一眼可辨、且点击时明确说清原因：

| 位置 | 表现 |
| --- | --- |
| 卡片封面 | 整体**降饱和 + 压暗**（`filter: grayscale(.6) brightness(.62)`）+ 左上角**锁标**；右上角「钻石版」小角标（该角标优先于"人气火爆"火苗 —— 可用性信息比营销信息重要） |
| 游玩按钮 | **不渲染**（半锁定：只留「详情」；详情页顶栏正中那个同样不渲染 —— 2026-09-15 追加）。为什么玩不到的说明放在封面左上角的**锁定角标**上：悬停给「需要升级为钻石版网吧（网咖）才能玩」 |
| 点击游玩 | （半锁定后卡片上已经没有入口）若从其它途径发起启动，主进程仍拒绝并提示**「需要升级为钻石版网吧（网咖）才能玩」**；**不会启动游戏** |
| 详情按钮 | 正常可用（能看不能玩，看详情是允许的） |
| **右键菜单** | **只有「详情」**：不显示「开始游戏」、也不显示「备份游戏存档」（2026-09-14 需求："只能看游戏详情"）；等级够的用户三项齐全 |
| 游戏退出后 | 照常弹"是否备份存档"（黄金版也能备份，见 §2） |
| 右下角状态栏 | 显示**品牌 + 版本**（如 `YunGame黄金版` / `YunGame钻石版`），位置在**背景音乐控件的右边**（2026-09-15 起）。品牌串**不是写死的** —— 来自 `build.config.ts` 的 `APP_NAME`，以后要改成 PlayDay 只改那一处（传递链路见 §4）。<br>**为什么不在顶栏**：徽标原先绝对居中、**不占位置**，而顶栏的标签栏是动态长度（每个游戏一个标签）—— 标签一多就从徽标底下穿过去、两行字叠在一起（现场反馈"会产生遮挡，乱"）。那是结构性的，调间距解决不了，所以整块挪到了右下角。**不再显示命中门店名**（2026-09 需求：门店名不出现在界面上，连 hover 提示也去掉；原右上角那个 `YunGame——门店名` 胶囊已整块移除） |
| 窗口 / 任务栏 / 托盘图标 | **按等级换**（2026-09-16 需求）：黄金版用 `1.ico`、钻石版用 `2.ico`。判据 `shared/userLevel.ts::iconNameForLevel()`（与 `canPlay` 同口径），运行期由 `electron/core/appIcon.ts::refreshAppIcons()` 刷新 —— 见 [应用图标](./app-icons.md) §1.1 |

**底部状态栏的门店名（2026-09-14 补充）**：底栏第三个字段显示**命中的门店名**（取自用户表
`UserName`，与等级判定同源）；**未命中时显示「未知网吧」**，不再显示历史上的「未连接 C-afe」——
后者会让现场以为是**网络断了**（跑去查网络），而真实原因是「这台机器的公网 IP 不在用户表里」
（要加名单，见 §1.4）。文案必须指向真正的原因：判定规则见本文 §1，
实现见 `src/components/StatusBar.tsx`。

> 注：上文"顶栏不显示门店名"仅指**顶栏**（那个 `YunGame——门店名` 胶囊已移除）；**底部状态栏**
> 仍会显示命中门店名 —— 这是后来单独加的（对齐 Playnite 的状态栏），不是老需求复活。



1. 提示里**不要出现等级数字**。"当前用户等级 1、该游戏需要等级 2"是给开发者看的信息；
   用户只需要知道"要升级成钻石版网吧才能玩"。排障信息进日志，不进提示条。
2. 统一措辞：**「需要升级为钻石版网吧（网咖）才能玩」**。
   两处必须口径一致：卡片悬停提示、启动拦截（前端 `gamesStore` + 主进程 `launchGame` 兜底）。
   （存档场景的原措辞"…才能存档"已随 2026-09-14 的规则变更作废：备份不再看等级。）
3. i18n 键 `need_diamond_cafe`（中简/中繁/英三语俱备）；主进程侧没有 i18n，用同义中文字面量。

禁止的做法：把锁定卡片**隐藏**（需求要求"看得到"）、不给入口又**不给原因**（锁定角标必须留着 ——
2026-09-14 改成"半锁定/不给入口"之后，角标成了唯一的原因说明，别顺手删）、在提示里报
等级数字、用同一个红点同时表达"锁定"和"火爆"（必须是两个不同的视觉信号）。

**黄金版用户的默认分组（2026-09-14 追加）**：黄金版用户开屏默认按「游戏级别」分组，黄金版在上、
钻石版在下 —— 让能玩的先出现（库里约 87% 是钻石版专享，不排序就是"找不到可玩的"）。
这**不是**放宽门禁，也不是隐藏锁定卡：门禁仍以 `canPlay` 为唯一判据、锁定态表现也不变（见上表），
只是列表顺序友好一点。实现见 `src/utils/selectors.ts` 的 `defaultGroupByFor()`；设计细节见
`docs/design/game-facet-filter-and-grouping.md` 的「游戏级别分组」。

## 4. 实现落点

| 文件 | 职责 |
| --- | --- |
| `shared/userLevel.ts` | **纯逻辑**（零依赖、可单测）：密文/明文判别与解析、`resolveUserLevel()`、`parseServerStatusRaw()`/`resolveMaintenance()`、`canPlay()` 语义 |
| `shared/userLevel.test.ts` | 单测：加解密往返、命中/未命中、L1→黄金、L2→钻石、内网兜底、覆盖开关、维护状态 |
| `shared/libraryAge.ts` | **纯逻辑**（零依赖、可单测）：`evaluateLibraryAge()` + 写死的 30 天阈值 `MAX_LIBRARY_AGE_DAYS`（库过旧判定） |
| `shared/libraryAge.test.ts` | 单测：30 天边界、以及"读不到文件 / 文件时间在未来 / 差 1 天"三种必须不锁的兜底 |
| `electron/core/auth.ts` | 读文件（`fs`）+ 本机/公网 IP（会话级缓存）+ 调用 `shared/userLevel.ts`；`resolveMaintenanceState()`、`resolveLibraryAgeState()`（读权威库 mtime） |
| `electron/ipc/auth.ts` | `get_current_user` / `resolve_enterprise` / `get_status_bar` 走本机制 |
| `electron/ipc/system.ts` | `get_server_status` + `get_library_age` + `enter_system` 的两道门禁拦截（维护 / 库过旧） |
| `electron/core/process.ts` | `launchGame` 启动前校验（**已存在**，保持单一入口） |
| `electron/ipc/saveManager.ts` | 存档备份（**不看等级**，2026-09-14 起）+ 退出后按 `saveBackupMode` 提示 / 静默备份 / 不备份 |
| `src/stores/authStore.ts` | 前端缓存 `userLevel` + `canPlay()` |
| `src/components/TierBadge.tsx` | 版本标识（图标 + 品牌 + 档位）。品牌读 `window.electronConfig.appName`（在 render 期读：网站端没有这个桥，空串时退化成只显示档位）；文案用 `tier_badge_gold` / `tier_badge_diamond`（`{{brand}}` 插值，中英的空格差异放在语言文件里）。**与 `tier_gold` / `tier_diamond` 刻意分开** —— 那两个还用在「游戏级别分组」组名与公告窗口的维护提示里，不该带品牌。<br>⚠️ 2026-09-15 从 `TopBar.tsx` 搬出来：顶栏那条流里放不下"不占位置又必须居中"的东西（见上面 UX 表那行的原因）。`TopBar` 里**故意留了一条测试**钉住"徽标不在顶栏"，别哪天被顺手加回去 |
| `src/components/StatusBar.tsx` | 徽标的**渲染位置**：底栏最右、背景音乐控件右边（`MusicPlayer` 没音乐时返回 null，徽标自然落到最右端） |
| `src/styles/global.css` | 徽标样式与动效：`.tier-badge`（含 `.gold` / `.diamond`）、`.tier-sheen`、`tier-glow` / `tier-icon-pop`。⚠️ 它现在是 `position: relative` —— 里面的扫光裁切层 `.tier-sheen` 是 `absolute inset:0`，靠徽标当"已定位祖先"才裁得对（原来那个角色由 `absolute` 承担，挪位置时改成了 `relative`，删掉它扫光会糊满整条状态栏） |
| `electron/ipc/system.ts` + `electron/preload.ts` | 品牌串的**传递通道**：主进程 `ipc.on("get_app_name")` 同步回 `APP_NAME`，preload 用 `sendSync` 取。为什么绕这一圈 —— 沙箱 preload **不能 require 相对路径模块**（2026-09-15 真机探针：`sandboxed=true`、`require("./sibling.js")` 报 module not found、`sendSync` 可用），所以它没法直接 import `build.config` |
| `src/components/__tests__/TierBadge.render.test.tsx` | 钉住"品牌来自配置而非写死"：断言用 `tier_badge_*` 键、品牌作为变量传入、换品牌徽标跟着变、无 preload 桥时不抛错、档位类名跟着等级走（原在 `TopBar.render.test.tsx`，跟着组件一起搬来） |
| `src/components/views/GridView.tsx` | 卡片锁定态（封面降饱和 + 锁标 + 游玩按钮改造） |
| `src/pages/GameDetailPage.tsx` | 详情页顶栏**正中**的「开始游戏」按钮（2026-09-15）：条件 `loaded && canPlay`，黄金版看钻石版不渲染；点击走 `launchGame()`（与卡片/右键同一条链路），**运行中也照旧可点** |
| `src/components/AnnouncementWindow.tsx` | 两道门禁的**整屏拦截页**（维护 / 库过旧，样式 `.ann-block`；2026-09-17 起命中就不再渲染通用公告内容）+ 被拦时把「进入系统」换成「退出」 |
| `src/api/client.ts` | `getServerStatus()` / `getLibraryAge()` / `enterSystem()`（被拒时带 `reason`） |
| `config.json` → `YunGameConfigDir` | 网吧配置**目录**（用户表 `YunGame_UserList.json` 与维护表 `YunGame_ServerStatus.json` 的文件名固定；相对路径以应用 exe 所在目录为基准，同其它路径字段） |

## 5. 配置项

```jsonc
{
  "settings": {
    // 网吧配置目录（明文或原版 JsonCrypt 加密版都行）。里面固定两个文件名：
    //   YunGame_UserList.json（用户表）/ YunGame_ServerStatus.json（维护状态表）
    // 相对路径以「应用 exe 所在目录」为基准（与其它路径字段一致）；本机指向 YunGame 配置目录。
    "YunGameConfigDir": "D:/YunGame/PlayNite/YunGameConfig"
  }
}
```

> 部署说明：这两个文件是**共享配置**（同一台 YunGame 服务器上的多家网吧共用一份），
> 正常由 YunGame 的服务端程序维护、客户端只读。生产机上可以把它们放到客户端目录并用相对路径，
> 也可以像本机这样直接指向 `D:\YunGame\PlayNite\YunGameConfig\`。
> 注意 `YunGameConfig` 下的 `YunGame_Gamelist.json` 同时也是 `gen-game-content.mjs` 给
> `games.json` 补 `game_level` 的来源（见 [library-json.md](./library-json.md)）。

## 6. 待定 / 风险

1. **文件缺失**：按规则落到黄金版（严格）。若你希望"文件不存在时保持旧的游客全权限"，
   这是一行判断的差别 —— 但那就等于给了绕过口子，默认不做。
2. **网站端**：目前本机制只在客户端主进程生效。网站端（`server/`）是否也要按 IP 判等级、
   还是只给管理端看，待定。
3. **旧的 users 表企业匹配**（`getUserByIp`，管理员导入的企业用户）仍保留为第 3 优先级来源，
   不再作为等级的唯一依据。
4. **公网 IP 获取依赖外部服务**（`ipinfo.io` 等），无网络时只能靠内网 IP 兜底 → 可能误判为黄金版。
   生产环境建议让用户表里也填上内网段（走"内网 IPv4 兜底"这条匹配）。
