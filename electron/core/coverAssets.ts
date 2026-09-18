// 详情页封面：`/CoverImages/<文件名>` → **配置的封面目录**下那个文件。
//
// 需求（2026-09-18 用户原话）："统一都用 CoverImages 的，不要复制，用唯一源，
//   可以直接用路径也可以搞个 CoverImages 文件夹的 http server"。
//
// 为什么要有这条路由：详情页的封面以前是**复制**一份到 `<游戏目录>/images/cover.<ext>`，
// 于是同一张图有两个源、必然漂移 —— 实测「大富翁11-网吧联机版」页面上显示的是爬来的那张
// （19.8KB 的副本），而 CoverImages 里是另一张正式封面。现在页面里只放一个 URL，
// 图由服务器**现取**，与客户端网格用的是同一张、同一个目录。
//
// ⚠️ 路径约定必须与网站端 `server/server.mjs` 的 `/CoverImages/<file>` **完全一致** ——
//    同一份生成的页面（Addons 里那些 index.html）在桌面端和网站端都要能显示。
//
// 安全：只放行**裸文件名**（不允许子目录、`..`、绝对路径），扩展名白名单取自
// shared/coverMatch.ts 的 COVER_IMAGE_EXTS（与"哪些文件算封面"是同一份定义）。
// 这个路由别当成通用文件下载口。

import * as fs from "fs";
import * as path from "path";
import { COVER_IMAGE_EXTS } from "../../shared/coverMatch";
import { coverImagesDir } from "./paths";

/** 当前生效的封面目录（不存在时也返回路径；取不到文件自然就是 404）。 */
export function activeCoverDir(): string {
  return coverImagesDir();
}

/**
 * 把 `/CoverImages/<文件名>` 的请求路径解析成磁盘绝对路径。
 * 返回 null 表示"不放行"（路径不合法 / 后缀不在白名单 / 文件不存在）。
 */
export function resolveCoverRequest(rel: string): string | null {
  const name = (rel ?? "").replace(/^\/+/, "");
  if (!name) return null;
  if (path.basename(name) !== name) return null; // 只允许裸文件名
  if (name.split(/[\\/]/).some((s) => s === "..")) return null;
  if (path.isAbsolute(name)) return null;
  const ext = path.extname(name).slice(1).toLowerCase();
  if (!COVER_IMAGE_EXTS.includes(ext)) return null;
  const full = path.join(activeCoverDir(), name);
  try {
    if (!fs.statSync(full).isFile()) return null;
  } catch {
    return null;
  }
  return full;
}
