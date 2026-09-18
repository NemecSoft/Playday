// 补充清理 d:\Addons 里 clean-xdgame.mjs 未覆盖的特殊变体：
//   1) index.html 顶部的 <p>全部游戏介绍 · 信息来自 xdgame.com · 共 N 款</p>
//   2) 单行 footer：<div class="footer">© 2026 Game Library · 仅供学习与分享</div>
//   3) info.json 里的 "not_on_xdgame": true 字段（布尔标记，也含 xdgame 字样）
// 用法：node scripts/clean-xdgame-extra.mjs        # dry-run
//       node scripts/clean-xdgame-extra.mjs --apply # 真正修改
import * as fs from "fs";
import * as path from "path";

const ROOT = "D:/Addons";
const APPLY = process.argv.includes("--apply");

// index.html：顶部"信息来自 xdgame.com"那一行（含 <p>...</p>）
const HTML_FROM_XDGAME = /\s*<p>[^<]*信息来自 xdgame\.com[^<]*<\/p>\s*/g;
// index.html：单行 footer（© 2026 Game Library ...）
const HTML_SINGLE_FOOTER = /\s*<div class="footer">© 2026 Game Library[^<]*<\/div>\s*/g;
// index.html：单行 footer 带中缀（如 "© 2026 Game Library · 仅供学习与分享"）——由上面覆盖
// info.json："not_on_xdgame": true 行
const JSON_NOT_ON = /^\s*"not_on_xdgame":\s*true,?\s*$/;

let htmlModified = 0;
let jsonModified = 0;
const htmlHits = { fromXdg: 0, singleFooter: 0 };
let jsonHits = 0;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name === "index.html") {
      const c = fs.readFileSync(p, "utf8");
      const from = (c.match(HTML_FROM_XDGAME) || []).length;
      const foot = (c.match(HTML_SINGLE_FOOTER) || []).length;
      if (from + foot === 0) continue;
      htmlHits.fromXdg += from;
      htmlHits.singleFooter += foot;
      htmlModified++;
      if (!APPLY) continue;
      let out = c
        .replace(HTML_FROM_XDGAME, "")
        .replace(HTML_SINGLE_FOOTER, "");
      if (out !== c) fs.writeFileSync(p, out, "utf8");
    } else if (e.isFile() && e.name === "info.json") {
      const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
      const keep = lines.filter((l) => !JSON_NOT_ON.test(l));
      if (keep.length === lines.length) continue;
      jsonHits += lines.length - keep.length;
      jsonModified++;
      if (!APPLY) continue;
      fs.writeFileSync(p, keep.join("\n"), "utf8");
    }
  }
}
walk(ROOT);

console.log(`模式: ${APPLY ? "执行" : "预览"}`);
console.log(`index.html 补充修改: ${htmlModified} 个`);
console.log(`  - "信息来自 xdgame.com": ${htmlHits.fromXdg} 处`);
console.log(`  - 单行 footer 版权:      ${htmlHits.singleFooter} 处`);
console.log(`info.json 补充修改: ${jsonModified} 个 (not_on_xdgame 共 ${jsonHits} 行)`);
