# 游戏内容源表（data/game-content.json）

## 它是什么

每个游戏的**人工内容**：简介、地区、标签（外加权限等级 `gamelevel`）。这是**内容资产，不是构建产物** ——
丢了得一条条重写，所以放在仓库根的 `data/` 下并纳入版本管理。

## 为什么不能放 release/

`.gitignore` 对 `release/` 的策略是"整目录忽略，只放行 `library/`、`announcements/`、`config.json`"。
把人工内容放在那里等于**不进版本管理**，任何一次清理发布目录都会真丢。所以固定在仓库根的
`data/`（该目录**故意入库**，`.gitignore` 里也写了说明，别再加忽略规则）。

## 字段

| 字段 | 类型 | 说明 | 落库到 |
| --- | --- | --- | --- |
| `gameid` | string | games.db（LiteDB）里的 `GameId`，与 `YunGame_Gamelist.json` 同一套 id | `games.game_id` |
| `name` | string | 游戏名，也是回写时的匹配键 | `games.name` |
| `intro` | string | **玩家视角的一段简介**，如"当大学校长，建校园，管师生，开各种奇葩专业，模拟经营。"。**长度不限**（AI 批量重写时习惯压到 ≤48 字）；界面按**纯文本**渲染，别写 markdown 记号（`**` 会原样显示成星号） | `games.intro` |
| `region` | string | 地区，单个直写（`"国产"`）；多个用 `#` 连（`"国产#日本"`）；没有就写 `""` | `games.region`（库里是 JSON 数组文本） |
| `tags` | string | 标签，**用 `#` 分隔**：`"#休闲#生存#卡通#烧脑"`；没有就写 `""` | `games.tags`（同上） |
| `gamelevel` | number | **玩这个游戏需要的权限等级**：`1` = 黄金版、`2` = 钻石版（黄金用户只能玩 1，钻石用户 1/2 都能玩）。来源 `YunGame_Gamelist.json`，取不到 = 2 | `games.game_level`（**默认就写** —— 它是黄金/钻石门禁的判据，不写门禁就形同虚设） |
| `score` | number | **社区评分**（人工填）：大于阈值时卡片右上角亮「人气火爆」小火苗（阈值 = `src/utils/hotBadge.ts` 的 `HOT_SCORE_MIN`，默认 100）。**没填过就不写这个键** —— 写 0 / 空等于没设，同步时不会去动库里原值 | `games.community_score` |

### 手写格式（地区 / 标签）

```jsonc
"region": "国产",                  // 单个地区直写
"region": "国产#日本",              // 多个地区用 # 连
"tags": "#休闲#生存#卡通#烧脑",      // ★ 标签就这么写：一个 # 接一个
"tags": "",                        // 没有就写空串（别写 []）
```

解析规则（两个脚本里的 `asArr`）：

- **有 `#` 就只按 `#` 拆** —— 所以标签本身可以含逗号或斜杠（`即时战略/塔防` 不会被切坏）；
- 没有 `#` 时才退化为按 `,` `，` `、` `/` 拆，照顾手写 `休闲,生存` 的人；
- 首尾/连续多写的 `#` 只会产生空段，自动丢弃（`#休闲##生存#` 同样得到两个标签）；
- 数组写法（`["休闲","生存"]`）照样接受 —— 历史数据与程序生成都可能是数组。

## 常用命令

```bash
# 1) 补齐空缺（只补空/缺，永不覆盖你已有的非空值）
node scripts/gen-game-content.mjs --dry-run
node scripts/gen-game-content.mjs                # 真正写文件

# 2) 写简介的素材（游戏名 + 详情页标签 + 爬来的介绍，分批看）
node scripts/dump-intro-material.mjs --offset 0 --limit 150 --brief

# 3) 批次小文件 → 总表（带风格校验：不得重复游戏名、非空、无 markdown、长度 6..200）
node scripts/merge-authored-intros.mjs

# 4) 总表 → 数据库（默认 dry-run；写盘前强制备份权威库与运行时副本）
node scripts/apply-game-content-to-db.mjs
node scripts/apply-game-content-to-db.mjs --apply
```

批次文件放 `data/batches/*.json`（每批一个小文件，内容是 `{"游戏名": "简介"}`），
便于逐批产出，避免每次都整体重写上千条。

### 双击批处理（不想敲命令就用这个）

仓库根的 `sync-game-content.bat`，双击即可：

1. **先预览**：列出会改多少条（DRY-RUN，不动库）；
2. **按 `Y` 确认**：才真正写入，写前自动把权威库与运行时副本各备份一份 `.bak-<时间戳>`；
3. 完成后**启动/重启 Playday**，界面上就能看到新的简介 / 地区 / 标签。

附加开关（命令行加参数，或建个快捷方式带上）：

```bat
sync-game-content.bat                  :: 默认：简介/地区/标签/社区评分/权限等级 全部写进库
sync-game-content.bat --short-only     :: 只写 <=48 字的短简介（历史遗留，现在基本用不到）
sync-game-content.bat --yes            :: 跳过"按 Y 确认"（给自动化调用用）
```

## 几条硬规则（都有自动化把关，不靠自觉）

1. **生成脚本只补空**：文件里非空的 `intro`/`region`/`tags` 永不被覆盖；`gamelevel` 默认保留，
   想按游戏列表重算加 `--refresh-level`。
2. **简介默认全部写入**（长的短的一律进库）。曾经有过"超过 48 字就跳过"的闸门，
   结果把人工写的长简介（如「苏丹的游戏」77 字）悄悄漏掉了 —— 已去掉。
   （`--short-only` 是那次留下的开关，只写 ≤48 字的简介；现在内容表里的简介都是长简介，
   它基本用不到，留着以防万一。）
3. **键缺失 ≠ 清空**：`region`/`tags` 键**存在**就写（写 `""` 就是清空），键**缺失**就跳过。
4. **写库强制备份**：权威库与运行时副本各留一份 `.bak-<时间戳>`。
5. **`npm run check` 有守卫**：文件必须在、JSON 必须可解析、每条字段必须齐 ——
   防止误删/挪走，或编辑时把括号逗号写坏。
6. **权限等级 `gamelevel` 必须跟着内容表进库**（默认就写，别改回可选）。它同时是
   [用户等级门禁](./user-level-detection.md)的判据：曾经把它做成 `--with-level` 可选，
   结果库里 1276 条全是迁移时写死的 1 → **黄金版用户能启动钻石版游戏**（真实线上 bug）。

## 相关

- 库表结构：[database-schema.md](./database-schema.md)
- 目录与路径配置：[directory-structure.md](./directory-structure.md)
- 数据模型总览：[data-models.md](./data-models.md)
