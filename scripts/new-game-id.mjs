// 生成一个新的**游戏 id**并复制到剪贴板 —— 给"直接在整库 JSON 里新增游戏"用。
// 双击入口 = 仓库根的 new-game-id.bat（无参数，跑完停住不关，方便你看结果）。
//
// 为什么是 UUID v4：现有 1284 行游戏的 id 全是这种形态（8-4-4-4-12、小写），
// 新增一行只要"不跟既有 id 撞车"就行。这里生成后会拿整库 JSON 里现有的 id 比一遍，
// 撞了就再生成一个（UUID 撞车概率极低，但检查一次的成本几乎为零）。
//
// 用法：
//   node scripts/new-game-id.mjs            # 生成 1 个（默认）
//   node scripts/new-game-id.mjs --count 5  # 一次生成 5 个（比如批量加游戏）
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { LIBRARY_JSON_DIR } from "./lib/libraryJson.mjs";
import { ROOT } from "./lib/devData.mjs";

const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const count = Math.max(1, Math.min(50, Number(argOf("--count", "1")) || 1));

// 读现有 id（读不到也照样生成 —— 这只是"顺手查重"，不是前置条件）
const file = path.resolve(ROOT, LIBRARY_JSON_DIR, "games.json");
const existing = new Set();
try {
  const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  const rows = Array.isArray(raw) ? raw : (raw.rows ?? []);
  for (const r of rows) if (r?.id) existing.add(String(r.id).toLowerCase());
} catch {
  /* ignore */
}

const ids = [];
while (ids.length < count) {
  const id = randomUUID();
  if (existing.has(id) || ids.includes(id)) continue; // 撞车就重来
  ids.push(id);
}

// 复制到剪贴板：clip.exe 从标准输入读（Windows 自带，不用第三方包）
const clip = spawnSync("clip", { input: ids.join("\r\n") });
const copied = clip.status === 0;

const bar = "=".repeat(64);
console.log(bar);
console.log(` 新的游戏 id（${ids.length} 个）${copied ? " —— 已复制到剪贴板，直接 Ctrl+V" : "（⚠️ 复制到剪贴板失败，请手动选上面那行）"}`);
console.log(bar);
for (const id of ids) console.log("  " + id);
console.log(bar);
if (!copied) console.log("  提示：剪贴板复制失败通常是因为 clip.exe 不可用（极少见），手动复制即可。");
console.log(" 怎么用：在整库 JSON 里新增一行游戏，把 id 粘到这一行的 \"id\" 上；");
console.log("         列名照抄旁边已有的行（snake_case），改完再回写库：");
console.log("             npm run db:import -- --apply");
console.log("         （或双击 libraryjson-importto-librarydb.bat，它会先预览再确认）");
console.log(bar);
