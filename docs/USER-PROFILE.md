# 用户档案（跨项目，从本机记忆库迁入仓库）

> **来源**：CodeBuddy 本机记忆库 `~/.codebuddy/memery/`（用户档案 `f7e918e1-…_memery.md`，
> 版本 9，**最后更新 2026-07-06**）。
> **为什么在这里**：本机记忆库重装系统即失。这份档案迁进仓库后跟着 git 走。
> **注意**：内容**跨多个项目**（其中一些与 Playday 无关），且**可能已经过时**——
> 引用前请先与用户确认现状。与 Playday 有关的偏好，见 `docs/PROJECT-MEMORY.md`。

## 身份与背景

- 兼具**产品管理**与**全栈开发**双重背景。
- 沟通语言：中文。偏好简洁直接的请求，同时要求**详尽且具教学目的**的解释；
  代码注释需说明**环境背景与约定**（而非复述代码行为）。
- 产品型工作时习惯提供：完整背景、约束条件、成功指标、期望结构（系统化方法论）。
- **强烈反对 AI 未经许可删除文件。**
- 倾向接收结构化完整文档（如 PRD）与可操作的回复；请求 Web 组件后通常要求导出为独立网站文件。
- 在初始化新项目时可能遇到 Git 基础问题（gitignore、分支命名等）。

## 已知项目（2026-07 时点）

| 项目 | 技术栈 / 说明 |
| --- | --- |
| 团队协作白板（B2B SaaS） | 产品规划；定位介于 Miro/FigJam 与 Google Jamboard 之间；约束为兼容现有实时同步架构，1 前端 + 1 后端、3 个月、Q2 MVP / Q3 完整版 |
| The Legend of SimonDev | Three.js 3D RPG |
| LANChat | Tauri 2.0 + Rust 局域网聊天 |
| gogogo | Vue + Vite，GitHub Pages 部署（`https://github.com/NemecSoft/gogogo`） |
| 魔兽世界风格 Web UI 组件 | 要求可导出为独立网站文件 |
| 长文写作 AI Skill | 结构化工作流（大纲 → 填充 → 润色），面向公众号/博客，计划发布于 skills.sh |
| d:/AI/ts1 | TypeScript 项目，涉及 MASM 汇编 |
| **Playday / YunGame**（本项目） | Electron + React 游戏库管理器，见 `docs/PROJECT-MEMORY.md` |

## 运行时与环境偏好

- 偏好 **Bun** 运行时，习惯用 `npx` 启动项目，并需要启动脚本。
  > 注意：本项目（Playday）实际用的是 **npm**（`package.json` 里的 scripts），没有用 Bun。
