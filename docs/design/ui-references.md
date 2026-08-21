# UI 设计参考网站

> 记录作为 UI 设计参考的外部资源网站（2026-08-17 用户指定）。
> 做界面/交互时，可先到这些网站找成熟方案，避免从零手动实现。

## 1. React Bits

- 官网：https://www.reactbits.dev/
- 开源仓库：https://github.com/DavidHDev/react-bits
- 定位：**高质量动画、交互式 React 组件集合**，开源、完全可自定义
- 特点：
  - 侧重动画和交互效果（而非单纯静态样式）
  - 可直接复制组件源码，贴合 React 生态
  - 有免费版（开源集合）和 Pro 版（付费模板/区块）
- 适用：需要动画、动效、交互组件的场景（如弹层、过渡、动效卡片）

## 2. Aceternity UI

- 官网：https://ui.aceternity.com/
- 定位：**React + Tailwind CSS 组件库**，200+ 复制粘贴组件、区块、落地页模板
- 特点：
  - 基于 Tailwind CSS + Framer Motion，动画质感强
  - 组件以"复制粘贴"方式使用（不依赖额外安装，直接拷源码）
  - 覆盖卡片、英雄区、动效元素等常用 UI
- 适用：需要 Tailwind + Framer Motion 实现的高级动效 UI 组件

## 3. UI Verse（Uiverse）

- 官网：https://uiverse.io/
- 开源仓库：https://github.com/uiverse-io/galaxy
- 定位：**社区驱动的开源 UI 元素库**，4000+ CSS / Tailwind 元素，全部免费可复制
- 特点：
  - 规模最大，元素最杂，纯 CSS 或 Tailwind 实现
  - 社区贡献，质量参差但胜在种类丰富
  - 很多是小而美的按钮、卡片、加载动效、输入框等单元素
- 适用：快速找一个具体小元素的样式参考（按钮、开关、加载动画等）

---

## 使用建议

- **优先 Aceternity UI**：它与本项目技术栈（React + Tailwind + Framer Motion）最契合，动画质感最好。
- **React Bits**：需要复杂动画/交互组件时看。
- **UI Verse**：找单个小元素的精致样式时看（按钮/开关/加载等）。
- 遵循项目规范：**优先用成熟方案（shadcn 等已内建组件），不从零手动实现**；参考网站主要用于补足 shadcn 没有的高级动效。
