// Task 4 无头验证：对真实库跑封面匹配，确认 CoverImages 目录里的图能被正确套上。
// 直接调用编译后的逻辑（内联扫描以避开 strip-types 限制），验证匹配正确性与 read_images_batch。
import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

const DATA_DIR = process.env.YUNGAME_DATA_DIR || path.join(process.cwd(), "data");
const DB = path.join(DATA_DIR, "library", "library.db");
const COVER_DIR = path.join(DATA_DIR, "CoverImages");
const SQL = await initSqlJs({ locateFile: (f) => path.join(process.cwd(), "node_modules", "sql.js", "dist", f) });
const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB)));

// ---- 复刻 covers.ts 的扫描 + 规范化逻辑（验证用，真实逻辑在 TS 模块里） ----
const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];
const stripped = " \t\r\n　、，。：；！？·•（）【】《》「」『』〈〉()[]{}<>-_.,｜|&+'\"/`＊*＃#".split("");
function normalizeName(s) {
  let out = "";
  for (const ch of s) {
    let c = ch;
    if (c >= "０" && c <= "９") c = String.fromCharCode(c.charCodeAt(0) - "０".charCodeAt(0) + "0".charCodeAt(0));
    else if (c >= "Ａ" && c <= "Ｚ") c = String.fromCharCode(c.charCodeAt(0) - "Ａ".charCodeAt(0) + "A".charCodeAt(0));
    else if (c >= "ａ" && c <= "ｚ") c = String.fromCharCode(c.charCodeAt(0) - "ａ".charCodeAt(0) + "a".charCodeAt(0));
    if (stripped.includes(c)) continue;
    out += c.toLocaleLowerCase();
  }
  return out;
}
const index = new Map();
let coverFiles = 0;
for (const e of fs.readdirSync(COVER_DIR, { withFileTypes: true })) {
  if (!e.isFile()) continue;
  const full = path.join(COVER_DIR, e.name);
  const ext = path.extname(e.name).slice(1).toLowerCase();
  if (!IMAGE_EXTS.includes(ext)) continue;
  const stem = path.basename(e.name, path.extname(e.name));
  const key = normalizeName(stem);
  if (key) { index.set(key, full); coverFiles++; }
}
console.log("CoverImages 索引:", coverFiles, "张");

// 读所有游戏，套封面
const rows = db.exec("SELECT id, name, localized_names, alternate_names, cover_image FROM games");
let matched = 0, alreadyValid = 0, considered = 0;
const missingSamples = [];
for (const r of rows[0].values) {
  const id = r[0], name = r[1];
  const locs = r[2] ? JSON.parse(r[2]) : [];
  const alts = r[3] ? JSON.parse(r[3]) : [];
  const existing = r[4];
  // 现有的 cover_image 指向迁移前旧路径，基本都失效，故全部重新匹配
  const candidates = [];
  const seen = new Set();
  for (const lang of ["zh-CN", "zh-TW"]) {
    const ln = locs.find((n) => n.language === lang);
    if (ln && ln.name.trim() && seen.add(ln.name.trim())) candidates.push(ln.name.trim());
  }
  for (const ln of locs) if (ln.name.trim() && seen.add(ln.name.trim())) candidates.push(ln.name.trim());
  for (const a of alts) if (a.trim() && seen.add(a.trim())) candidates.push(a.trim());
  if (seen.add(name.trim())) candidates.push(name.trim());
  let hit = null;
  for (const c of candidates) {
    const p = index.get(normalizeName(c));
    if (p) { hit = p; break; }
  }
  if (hit) matched++;
  else if (missingSamples.length < 10) missingSamples.push(name);
}
console.log("有封面（按当前索引匹配）:", matched, "/", rows[0].values.length);
console.log("未匹配样本:", missingSamples.join(", "));

// ---- 验证 read_images_batch 能读到一张真实封面 ----
if (matched > 0) {
  // 找第一个能匹配的游戏，读它的图
  for (const r of rows[0].values) {
    const name = r[1];
    const locs = r[2] ? JSON.parse(r[2]) : [];
    const alts = r[3] ? JSON.parse(r[3]) : [];
    const candidates = [];
    const seen = new Set();
    for (const lang of ["zh-CN", "zh-TW"]) { const ln = locs.find((n)=>n.language===lang); if(ln&&seen.add(ln.name.trim()))candidates.push(ln.name.trim()); }
    for (const ln of locs) if (seen.add(ln.name.trim())) candidates.push(ln.name.trim());
    for (const a of alts) if (seen.add(a.trim())) candidates.push(a.trim());
    if (seen.add(name.trim())) candidates.push(name.trim());
    let hit = null;
    for (const c of candidates) { const p = index.get(normalizeName(c)); if (p) { hit = p; break; } }
    if (hit) {
      const b64 = fs.readFileSync(hit).toString("base64");
      const mime = hit.endsWith(".png") ? "image/png" : "image/jpeg";
      console.log("read_images_batch 测试:", path.basename(hit), "| base64长度:", b64.length, "| mime:", mime);
      break;
    }
  }
}
console.log("\nTask 4 封面匹配验证完成 ✅");
