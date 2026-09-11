// 把工作区所有文本文件统一转成 Windows CRLF 行尾。
// 只处理常见文本扩展名，跳过二进制（.mtn/.png/.db/.wasm 等已在 .gitattributes 标记 binary）。
// 用于消除 Git 的 "LF will be replaced by CRLF" 警告，让项目统一 CRLF（Windows 标准）。
import * as fs from "fs";
import * as path from "path";

const ROOT = process.cwd();

// 视为文本的扩展名（其余按二进制跳过，防止破坏图片/数据库/模型文件）
const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss", ".html",
  ".md", ".yml", ".yaml", ".toml", ".xml", ".txt", ".bat", ".ps1", ".svg",
  ".env", ".ini", ".cfg", ".sh", ".mjs", ".geojson", ".mjs",
]);

// Git 追踪的文本文件（由 .gitattributes 的 * text eol=crlf 规则驱动）
let changed = 0;
let total = 0;

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === ".git" || e.name === "node_modules" || e.name === "dist" ||
        e.name === "dist-electron" ||
        e.name === ".codebuddy" || e.name === "build") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (!TEXT_EXT.has(ext)) continue; // 非文本跳过
      total++;
      let content;
      try {
        content = fs.readFileSync(p, "utf8");
      } catch {
        continue;
      }
      // 检测是否含纯 LF（\n 前没有 \r）
      if (/[^\r]\n/.test(content) || content.startsWith("\n")) {
        const crlf = content.replace(/\r?\n/g, "\r\n");
        if (crlf !== content) {
          fs.writeFileSync(p, crlf, "utf8");
          changed++;
          if (changed <= 15) console.log(`  转换: ${path.relative(ROOT, p)}`);
        }
      }
    }
  }
}

walk(ROOT);
console.log(`扫描文本文件 ${total} 个，转成 CRLF 的 ${changed} 个。`);
console.log("项目现在统一用 Windows CRLF 行尾，Git 不再警告 LF→CRLF。");
