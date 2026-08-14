# PlayniteTauri → Playday 文档迁移计划

本文档记录从 `PlayniteTauri/docs` 迁移设计文档到 `Playday/docs` 的计划与进度。
迁移原则：**只迁与 Playday 已实现功能相关的文档，完整重写为 Electron/TypeScript 现状，去除 Tauri/Rust 内容**。

## 文档映射表

| PlayniteTauri 文档 | Playday 处理 | 说明 |
| --- | --- | --- |
| `README.md` | ✅ 重写 | 建立 Playday 文档索引 |
| `CONTRIBUTING.md` | ✅ 保留 | 文档同步约定 |
| `CHANGELOG.md` | ✅ 重建 | 记录 Playday 变更 |
| `architecture-diagram.md` | ✅ 重写 | Electron 架构 |
| `diagram/*` | ✅ 保留 | 架构图 |

### design/

| 文档 | 处理 | 说明 |
| --- | --- | --- |
| `architecture.md` | ✅ 重写 | Tauri/Rust → Electron/TS |
| `directory-structure.md` | ✅ 重写 | 目录职责 |
| `data-models.md` | ✅ 重写 | Game 模型（TS） |
| `search.md` | ✅ 重写 | 拼音搜索 |
| `views.md` | ✅ 重写 | Grid/Planet 视图 |
| `virtual-scrolling.md` | ✅ 重写 | useVirtualGrid |
| `admin.md` | ✅ 重写 | `--admin` 参数 |
| `game-library-management.md` | ✅ 重写 | game_libraries 表 |
| `theming.md` / `theme-system.md` | ✅ 重写 | 16 palette + 7 style |
| `covers.md` | ✅ 重写 | 封面匹配 |
| `game-detail.md` | ✅ 重写 | iframe 静态页 |
| `i18n.md` | ✅ 重写 | 中英繁三语 |
| `login.md` | ✅ 重写 | 微信/账号/企业IP |
| `news.md` | ✅ 重写 | 公告 |
| `green-storage.md` | ✅ 重写 | configRoot() |
| `image-loading-performance.md` | ✅ 重写 | 懒加载 |
| `build-script.md` | ✅ 重写 | electron-builder |
| `guides.md` | ✅ 精简 | 仅 guide 字段 |
| `build-acceleration.md` | ⚠️ 评估 | 可能与打包合并 |
| `sample-data.md` | ❌ 删除 | seedSampleGamesIfEmpty 已删 |
| `trainers.md` | ❌ 删除 | 修改器未实现 |
| `backup-save.md` | ❌ 删除 | 备份存档未实现 |

### 新增文档（Playday 独有）

| 文档 | 说明 |
| --- | --- |
| `dual-end.md` | 双端架构（桌面+网站一套代码） |
| `tray.md` | 托盘 + 最小化到托盘 |
| `announcement-window.md` | 独立公告窗口 |
| `script-launch.md` | 脚本启动（pre/post launch/exit） |
| `playtime-tracking.md` | 游戏时长追踪 |

## 进度

- [ ] 建立目录结构与索引
- [ ] 迁移核心架构文档
- [ ] 迁移数据模型 / 视图
- [ ] 迁移功能文档（搜索/主题/封面/登录等）
- [ ] 新增 Playday 独有功能文档
- [ ] 清理已删功能文档
- [ ] 同步 push 到 GitHub
