# 游戏内容源表（已退役，2026-09-16）

> **这条链不再使用。** 简介 / 地区 / 标签 / 权限等级 / 存档路径 / 社区评分现在直接改**整库 JSON**
> 的 `games.json` —— 见 [library-json.md](./library-json.md)（导出 → 手改 → 回写，三步）。
>
> 保留这份说明有两个目的：让"当时为什么这么设计"可查，以及**别让旧链接断掉**。

## 原来是什么

- 文件 `data/game-content.json`：人工维护的内容表（每条一个游戏的 `intro` / `region` / `tags` /
  `gamelevel` / `score` / `savepaths` / `batconsole`），几百 KB，纳入 git。
- 配套：`scripts/apply-game-content-to-db.mjs`（把内容表落进库，写前备份）、仓库根的
  `sync-game-content.bat`（双击：先预览 → 按 Y → 写入）、`scripts/gen-game-content.mjs`（补空缺）。
- 上面这些**文件与脚本已一并删除**（`gen-game-content.mjs` 保留但改了用途，见下）。

## 为什么退役（结论，避免以后再有人绕回去）

1. **按固定键重建**：生成脚本、apply 脚本、守卫的"必需键列表"三处各有一份字段清单 —— 想多管一个
   字段要改三处，漏一处不是报错而是"改了没生效"。
2. **只能管 7 个字段**，其余（安装目录、启动参数、脚本、评分…）还是得开 GUI 或另写脚本。
3. 整库 JSON 是 **schema 驱动**（表和列从库里现发现）：**加一列、加一张表都不用改代码**，所以
   "必需键列表"这种东西不需要存在。

顺带说一句：当年"必需键列表"还漏过一个真 bug —— `gamelevel` 曾是可选键，结果库里 1276 条
`game_level` 全是迁移时写死的 1，**黄金版用户能启动钻石版游戏**（门禁形同虚设）。

## 内容去哪了（迁移时核对过）

删文件前逐条核对过：内容表 1283 条**全部**能在 `dev-data/library-json/games.json` 里找到对应行；其中
8 个游戏（`…网吧联机版` 那几个、`宝可梦：朱紫` 等）的内容**只在内容表里**（它们是内容表最后一次
apply 之后才加进库的），已按"**只补空**"合进 `games.json`。

⚠️ 该次核对还发现 8 个游戏的 `game_level` 两边不一致（内容表说 2 / 库里是 1）—— 那会直接影响
黄金/钻石门禁，**当时刻意没有自动覆盖**，需要人工确认后改 `games.json` 的 `game_level`。

## 相关

- 现在的做法：[library-json.md](./library-json.md)
- 库表结构：[database-schema.md](./database-schema.md)
- 权限等级与门禁：[user-level-detection.md](./user-level-detection.md)
