# 游戏内容源表（data/game-content.json）

## 它是什么

每个游戏的**人工内容**：简介、地区、标签（外加关卡等级）。这是**内容资产，不是构建产物** ——
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
| `intro` | string | **玩家视角的一句话简介**（≤48 字、不重复游戏名），如"当大学校长，建校园，管师生，开各种奇葩专业，模拟经营。" | `games.intro` |
| `region` | string | 地区，单个直写（`"国产"`）；多个用 `#` 连（`"国产#日本"`）；没有就写 `""` | `games.region`（库里是 JSON 数组文本） |
| `tags` | string | 标签，**用 `#` 分隔**：`"#休闲#生存#卡通#烧脑"`；没有就写 `""` | `games.tags`（同上） |
| `gamelevel` | number | 关卡等级（来源：`YunGame_Gamelist.json`，取不到 = 2） | `games.game_level`（默认**不**写） |

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

# 3) 批次小文件 → 总表（带风格校验：≤48 字、不得重复游戏名、非空、无 markdown）
node scripts/merge-authored-intros.mjs

# 4) 总表 → 数据库（默认 dry-run；写盘前强制备份权威库与运行时副本）
node scripts/apply-game-content-to-db.mjs
node scripts/apply-game-content-to-db.mjs --apply
```

批次文件放 `data/batches/*.json`（每批一个小文件，内容是 `{"游戏名": "简介"}`），
便于逐批产出，避免每次都整体重写上千条。

## 几条硬规则（都有自动化把关，不靠自觉）

1. **生成脚本只补空**：文件里非空的 `intro`/`region`/`tags` 永不被覆盖；`gamelevel` 默认保留，
   想按游戏列表重算加 `--refresh-level`。
2. **回写默认只写 ≤48 字的简介**：超过 48 字的视为"尚未重写的爬来文案"，跳过不写进库，
   否则一次 `--apply` 就会把几百条营销文案推上界面。确实要写加 `--all-intros`。
3. **键缺失 ≠ 清空**：`region`/`tags` 键**存在**就写（写 `""` 就是清空），键**缺失**就跳过。
4. **写库强制备份**：权威库与运行时副本各留一份 `.bak-<时间戳>`。
5. **`npm run check` 有守卫**：文件必须在、JSON 必须可解析、每条字段必须齐 ——
   防止误删/挪走，或编辑时把括号逗号写坏。

## 相关

- 库表结构：[database-schema.md](./database-schema.md)
- 目录与路径配置：[directory-structure.md](./directory-structure.md)
- 数据模型总览：[data-models.md](./data-models.md)
