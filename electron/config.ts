// 主进程运行时统一从这里取"命名配置"和"版本号"，避免在各个文件里重复定义。
// 这样主进程任何地方要显示产品名、拼 exe 路径或版本号，都从本文件拿。
import * as fs from "fs";
import * as path from "path";
import { APP_NAME, CLIENT_EXE_NAME } from "../build.config";

export { APP_NAME, CLIENT_EXE_NAME };

// 版本号从 package.json 读，避免在代码里写死（改版本只改 package.json 即可）。
// 打包后 app 路径是 app.asar，取版本号的 package.json 在 asar 内，用 __dirname 反推。
function readVersion(): string {
  try {
    // 开发态：项目根 package.json；打包态：resources/app.asar/package.json
    const candidates = [
      path.join(__dirname, "..", "..", "package.json"),
      path.join(__dirname, "..", "package.json"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const pkg = JSON.parse(fs.readFileSync(p, "utf-8"));
        if (pkg.version) return String(pkg.version);
      }
    }
  } catch {
    /* ignore */
  }
  return "0.0.0";
}

// 应用版本号。
export const APP_VERSION = readVersion();
