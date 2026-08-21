// 探测 d:\Addons 里 info.json 的 version 字段 和 index.html 里版本信息的结构变体，
// 确定"只保留版本号（| 第一段）"的清理规则是否安全。只读不修改。
import * as fs from "fs";
import * as path from "path";

const ROOT = "D:/Addons";
const infoVerSet = new Map(); // 去重 version 字段值
const htmlPatterns = new Map(); // 去重 index.html 版本相关行模式
let infoTotal = 0;
let infoWithPipe = 0;
let htmlHasVersion = 0;
let htmlTotal = 0;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name === "info.json") {
      infoTotal++;
      const m = fs.readFileSync(p, "utf8").match(/"version":\s*"([^"]*)"/);
      if (m) {
        const v = m[1];
        if (v.includes("|")) infoWithPipe++;
        const first = v.split("|")[0];
        const key = `${v.includes("|") ? "含|" : "无|"}|${first}`;
        if (!infoVerSet.has(key)) infoVerSet.set(key, []);
        infoVerSet.get(key).push(p);
      }
    } else if (e.isFile() && e.name === "index.html") {
      htmlTotal++;
      const c = fs.readFileSync(p, "utf8");
      // 版本信息是否出现在 <td>版本</td> 或 <h2>版本信息</h2> 附近
      const hasTd = c.includes("<td>版本</td>");
      const hasH2 = c.includes("<h2>版本信息</h2>");
      const verLine = c.match(/<td>版本<\/td><td>[^<]*<\/td>/);
      if (hasTd || hasH2 || verLine) htmlHasVersion++;
    }
  }
}
walk(ROOT);

console.log(`info.json 总数: ${infoTotal}, 含"|"的: ${infoWithPipe}`);
console.log(`index.html 总数: ${htmlTotal}, 含版本表格/版本信息的: ${htmlHasVersion}`);
console.log(`\n--- info.json version 第一段去重变体(前40) ---`);
let i = 0;
for (const [key, locs] of infoVerSet) {
  if (i++ >= 40) { console.log(`  ...共 ${infoVerSet.size} 种`); break; }
  console.log(`  [${key}] 样例: ${path.relative(ROOT, locs[0])}`);
}
