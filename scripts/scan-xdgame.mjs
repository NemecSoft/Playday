// 探测 d:\Addons 下所有 index.html / info.json 里 xdgame 相关内容的变体，
// 只读不修改，用于确定后续批量清理脚本的精确规则。
import * as fs from "fs";
import * as path from "path";

const ROOT = "D:/Addons";
const KEYWORDS = /xdgame|XDGAME|Game Library|信息整理自|来源|video-wrap|游戏视频/;

// 收集去重后的"行模式"（去掉了每行的缩进，方便看变体）
const patterns = new Map();
let fileCount = 0;
let htmlCount = 0;
let jsonCount = 0;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && (e.name === "index.html" || e.name === "info.json")) {
      fileCount++;
      const content = fs.readFileSync(p, "utf8");
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (KEYWORDS.test(line)) {
          const kind = e.name === "index.html" ? "HTML" : "JSON";
          const key = `${kind}|${line}`;
          if (!patterns.has(key)) patterns.set(key, []);
          patterns.get(key).push(`${path.relative(ROOT, p)}:${i + 1}`);
          if (kind === "HTML") htmlCount++;
          else jsonCount++;
        }
      }
    }
  }
}
walk(ROOT);

console.log(`扫描文件数: ${fileCount}`);
console.log(`含关键词行数: html=${htmlCount} json=${jsonCount}`);
console.log(`去重后的行模式数: ${patterns.size}\n`);
let n = 0;
for (const [key, locs] of patterns) {
  n++;
  console.log(`--- 模式${n} (出现${locs.length}次) ---`);
  console.log(key.split("|")[0] + " 行: " + key.split("|").slice(1).join("|"));
  console.log(`  样例位置: ${locs.slice(0, 3).join(", ")}${locs.length > 3 ? " ..." : ""}`);
}
