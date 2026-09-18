// 清理 d:\Addons 里的 version 字段：只保留版本号，去掉容量/简体中文/支持键鼠/赠品等。
// 规则：version 值按 "|" 拆分，只保留第一段（版本标识），其余段丢弃。
//   info.json  : "version": "v20250417|容量1.07GB|官方简体中文|支持键盘.鼠标.手柄"
//                -> "version": "v20250417"
//   index.html : <td>版本</td><td>v20250417|容量1.07GB|...|...</td>
//                -> <td>版本</td><td>v20250417</td>
// 用法：node scripts/clean-version.mjs         # dry-run
//       node scripts/clean-version.mjs --apply # 真正修改
import * as fs from "fs";
import * as path from "path";

const ROOT = "D:/Addons";
const APPLY = process.argv.includes("--apply");

// info.json："version": "..."  -> 保留第一段
function simplifyInfoJson(content) {
  return content.replace(/("version":\s*")([^"]*)(")/g, (whole, pre, val, post) => {
    const first = val.split("|")[0];
    return pre + first + post;
  });
}

// index.html：<td>版本</td><td>...</td>  -> 保留第一段
function simplifyHtmlVersion(content) {
  return content.replace(/(<td>版本<\/td><td>)([^<]*)(<\/td>)/g, (whole, pre, val, post) => {
    const first = val.split("|")[0];
    return pre + first + post;
  });
}

let infoChanged = 0;
let infoSimplified = 0;
let htmlChanged = 0;
let htmlSimplified = 0;
const sample = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name === "info.json") {
      const c = fs.readFileSync(p, "utf8");
      const out = simplifyInfoJson(c);
      if (out !== c) {
        infoChanged++;
        const before = c.match(/"version":\s*"([^"]*)"/);
        const after = out.match(/"version":\s*"([^"]*)"/);
        if (before && before[1].includes("|")) infoSimplified++;
        if (sample.length < 3) sample.push(`info.json: "${before?.[1]}" -> "${after?.[1]}" (${path.relative(ROOT, p)})`);
        if (APPLY) fs.writeFileSync(p, out, "utf8");
      }
    } else if (e.isFile() && e.name === "index.html") {
      const c = fs.readFileSync(p, "utf8");
      const out = simplifyHtmlVersion(c);
      if (out !== c) {
        htmlChanged++;
        const before = c.match(/<td>版本<\/td><td>([^<]*)<\/td>/);
        const after = out.match(/<td>版本<\/td><td>([^<]*)<\/td>/);
        if (before && before[1].includes("|")) htmlSimplified++;
        if (sample.length < 6) sample.push(`index.html: "${before?.[1]}" -> "${after?.[1]}" (${path.relative(ROOT, p)})`);
        if (APPLY) fs.writeFileSync(p, out, "utf8");
      }
    }
  }
}
walk(ROOT);

console.log(`模式: ${APPLY ? "执行" : "预览"}`);
console.log(`info.json 修改: ${infoChanged} 个（其中简化掉"|"描述段的 ${infoSimplified} 个）`);
console.log(`index.html 修改: ${htmlChanged} 个（其中简化掉"|"描述段的 ${htmlSimplified} 个）`);
console.log("--- 样例 ---");
sample.forEach((s) => console.log("  " + s));
