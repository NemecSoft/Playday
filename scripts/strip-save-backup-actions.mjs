// 把整库 JSON 里「备份游戏存档」这类动作删掉（2026-09-17 用户要求：这个不要了）。
//
// 用法：
//   node scripts/strip-save-backup-actions.mjs            # 预览：只统计，不写文件
//   node scripts/strip-save-backup-actions.mjs --apply    # 真写（改之前自动留一份 .bak-strip-*）
//
// 判据与 scripts/playnite-savepaths.mjs **完全一致**：按 action.path 里含 `GameSaveHelper` 识别，
// 而不是按名字（实测 1283 个游戏里这个名字有 8 种变体甚至误写，"路径判据是名字判据的超集"）。
// 所以它只会删这一件事 —— "开始游戏"等其它动作一个都不碰。
//
// 删完还要回写库才生效：npm run db:import -- --apply（或双击 libraryjson-importto-librarydb.bat）。
import fs from "node:fs";
import path from "node:path";
import { LIBRARY_JSON_DIR } from "./lib/libraryJson.mjs";
import { ROOT } from "./lib/devData.mjs";
import { isSaveBackupAction } from "./playnite-savepaths.mjs";

const APPLY = process.argv.includes("--apply");
const FILE = path.resolve(ROOT, LIBRARY_JSON_DIR, "games.json");

if (!fs.existsSync(FILE)) {
  console.error(`❌ 找不到 ${FILE}\n   （整库 JSON 的目录见 scripts/lib/libraryJson.mjs）`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(FILE, "utf-8"));
const rows = Array.isArray(raw) ? raw : (raw.rows ?? Object.values(raw).find(Array.isArray));
if (!Array.isArray(rows)) {
  console.error("❌ 认不出 games.json 的行结构（既不是数组，也没有 rows 数组）—— 已中止，没动文件。");
  process.exit(1);
}

/** 一行的 actions 可能是 JSON 字符串、也可能是数组 —— 两种都收，并按原样写回。 */
const parseActions = (v) => {
  if (!v) return null;
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const a = JSON.parse(v);
      return Array.isArray(a) ? a : null;
    } catch {
      return null;
    }
  }
  return null;
};

let gamesHit = 0;
let removed = 0;
let emptied = 0;
const samples = [];
// 两种字段命名都要认：LiteDB 导出的动作是 `Path`（大写），整库 JSON 里是 `path`（小写）。
// playnite-savepaths 的判据只认它那边的写法，所以这里补一条同样宽的判断，避免漏删。
const isSaveAction = (a) => isSaveBackupAction(a) || /gamesavehelper/i.test(String(a?.path ?? a?.Path ?? ""));

for (const r of rows) {
  const arr = parseActions(r.actions);
  if (!arr) continue;
  const kept = arr.filter((a) => !isSaveAction(a));
  if (kept.length === arr.length) continue;
  const n = arr.length - kept.length;
  gamesHit++;
  removed += n;
  if (kept.length === 0) emptied++;
  if (samples.length < 5) samples.push(`  · ${r.name}：删 ${n} 条，剩 ${kept.length} 条`);
  if (APPLY) r.actions = typeof r.actions === "string" ? JSON.stringify(kept) : kept;
}

console.log("=".repeat(72));
console.log(` 清理「备份游戏存档」动作${APPLY ? "" : "  —— 预览模式：不会写文件"}`);
console.log("=".repeat(72));
console.log(` 文件      ：${path.relative(ROOT, FILE)}`);
console.log(` 总行数    ：${rows.length}`);
console.log(` 会动到的  ：${gamesHit} 款游戏（共删 ${removed} 条动作）`);
console.log(` 删完没动作剩的：${emptied} 款（actions 会变成空数组，不是删字段）`);
for (const s of samples) console.log(s);
console.log("-".repeat(72));

if (!APPLY) {
  console.log(" 预览结束。确认无误后加 --apply 真写（会先留一份 .bak-strip-* 备份）。");
  console.log(" 写完记得回写库：npm run db:import -- --apply");
  process.exit(0);
}

const backup = `${FILE}.bak-strip-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;
fs.copyFileSync(FILE, backup);
fs.writeFileSync(FILE, JSON.stringify(raw, null, 2) + "\n", "utf-8");
console.log(` ✅ 已写入 ${path.relative(ROOT, FILE)}（删了 ${removed} 条）`);
console.log(` ✅ 备份：${path.relative(ROOT, backup)}`);
console.log("");
console.log(" 下一步：npm run db:import -- --apply   （回写进权威库，客户端才会看到）");
console.log("=".repeat(72));
