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
1. config.json → settings.userLevelOverride   非 0 时直接用它（调试/自救开关）
2. 用户表按 IP 命中   → UserLevel=2 ? 钻石(2) : 黄金(1)
3. 已登录的个人会话  → 取该账号的 level（管理员建的账号，可用于排障时提权）
4. 都没有           → 黄金(1)
```

- **IP 匹配范围**：先比公网 IP（表里存的就是公网 IP），再兜底比本机内网 IPv4。
- **为什么第 1 条存在**：见 §1.4 —— 没有它是会把自己锁死的。
- ⚠️ 与旧行为的差别：以前"没命中 = 游客(等级 3) = 全权限"，现在**没命中 = 黄金(1)**。
  这是需求（"否则就是黄金版用户"）的直接结果，但影响面很大，见下。

### 1.4 ⚠️ 副作用：开发/测试机也会变黄金版

实测本机（开发机）的 IP **不在名单里** → 按规则就是黄金版 → **所有 `gameLevel=2` 的游戏
都不能启动**（库里绝大多数是 2）。这是预期行为，但会让开发/排障寸步难行。

对策：`settings.userLevelOverride`（0 = 关闭）。想临时全解锁就把 `config.json` 里
`userLevelOverride` 设成 `2`（或 `3`），改完重启客户端生效。**这是唯一的"后门"，也只在本机
config.json 里，不影响生产**。

## 2. 门禁矩阵（谁能做什么）

| 能力 | 黄金版 (1) | 钻石版 (2) |
| --- | --- | --- |
| 浏览列表 / 搜索 / 分组 / 看封面 | ✅ | ✅ |
| **看详情页**（含截图、攻略、视频） | ✅ | ✅ |
| 玩 `gameLevel = 1` 的游戏 | ✅ | ✅ |
| 玩 `gameLevel > 1` 的游戏 | ❌ 明确拒绝 | ✅ |
| **备份存档**（GameSaveHelper） | ❌ 明确拒绝 | ✅ |
| 查看自己是什么版本 | ✅（状态栏 / 卡片角标） | ✅ |

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

| 位置 | 行为 |
| --- | --- |
| 公告窗口 | 启动即查一次；维护中 → 顶部压一条红警示条「服务器维护中」（按等级说明），**公告内容照常显示** |
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
| 公告窗口 | 启动即查一次；过旧 → 顶部压一条红警示条「系统过旧」（文案带"已 N 天未更新"），公告内容照常显示 |
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
| 游玩按钮 | 变为**锁 + 「钻石版专享」**文案，仍然**可点**（点了给解释，不是变成死按钮） |
| 点击游玩 | 明确弹提示：**「需要升级为钻石版网吧（网咖）才能玩」**；**不会启动游戏** |
| 详情按钮 | 正常可用（能看不能玩，看详情是允许的） |
| 游戏退出后 | 不弹"是否备份存档"（黄金版不能存档） |
| 顶栏中央 | 显示当前版本（黄金版 / 钻石版）。**不再显示命中门店名**（2026-09 需求：门店名不出现在界面上，连 hover 提示也去掉；原右上角那个 `YunGame——门店名` 胶囊已整块移除） |

**文案规范（用户明确要求过，别改回去）**

1. 提示里**不要出现等级数字**。"当前用户等级 1、该游戏需要等级 2"是给开发者看的信息；
   用户只需要知道"要升级成钻石版网吧才能玩"。排障信息进日志，不进提示条。
2. 统一措辞：**「需要升级为钻石版网吧（网咖）才能玩」**（存档场景："…才能存档"）。
   三处必须口径一致：卡片悬停提示、启动拦截（前端 `gamesStore` + 主进程 `launchGame` 兜底）、
   存档拦截（`saveManager`）。
3. i18n 键 `need_diamond_cafe`（中简/中繁/英三语俱备）；主进程侧没有 i18n，用同义中文字面量。

禁止的做法：把锁定卡片**隐藏**（需求要求"看得到"）、只把按钮置灰不给原因、在提示里报
等级数字、用同一个红点同时表达"锁定"和"火爆"（必须是两个不同的视觉信号）。

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
| `electron/ipc/saveManager.ts` | 备份存档前校验 + 退出后不提示黄金版用户 |
| `src/stores/authStore.ts` | 前端缓存 `userLevel` + `canPlay()` |
| `src/components/TopBar.tsx` | **顶部中央**的版本标识（图标 + 黄金版/钻石版） |
| `src/components/views/GridView.tsx` | 卡片锁定态（封面降饱和 + 锁标 + 游玩按钮改造） |
| `src/components/AnnouncementWindow.tsx` | 两道门禁的提示条（维护 / 库过旧，样式 `.ann-gate`）+ 被拦时把「进入系统」换成「退出」 |
| `src/api/client.ts` | `getServerStatus()` / `getLibraryAge()` / `enterSystem()`（被拒时带 `reason`） |
| `config.json` → `yunGameUserListPath` / `yunGameServerStatusPath` / `userLevelOverride` | 用户表与维护表路径（相对路径以应用 exe 所在目录为基准，同其它路径字段）+ 调试覆盖 |

## 5. 配置项

```jsonc
{
  "settings": {
    // 用户表位置（明文或原版 JsonCrypt 加密版都行）。
    // 相对路径以「应用 exe 所在目录」为基准（与其它路径字段一致）；本机指向 YunGame 配置目录。
    "yunGameUserListPath": "D:/YunGame/PlayNite/YunGameConfig/YunGame_UserList.json",
    // 维护状态表位置，同上。
    "yunGameServerStatusPath": "D:/YunGame/PlayNite/YunGameConfig/YunGame_ServerStatus.json",
    // 0 = 关闭（默认，按 IP 判定）。非 0 时强制使用该等级：1 黄金 / 2 钻石 / 3 全解锁。
    // 仅用于本机调试与排障 —— 这是唯一的"后门"，别在生产机上乱设。
    "userLevelOverride": 0
  }
}
```

> 部署说明：这两个文件是**共享配置**（同一台 YunGame 服务器上的多家网吧共用一份），
> 正常由 YunGame 的服务端程序维护、客户端只读。生产机上可以把它们放到客户端目录并用相对路径，
> 也可以像本机这样直接指向 `D:\YunGame\PlayNite\YunGameConfig\`。
> 注意 `YunGameConfig` 下的 `YunGame_Gamelist.json` 同时也是 `gen-game-content.mjs` 的
> gamelevel 来源（见 [game-content.md](./game-content.md)）。

## 6. 待定 / 风险

1. **文件缺失**：按规则落到黄金版（严格）。若你希望"文件不存在时保持旧的游客全权限"，
   这是一行判断的差别 —— 但那就等于给了绕过口子，默认不做。
2. **网站端**：目前本机制只在客户端主进程生效。网站端（`server/`）是否也要按 IP 判等级、
   还是只给管理端看，待定。
3. **旧的 users 表企业匹配**（`getUserByIp`，管理员导入的企业用户）仍保留为第 3 优先级来源，
   不再作为等级的唯一依据。
4. **公网 IP 获取依赖外部服务**（`ipinfo.io` 等），无网络时只能靠内网 IP 兜底 → 可能误判为黄金版。
   生产环境建议让用户表里也填上内网段，或在部署时固定 `userLevelOverride`。
