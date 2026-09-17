# 项目记忆与文档优先（本项目的规矩）

## 上下文从哪来

- 本项目的一切上下文**以仓库文件为准**，不要依赖本机记忆库（`~/.codebuddy/`，重装即失）。
- 动手前先读：
  - `docs/PROJECT-MEMORY.md` —— 项目上下文、约定、踩过的坑、用户偏好、交接状态
  - `ARCHITECTURE.md` —— 双端架构、传输层、命令名约定
- 具体功能设计细节在 `docs/design/`（每个功能一篇）。

## 结论写到哪

- 功能/设计层面的结论 → 写成 `docs/design/xxx.md`（会被文档守卫校验路径与相对链接）。
- 会话级、跨领域的上下文（约定、坑、用户偏好、交接）→ 追加到 `docs/PROJECT-MEMORY.md`，**带日期**。
- **不要**只把结论留在对话里或 `.codebuddy/` 下（`rules/` 除外）——那些不进版本库。

## 写执行脚本（bat / ps1）

- **逻辑写 `.ps1`（或沿用已有的 node 脚本）；`.bat` 只当"双击壳"**：`cd /d "%~dp0"` → 摆好环境
  （如 proto Node 的 PATH）→ `powershell -NoProfile -ExecutionPolicy Bypass -File xxx.ps1 %*` → `pause`。
- **不要把业务逻辑塞进 bat**：cmd 的重定向/括号块/`^` 转义/`chcp 65001` 坑一个接一个，
  踩中的代价是"**静默产生垃圾文件 + 英文的误导性报错**"（`The system cannot find the path specified.`
  就是这么冒出来的）。详见 `docs/PROJECT-MEMORY.md` 硬约定 §三.13 / §三.14。
- bat 壳里**不许出现裸 `<` `>`**：占位符用全角 `＜数据根＞`、箭头用 `→`，非要字面量就 `^<` `^>`。

## 提交前

- 跑 `npm run check`（两端类型检查 + 全量单测 + 架构/i18n/文档/字号守卫），必须全绿。
- 路径配置一律走 `path-modes.json` → `config.json`，不要写死。
- **不要未经许可删除文件。**
