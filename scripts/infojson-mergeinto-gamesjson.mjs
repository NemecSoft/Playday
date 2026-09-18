// 用每个游戏目录里的 info.json 补齐 games.json 里空着的字段。
//
// 由来（2026-09-18 用户要求："你先用info.json补齐一下games.json，然后以后就用games.json啦"）：
// 详情页要从库里取「版本 / 简介 / 原名」，但实测 1285 个游戏里库里只有
//   version 140 个、description 794 个  —— 而 info.json 里 description 1285/1285、version 1184/1285。
// 所以先把 info.json 的数据并进库里（games.json 是权威库的人工编辑镜像，见 docs/design/library-json.md），
// 之后只认 games.json 一个数据源。
//
// 三条原则：
//   1. **只补空值**：库里已经有值的字段一个字都不动（不覆盖权威数据）；info.json 侧空值也不写。
//   2. **只改那几行**：不做"解析后整体重排"。按每个游戏自己的 `"id"` 值切块，只替换
//      `"version": null,` 这种空值行 —— 手改过的缩进、空行、字段顺序全部保留，
//      git diff 里只会出现"补进去的那几行"，好审。
//   3. info.json 只读，绝不回写。
//
// ⚠️ games.json **不在 git 里**（.gitignore 第 102 行 `dev-data/*` 把它忽略了），所以这里的改动
//    没有 git 版本可回退。改坏了从权威库重新导出即可：`npm run db:export -- --force`
//    （导出默认在"文件与库不一致"时拒绝，`--force` 才覆盖 —— 代价是丢掉 JSON 里手改过、还没回写的内容）。
//
// 补哪些字段（就是详情页要用的那三个；region 库里已有 1284 个、info.json 里也没有，不碰）：
//   version ← info.version        （库里 140 → 预期 ~1184）
//   description ← info.description（库里 794 → 预期 ~1285）
//   origin_name ← info.origin_name（库里 1191 → 预期 ~1270）
//
// 用法：
//   node scripts/infojson-mergeinto-gamesjson.mjs          # 预览（默认，不写盘）
//   node scripts/infojson-mergeinto-gamesjson.mjs --apply  # 真正写入 dev-data/library-json/games.json
//
// 写进库（让客户端也看到）走既有那条链，别另开：
//   双击 libraryjson-importto-librarydb.bat（会先预览、确认、自动备份原库）
//
// 目标目录默认取 path-modes.json 的 dev.gameDetailsDir（"路径不许写死"是硬约定）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const APPLY = process.argv.includes("--apply");

const GAMES_JSON = path.join(REPO_ROOT, "dev-data", "library-json", "games.json");

/** 要补的字段：库里目标键名 ← info.json 里的来源键名。 */
const FIELDS = [
  { key: "version", from: "version" },
  { key: "description", from: "description" },
  { key: "origin_name", from: "origin_name" },
];

/** 目标根目录：默认 path-modes.json 的 dev.gameDetailsDir。 */
function detailsRoot() {
  const i = process.argv.indexOf("--dir");
  if (i >= 0 && process.argv[i + 1]) return path.resolve(process.argv[i + 1]);
  const modes = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "path-modes.json"), "utf8"));
  const v = modes?.modes?.dev?.gameDetailsDir;
  const dir = Array.isArray(v) ? v[0] : v;
  if (!dir) throw new Error("path-modes.json 里没有 modes.dev.gameDetailsDir");
  return path.resolve(REPO_ROOT, dir);
}

const ROOT = detailsRoot();

/** 值算不算"有内容"：null / undefined / 空串 / 全空白 = 空。 */
function isEmpty(v) {
  return v == null || String(v).trim() === "";
}

const text = fs.readFileSync(GAMES_JSON, "utf8");
const games = JSON.parse(text);
const lines = text.split(/\r?\n/);

// ---- 先把每个游戏的 info.json 读进来（只读，读不到就跳过它）----
const infos = games.map((g) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, String(g.name), "info.json"), "utf8"));
  } catch {
    return null;
  }
});

// ---- 切块：按**每个游戏自己的 id 值**找锚点 ----
// 不能按行首 `"id":` 切 —— actions / other_tasks 这些嵌套对象里也有 "id"（第一版就是这么栽的：
// 1285 个游戏切出了 2610 块）。按 id 的值找就不会撞上。
const anchors = games.map((g) => lines.findIndex((l) => l.trim() === `"id": ${JSON.stringify(g.id)},`));
const missing = anchors.findIndex((n) => n < 0);
if (missing >= 0) {
  console.error(`中止：第 ${missing + 1} 个游戏（${games[missing].name}）的 id 行找不到，切块不可靠。`);
  process.exit(1);
}
for (let i = 1; i < anchors.length; i++) {
  if (anchors[i] <= anchors[i - 1]) {
    console.error(`中止：id 行的位置顺序与数组顺序不一致（第 ${i + 1} 个），不敢按行改。`);
    process.exit(1);
  }
}
const blocks = anchors.map((start, i) => ({
  start,
  end: i + 1 < anchors.length ? anchors[i + 1] : lines.length,
}));

// ---- 补空值（记录补了哪些，复核时只认这些）----
const stats = Object.fromEntries(FIELDS.map((f) => [f.key, 0]));
const patched = []; // { game: i, key, value }
const samples = [];
games.forEach((game, i) => {
  const info = infos[i];
  if (!info) return;
  const { start, end } = blocks[i];
  for (const f of FIELDS) {
    const incoming = info[f.from];
    if (isEmpty(incoming)) continue;
    // 只在库里那一行是 null / 空串时才补（有值的一律不动）
    const lineRe = new RegExp(`^(\\s*"${f.key}":\\s*)(null|"")(\\s*,?)\\s*$`);
    for (let n = start; n < end; n++) {
      const m = lines[n].match(lineRe);
      if (!m) continue;
      const value = String(incoming).trim();
      const json = JSON.stringify(value);
      if (samples.length < 6) samples.push(`${game.name}: ${f.key} ${lines[n].trim()} → ${json}`);
      lines[n] = `${m[1]}${json}${m[3]}`;
      stats[f.key]++;
      patched.push({ game: i, key: f.key, value });
      break;
    }
  }
});

const out = lines.join("\n");
const changed = out !== text;

// ---- 复核：把补完的结果解析一遍，逐条核对"补的那几处"值对不对 ----
// 只靠文本替换的风险是"把 A 的简介补到 B 上"（切块错位）—— 那一步文件仍能解析，但内容是错的。
// 所以这里用解析结果兜底：对不上就中止，不写盘。
const parsedOut = JSON.parse(out); // 顺带证明补完仍是合法 JSON
let mismatched = 0;
for (const p of patched) {
  const got = parsedOut[p.game]?.[p.key];
  if (typeof got !== "string" || got !== p.value) mismatched++;
}
if (mismatched > 0) {
  console.error(`中止：复核发现 ${mismatched} 处值对不上（切块可能错位），没有写盘。`);
  process.exit(1);
}

const infoMissing = infos.filter((x) => x === null).length;

console.log(`games.json: ${GAMES_JSON}`);
console.log(`目标目录(info.json): ${ROOT}`);
console.log(`游戏数: ${games.length} ｜ 读不到 info.json: ${infoMissing} 个`);
console.log(`模式: ${APPLY ? "执行（真正写入）" : "预览（不写盘）"}`);
console.log("--- 各字段补了多少行（只统计原来为空的）---");
for (const f of FIELDS) console.log(`  ${f.key.padEnd(12)} ${stats[f.key]}`);
console.log(`复核: ${patched.length} 处全部一致 ｜ 文件是否变化: ${changed ? "是" : "否（已经补过了）"}`);
if (samples.length) {
  console.log("--- 样例 ---");
  samples.forEach((s) => console.log("  " + s));
}
if (APPLY && changed) {
  fs.writeFileSync(GAMES_JSON, out, "utf8");
  console.log("\n已写入 games.json。让它进权威库：双击 libraryjson-importto-librarydb.bat（会先预览+备份）。");
} else if (!APPLY) {
  console.log("\n确认没问题就加 --apply 真正写入。");
}
