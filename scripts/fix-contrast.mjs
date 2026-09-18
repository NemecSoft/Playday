// 修复 themeLibrary.ts 里"不合适"的配色 —— **MD3 色调体系版**（2026-09-18 重写）。
//
// 改了什么、为什么：
//   旧版修对比度的办法是"RGB 三个通道每步各 ±2 硬拖"（best = [r+d, g+d, b+d]），
//   **不保色相**：酒红被拖成灰粉、金色被拖成土黄 —— 越修越脏，这正是"不合适"的来源。
//   现在一切走 scripts/lib/md3Color.mjs：**只改色调（tone），色相与彩度原样保留**，
//   而且是"刚好够就停"（多挪一档就不达标，见 lib 的 fitTone 与它的测试）。
//
// 三类规则（前两类是修，第三类只提示）：
//   ① 文字可读性：对比度不足 → 沿色调挪到刚好达标（含 primaryForeground ——
//      旧版直接跳过了它，理由是"浅主色按钮上无解"，走 tone 就有解）。
//   ② 语义色撞车：success/warning/danger 与 accent 的感知色差 < 12（实测 wow / lol / pubg
//      把 warning 直接写成与 accent 同值）→ 归位到 MD3 的固定色相（见 SEMANTIC_HUE）。
//   ③ MD3 角色偏离：各角色 tone 与 ROLE_TONES 对照表的差距，只打印，不自动改
//      （表面色阶属于"设计取向"，交给设计者判断）。
//   ④ 边框看不见：border 与它所在的表面色调间距 < 8（MD3 的判据：边框本来对比度就低，
//      但**色调必须拉开一档**）→ 推离到能看见为止。
//
// 用法：
//   node scripts/fix-contrast.mjs            # 空跑：只打印将改的值（默认）
//   node scripts/fix-contrast.mjs --apply    # 真写回文件
//   node scripts/fix-contrast.mjs --only p-wow    # 只处理某个配色
import * as fs from "fs";
import {
  atHue,
  contrast,
  deltaE,
  fitTone,
  fitToneSeparation,
  isDark,
  ROLE_TONES,
  SEMANTIC_HUE,
  toneOf,
  withTone,
} from "./lib/md3Color.mjs";

const FILE = "d:/AI/Code/Playnite/Playday/src/utils/themeLibrary.ts";
const APPLY = process.argv.includes("--apply");
const ONLY = (() => {
  const i = process.argv.indexOf("--only");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const src = fs.readFileSync(FILE, "utf8");

/** 解析每个配色：id + palette 键值（沿用旧版的按 id 分段解析）。 */
const palettes = [];
const segments = src.split(/id:\s*"([^"]+)"/).slice(1);
for (let i = 0; i < segments.length; i += 2) {
  const id = segments[i];
  const body = segments[i + 1] || "";
  const pm = body.match(/palette:\s*\{([\s\S]*?)\n\s*\},/);
  if (!pm) continue;
  const kv = {};
  for (const m of pm[1].matchAll(/(\w+):\s*"(#[0-9a-fA-F]{6})",?/g)) kv[m[1]] = m[2];
  palettes.push({ id, body, kv });
}

/** 保持原值的大小写风格（#FFCC00 就该回到大写，免得整文件出无意义的 diff）。 */
function sameCase(next, template) {
  return /[A-F]/.test(template) ? next.toUpperCase() : next.toLowerCase();
}

/** 文字可读性规则：[键, 它可能落在哪些背景上, 目标对比度]。 */
const TEXT_RULES = [
  ["textPrimary", ["bgBase", "card"], 4.5],
  ["foreground", ["background"], 4.5],
  ["textSecondary", ["bgBase", "card"], 4.0],
  ["textDim", ["bgBase", "card"], 3.0],
  ["mutedForeground", ["muted"], 4.5],
  ["secondaryForeground", ["secondary"], 4.5],
  ["primaryForeground", ["primary"], 4.5],
];

/** 边框与它所在表面之间至少要拉开的色调间距（MD3 的"看得见"下限）。 */
const BORDER_MIN_SEP = 8;

const changes = [];
const md3Deviations = [];
/** 到色调两端都换不出达标色的（不是漏改，是这个配色本身无解，单列出来给人看）。 */
const unsolvable = [];

for (const p of palettes) {
  if (ONLY && p.id !== ONLY) continue;
  const kv = p.kv;
  const mode = isDark(kv.bgBase || kv.background || "#000") ? "dark" : "light";
  const edits = [];

  // ---- ① 文字可读性 ----
  for (const [key, bgKeys, target] of TEXT_RULES) {
    const text = kv[key];
    if (!text) continue;
    const bgs = bgKeys.map((k) => kv[k]).filter(Boolean);
    if (bgs.length === 0) continue;
    const minNow = Math.min(...bgs.map((b) => contrast(text, b)));
    if (minNow >= target) continue;
    const { color, moved } = fitTone(text, bgs, target);
    // 挪了 tone 却换不出新色（两端都到顶了）= 这条规矩在这个配色里无解，
    // 不要报成"改成了同色"那种假改动 —— 直接跳过并记一笔。
    if (color.toLowerCase() === text.toLowerCase()) {
      unsolvable.push(`${p.id}.${key}（${minNow.toFixed(2)}:1，已到色调两端）`);
      continue;
    }
    const after = Math.min(...bgs.map((b) => contrast(color, b)));
    edits.push({ key, from: text, to: color, reason: `文字可读 ${minNow.toFixed(2)}→${after.toFixed(2)}（tone 挪 ${moved}）` });
  }

  // ---- ② 语义色撞车 ----
  for (const key of Object.keys(SEMANTIC_HUE)) {
    const cur = kv[key];
    const acc = kv.accent;
    if (!cur || !acc) continue;
    if (deltaE(cur, acc) >= 12) continue; // 本来就能一眼区分，不动
    let next = atHue(cur, SEMANTIC_HUE[key]);
    let note = `语义色归位 MD3 色相 ${SEMANTIC_HUE[key]}°`;
    if (deltaE(next, acc) < 12) {
      // accent 本身就在这个色相附近（例如绿色品牌色 + 成功色）→ 改在 tone 上拉开
      const dir = toneOf(next) >= toneOf(acc) ? 1 : -1;
      const t = Math.max(0, Math.min(100, toneOf(acc) + dir * 15));
      next = withTone(next, t);
      note = `语义色与 accent 同色相，tone 拉开到 ${t.toFixed(0)}`;
    }
    // 换完还是原色（它本来就在该色相上、tone 也已在位）→ 别报成"改成了同色"的假改动
    if (next.toLowerCase() === cur.toLowerCase()) continue;
    edits.push({ key, from: cur, to: next, reason: `${note}（与 accent 色差 ${deltaE(cur, acc).toFixed(1)}）` });
  }

  // ---- ④ 边框看不见 ----
  const border = kv.border;
  if (border) {
    const surfaces = ["bgBase", "card", "bgPanel"].map((k) => kv[k]).filter(Boolean);
    const minSep = surfaces.length
      ? Math.min(...surfaces.map((s) => Math.abs(toneOf(border) - toneOf(s))))
      : Infinity;
    // 留 0.5 的容差：hex 是 8bit，算出来 7.9xx 会被显示成"间距 8→8"这种假改动，
    // 而且每跑一次就微调一点点，**永远收敛不了**（2026-09-18 实测：应用完还剩 1 处，来回抖）。
    if (minSep < BORDER_MIN_SEP - 0.5) {
      const { color } = fitToneSeparation(border, surfaces, BORDER_MIN_SEP);
      if (color.toLowerCase() !== border.toLowerCase()) {
        edits.push({ key: "border", from: border, to: color, reason: `边框与表面色调间距 ${minSep.toFixed(1)}→${BORDER_MIN_SEP}` });
      }
    }
  }

  // ---- ③ MD3 角色偏离（只提示）----
  const table = ROLE_TONES[mode];
  for (const [key, want] of Object.entries(table)) {
    const v = kv[key];
    if (!v) continue;
    const dev = Math.abs(toneOf(v) - want);
    if (dev >= 12) md3Deviations.push({ id: p.id, key, tone: toneOf(v), want, dev });
  }

  if (edits.length) changes.push({ palette: p, mode, edits });
}

// ---- 打印 ----
for (const c of changes) {
  console.log(`\n${c.palette.id}（${c.mode === "dark" ? "暗色" : "亮色"}）`);
  for (const e of c.edits) {
    console.log(`   ${e.key}: ${e.from} -> ${sameCase(e.to, e.from)}   ${e.reason}`);
  }
}
const total = changes.reduce((s, c) => s + c.edits.length, 0);
console.log(
  `\n共 ${total} 处待调整（${changes.length} 个配色，扫描 ${palettes.length} 个）${APPLY ? " —— 已写入" : " —— 空跑，加 --apply 才写"}`,
);

if (md3Deviations.length) {
  const byId = new Map();
  for (const d of md3Deviations) {
    if (!byId.has(d.id)) byId.set(d.id, []);
    byId.get(d.id).push(d);
  }
  console.log(`\n【仅提示】${md3Deviations.length} 处角色 tone 与 MD3 对照表差距 ≥12（表面色阶属设计取向，不自动改）：`);
  for (const [id, list] of byId) {
    console.log(`   ${id}: ${list.map((d) => `${d.key} tone ${d.tone.toFixed(0)}（MD3 ${d.want}）`).join("、")}`);
  }
}
if (unsolvable.length) {
  console.log(`\n【无解】以下文字色到色调两端仍不达标（主色本身太亮/太暗，需人工换色）：`);
  for (const s of unsolvable) console.log(`   ${s}`);
}
if (ONLY && !changes.length) console.log(`（--only ${ONLY} 没有需要改的）`);

// ---- 写回 ----
if (APPLY) {
  let out = src;
  let missed = 0;
  for (const c of changes) {
    for (const e of c.edits) {
      const to = sameCase(e.to, e.from);
      // **按 id 锚定、原地替换**：从 `id: "p-xxx"` 往后找该键的第一次出现。
      // 为什么必须锚定：同一个色值会在多个配色里出现（如 border "#3A3A3A"），
      // 不锚定就会误改到别的配色头上。
      //
      // ⚠️ 千万别用旧版那种 `src.split(/id:\s*"(...)"` 再 join 的写法：
      //    split 会把分隔符里的 `id: "` 和结尾那个 `"` 一并吃掉，join 回去就变成
      //    `p-playnite,` —— 直接把文件写成语法错误（2026-09-18 踩过，靠 npm run check 抓到）。
      const re = new RegExp(
        `(id:\\s*"${c.palette.id}"[\\s\\S]*?${e.key}:\\s*")${e.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(")`,
      );
      if (!re.test(out)) {
        missed++;
        console.warn(`[跳过] ${c.palette.id}.${e.key}: 没匹配到 ${e.from}`);
        continue;
      }
      out = out.replace(re, `$1${to}$2`);
    }
  }
  fs.writeFileSync(FILE, out, "utf8");
  console.log(`已写回 themeLibrary.ts${missed ? `（${missed} 处未匹配，见上）` : ""}。`);
}
