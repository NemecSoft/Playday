// 把"手写的极简简介"合并进**游戏内容总表** data/game-content.json，并自动校验风格。
//
// 正式数据文件是 data/game-content.json（人工维护、纳入 git）；本脚本只是"批量写"的工具：
//   data/batches/*.json（一批一个小文件的 {"游戏名": "简介"}）→ 合并进总表的 intro 字段。
// 为什么按批写：总表上千条，每批都整体重写一遍既费时又容易出错；批次小文件更适合逐批产出。
//
// ⚠️ 优先级：总表是唯一事实源。本脚本会把批次里的值**写进** intro（这就是它的用途），
//    所以**不要**把手工改过的条目同时留在批次文件里 —— 那会在下次合并时被批次值覆盖。
//    手工修改请直接改 data/game-content.json。
//
// 风格校验（不通过就退出码 1，不写文件）：
//   1) 简介里不得出现游戏名（全名，或名字里 "：" / "-" 之前的主干）；
//   2) 长度 6..48 字；3) 不许为空；4) 不许有 markdown/换行。
//
// 用法：
//   node scripts/merge-authored-intros.mjs
//   node scripts/merge-authored-intros.mjs --table data/game-content.json
import fs from "fs";
import path from "path";

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const root = process.cwd();
const TABLE = argOf("--table", path.join(root, "data/game-content.json"));
const BATCH_DIR = argOf("--batches", path.join(root, "data/batches"));

const normName = (s) =>
  String(s ?? "")
    .replace(/[\u200b-\u200f\ufeff\u00a0]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** 名字的主干：去掉 "：" / ":" / "-" 之后的限定后缀（"星露谷物语-网吧联机版" → "星露谷物语"）。 */
const coreOf = (name) => {
  const core = String(name).split(/[：:\-]/)[0].trim();
  return core.length >= 2 ? core : String(name).trim();
};

// 批次文件（没有就直接返回：说明内容已全部并入总表，这是正常状态）
const batchFiles = fs.existsSync(BATCH_DIR)
  ? fs.readdirSync(BATCH_DIR).filter((f) => f.endsWith(".json")).sort()
  : [];
if (!batchFiles.length) {
  console.log(`没有批次文件（${path.relative(root, BATCH_DIR)} 为空或不存在）—— 内容已全部并入总表，无需合并。`);
  process.exit(0);
}

const table = JSON.parse(fs.readFileSync(TABLE, "utf-8"));
const authored = {};
for (const f of batchFiles) {
  Object.assign(authored, JSON.parse(fs.readFileSync(path.join(BATCH_DIR, f), "utf-8")));
}
console.log(`读到手写批次 ${batchFiles.length} 个：${batchFiles.join(", ")}`);

const authoredByNorm = new Map();
for (const [k, v] of Object.entries(authored)) authoredByNorm.set(normName(k), { name: k, intro: String(v) });

const problems = [];
let applied = 0;
const stillCrawled = [];
const stillEmpty = [];

for (const row of table) {
  const hit = authoredByNorm.get(normName(row.name));
  if (!hit) {
    (row.intro ? stillCrawled : stillEmpty).push(row.name);
    continue;
  }
  const intro = hit.intro.replace(/\s+/g, " ").trim();

  if (!intro) problems.push(`${row.name}: 简介为空`);
  if (/[#*`\n]/.test(intro)) problems.push(`${row.name}: 简介里有 markdown/换行字符`);
  if (intro.length < 6) problems.push(`${row.name}: 太短（${intro.length} 字）`);
  if (intro.length > 48) problems.push(`${row.name}: 太长（${intro.length} 字）`);
  const core = coreOf(row.name);
  if (core.length >= 2 && normName(intro).includes(normName(core))) {
    problems.push(`${row.name}: 简介里重复了游戏名（出现了 "${core}"）→ ${intro}`);
  }

  row.intro = intro;
  applied++;
}

// 写了但表里没有的名字（拼错/游戏已不在清单）
const tableNames = new Set(table.map((r) => normName(r.name)));
const orphanAuthored = Object.keys(authored).filter((k) => !tableNames.has(normName(k)));

if (problems.length) {
  console.error(`✗ 风格校验未通过（${problems.length} 条）：`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

fs.writeFileSync(TABLE, JSON.stringify(table, null, 2), "utf-8");
console.log(`✓ 已合并手写简介 ${applied} 条 → ${path.relative(root, TABLE)}`);
console.log(`  还未重写：仍是长文案 ${stillCrawled.length} 条 / 本来就缺 ${stillEmpty.length} 条`);
if (orphanAuthored.length) {
  console.log(`  手写文件里有、总表里没有的游戏名 ${orphanAuthored.length} 个（拼错？已从清单移除？）：`);
  for (const n of orphanAuthored) console.log(`    · ${n}`);
}
