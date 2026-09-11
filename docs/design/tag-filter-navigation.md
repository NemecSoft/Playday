# 详情页标签点击 → 主页筛选（跨 iframe 导航）

## 一、需求背景

游戏详情页（`d:\Addons` 里的 1280 个静态 HTML）顶部有一个**标签云**（如"冒险 / 奇幻 / 动作 / 单人 …"），当前是**静态展示**，点击无反应。

用户希望：**在详情页点一个标签 → 自动返回主页 → 主页筛选出所有带这个标签的游戏**（主页侧栏标签云显示勾选生效）。

## 二、需求确认（已与用户确认）

1. **标签点击行为**：**点即跳回筛该标签**——点击详情页某个标签，立即返回主页，主页筛选条件**设为该标签（单一标签）**。
2. **返回与提示**：**点即跳主页**——点击后自动关闭详情页跳回主页，主页侧栏显示筛选生效状态。
3. 主页本身已有的侧栏标签筛选（`toggleTag` → `selectedTags`）保持不变，详情页点击标签是**入口之一**。

## 三、技术方案

### 3.1 跨页面通信：`parent.postMessage`

详情页是主页的 **`<iframe>`**（`GameDetailPage.tsx` 用 `src={gamePageUrl}` 加载）。所以详情页和主页是**父子窗口**：

- 详情页（子 iframe）→ `window.parent.postMessage({ type: "playday-filter-by-tag", tag: "奇幻" }, "*")`
- 主页（父窗口）→ 监听 `window` 的 `message` 事件，收到该消息后：设 `selectedTags = [tag]` + 导航回主页

### 3.2 详情页 HTML 批量改造

`d:\Addons` 的 1280 个 `index.html` 标签云结构统一：
```html
<div class="tags"><span class="tag">体素</span><span class="tag">像素图形</span>...</div>
```

**用脚本批量处理**（`scripts/enable-tag-filter.mjs`，带 dry-run/--apply）：
1. 给每个 `<span class="tag">文本</span>` 加 `onclick="filterByTag('文本')"`（文本含引号时转义）。
2. 在 `</head>` 前（或 `<body>` 内）注入一段脚本：
```html
<script>
function filterByTag(tag){
  try { window.parent.postMessage({ type: "playday-filter-by-tag", tag: tag }, "*"); }
  catch(e){ console.error(e); }
}
</script>
```
3. 标签点击样式：`cursor:pointer`（`.tag` 增加 hover 效果，提示可点击）。

> **幂等**：脚本检测 `filterByTag` 已存在则跳过，重复运行不重复注入。

### 3.3 主页监听与跳转

在 **App.tsx**（或 GameDetailPage）挂一个 `message` 监听：

```ts
useEffect(() => {
  const onMsg = (e: MessageEvent) => {
    const d = e.data;
    if (d && d.type === "playday-filter-by-tag" && typeof d.tag === "string") {
      // 设为主页筛选条件（单一标签，清空搜索），并导航回主页
      useGamesStore.setState({ selectedTags: [d.tag], searchQuery: "" });
      navigate("/"); // 或主页路由
    }
  };
  window.addEventListener("message", onMsg);
  return () => window.removeEventListener("message", onMsg);
}, [navigate]);
```

- **`selectedTags = [tag]`**：单一标签筛选（对应需求 1）。
- **`navigate("/")`**：回到主页，主页侧栏自动显示勾选状态。
- 若主页路由已是首页，`navigate("/")` 不重复导航（用 router 的重复导航安全处理）。

## 四、安全注意

- `parent.postMessage` 用 `"*"` 目标源（详情页 HTTP origin 未知）；主页端校验 `e.data.type === "playday-filter-by-tag"` 白名单 + `typeof tag === "string"`，避免误收其它消息。
- 标签文本转义：`onclick="filterByTag('...')"` 里的单引号 / HTML 实体需转义，避免注入/断链。

## 五、相关文件

| 文件 | 改动 |
|------|------|
| `d:\Addons\**\index.html`（1280 个） | 标签云加 onclick + 注入 filterByTag 脚本（脚本批量） |
| `src/App.tsx`（或 GameDetailPage） | 监听 message，设 selectedTags + 导航主页 |
| `src/styles/global.css` | `.tag` 加 cursor:pointer / hover 提示可点击（详情页 CSS 在 HTML 内，脚本可顺带注入样式） |
| `scripts/enable-tag-filter.mjs` | 批量改造详情页 HTML 的脚本（新增） |

## 六、实现步骤

1. 写 `scripts/enable-tag-filter.mjs`，dry-run 确认标签云结构。
2. `--apply` 批量改 1280 个 HTML（加 onclick + 注入脚本 + 样式）。
3. 主页 App.tsx 加 message 监听 + 导航。
4. 验证：点详情页标签 → 返回主页 → 侧栏显示该标签勾选、游戏列表筛选出该标签游戏。
