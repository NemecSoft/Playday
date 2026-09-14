// 随包发布的第三方前端资源（`vendor/` 目录）解析。
//
// 现状：只有内置播放器用的 DPlayer（MIT，见 vendor/README.md）。它必须由**本地 HTTP 服务器**
// 发给详情页 —— 详情页是跨源 iframe 里的静态页，读不到 file://（开发态那个页面自己还是
// http://localhost:5173）。与字体（fonts.ts）走的是同一套"随包资源 + 服务器提供"的形态。
//
// 目录查找顺序（第一个存在的生效）：
//   1) <应用 exe 同级>/vendor   —— 绿色版里运维可直接替换；开发态 = 工程根/vendor
//   2) <resources>/vendor       —— 打包时 extraResources 带进去的那份
//
// 只放行**裸文件名**：不允许子目录、`..`、绝对路径，且扩展名白名单
//（与 fonts.ts 的 resolveFontRequest 同一套规则；这个目录别当成通用文件下载口）。

import * as fs from "fs";
import * as path from "path";
import { vendorDir } from "./paths";

/** 允许发出去的扩展名。 */
const VENDOR_EXTS = [".js", ".css"];

/** 候选目录（按优先级）。 */
export function vendorDirCandidates(): string[] {
  const out = [vendorDir()];
  const resources = process.resourcesPath;
  if (resources) {
    const packaged = path.join(resources, "vendor");
    if (!out.includes(packaged)) out.push(packaged);
  }
  return out;
}

/** 当前生效的 vendor 目录；一个都不存在时返回 null。 */
export function activeVendorDir(): string | null {
  for (const dir of vendorDirCandidates()) {
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch {
      /* 不存在就试下一个 */
    }
  }
  return null;
}

/**
 * 把 `/vendor/<文件名>` 的请求路径解析成磁盘绝对路径。
 * 返回 null 表示"不放行"（路径不合法 / 后缀不在白名单 / 文件不存在）。
 */
export function resolveVendorRequest(rel: string): string | null {
  const dir = activeVendorDir();
  if (!dir) return null;
  const name = rel.replace(/^\/+/, "");
  if (!name || name.split(/[\\/]/).some((s) => s === "..") || path.isAbsolute(name)) return null;
  if (path.basename(name) !== name) return null; // 只允许裸文件名
  if (!VENDOR_EXTS.includes(path.extname(name).toLowerCase())) return null;
  const full = path.join(dir, name);
  try {
    if (!fs.statSync(full).isFile()) return null;
  } catch {
    return null;
  }
  return full;
}
