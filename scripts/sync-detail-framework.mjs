// 把详情页「框架三件套」（shell.html / detail.js / detail.css）+ vendor 同步到运行目录。
//
// 为什么需要它（2026-09-18 踩过两次同类）：详情页的版面文件有**两份** ——
//   源：scripts/detail-pages/（改这里，进 git）
//   运行：<详情根>/_shared/（两端（桌面端 gameServer.ts / 网站端 server.mjs）都从这里读）
// 改完源码不同步的话：git 里是新的、界面上是旧的，而且**不报错**，只是"怎么改都没反应"。
// （同一轮里 themeLibraryStatic.ts 就是因为没有这条链而停留在旧色值。）
//
// 用法：node scripts/sync-detail-framework.mjs
//       npm run detail:sync
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const SRC_DIR = path.join(HERE, "detail-pages");

/**
 * 详情页根目录：与 `electron/core/paths.ts` 的 `gamesHtmlDir()` **同语义**（不写死路径）：
 *   · config.json 的 **`settings.gameDetailsDir`**（⚠️ 在 settings 下，不是顶层）；
 *   · 空 / 未配置 → `<数据根>/Game_Details`（开发态数据根 = 仓库根，与 configRoot() 的 dev 回退一致）；
 *   · 相对路径 → 以 appRoot（开发态 = 仓库根）为基准；
 *   · 绝对路径 → 原样。
 * 解析规则的正主是 shared/pathConfig.ts（TS，脚本 import 不了），所以这里按同样语义重写一遍 ——
 * 只做"目录名"这一层，够用且不引依赖。
 */
function detailsRoot() {
  const cfgPath = path.join(REPO, "config.json");
  let raw;
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    raw = cfg?.settings?.gameDetailsDir;
  } catch (e) {
    console.error(`读不到 ${cfgPath}：${e?.message ?? e}`);
    process.exit(1);
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    console.log("config.json 的 settings.gameDetailsDir 未配置 → 用默认 <数据根>/Game_Details");
    return path.join(REPO, "Game_Details");
  }
  const dir = raw.trim();
  return path.isAbsolute(dir) ? dir : path.resolve(REPO, dir);
}

/** 递归复制（保留目录结构）。 */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

const target = path.join(detailsRoot(), "_shared");
fs.mkdirSync(target, { recursive: true });

const files = [];
for (const f of ["shell.html", "detail.js", "detail.css"]) {
  fs.copyFileSync(path.join(SRC_DIR, f), path.join(target, f));
  files.push(f);
}
// vendor（PhotoSwipe / Splide）只在源目录有更新时才需要，但复制成本极低，一并同步省心。
if (fs.existsSync(path.join(SRC_DIR, "vendor"))) {
  copyDir(path.join(SRC_DIR, "vendor"), path.join(target, "vendor"));
  files.push("vendor/");
}

console.log(`已同步到 ${target}`);
console.log(`  ${files.join("  ")}`);
console.log("提示：详情页资源是从这个目录实时读的，桌面端**不用重编译主进程**，重新加载页面即可生效。");
