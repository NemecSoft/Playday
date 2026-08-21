// NSIS 脚本生成与编译：把"游戏存档路径列表"编译成双击即恢复的自解压 exe。
// 思路（参考原 GameSaver 工具）：每个存档路径一个 Section，SetOutPath 设恢复目标目录，
// File "原存档路径"（含通配符，NSIS 编译时自动打包匹配文件），多路径 = 多 Section。
// 这样备份 exe 内嵌所有存档文件，双击即自动恢复到各自配置的位置，不依赖 Playday。
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import type { SavePathCollect } from "./saveManager";

// 每个存档路径的编译输入：校验通过（有匹配文件）后写进脚本。
export interface NsisEntry {
  savePath: string;        // 原始存档路径（含通配符）
  resolved: string;        // 占位符展开后的原始路径（含通配符）
  collect: SavePathCollect;
}

// 查找 NSIS 编译器。优先用 Playday 自带的（resources 或 release/Tools），
// 找不到再回退系统安装的，最后回退环境变量 MAKENSIS。
function findMakensis(): string | null {
  // 1) 自带（打包态：resources/NSIS；开发态：release/Tools/GameSaveBackup/NSIS）
  const bundled = [
    path.join(process.resourcesPath || "", "NSIS", "Bin", "makensis.exe"),
    path.join(process.resourcesPath || "", "NSIS", "makensis.exe"),
    path.join(__dirname, "..", "..", "..", "release", "Tools", "GameSaveBackup", "NSIS", "Bin", "makensis.exe"),
    path.join(__dirname, "..", "..", "..", "release", "Tools", "GameSaveBackup", "NSIS", "makensis.exe"),
  ];
  for (const c of bundled) {
    if (c && fs.existsSync(c)) return c;
  }
  // 2) 环境变量
  if (process.env.MAKENSIS && fs.existsSync(process.env.MAKENSIS)) return process.env.MAKENSIS;
  // 3) 系统安装
  const sys = [
    "C:/Program Files (x86)/NSIS/makensis.exe",
    "C:/Program Files/NSIS/makensis.exe",
  ];
  for (const c of sys) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// NSIS 根目录（用于 Include 路径 / 图标等）。
function nsisRoot(makensis: string): string {
  // makensis 在 <NSIS>/Bin/makensis.exe 时根是上一级；在 <NSIS>/makensis.exe 时是当前级。
  if (path.basename(path.dirname(makensis)).toLowerCase() === "bin") {
    return path.dirname(path.dirname(makensis));
  }
  return path.dirname(makensis);
}

// 判断 NSIS 编译器是否可用。
export function nsisAvailable(): boolean {
  return findMakensis() !== null;
}

// 编译存档备份为自解压 exe。
// entries: 每个存档路径（已预检，有匹配文件）。
// outFile: 输出的 exe 绝对路径。
// 返回 exe 路径；失败抛错。
export function compileBackupToExe(opts: {
  entries: NsisEntry[];
  gameName: string;
  outFile: string;
}): string {
  const { entries, gameName, outFile } = opts;
  const makensis = findMakensis();
  if (!makensis) {
    throw new Error("未找到 NSIS 编译器（makensis.exe）。");
  }
  const root = nsisRoot(makensis);

  // 临时 .nsi 放在 exe 同目录
  const nsiPath = path.join(path.dirname(outFile), "_backup_gamesave.nsi");
  const nsi = buildNsiScript({ entries, gameName, root, outFile });
  // 必须用 UTF-8 with BOM 写，且脚本用 Unicode true：
  // 无 BOM 的 UTF-8 + 中文会被 NSIS 按系统代码页(GBK)解析成乱码，导致编译失败。
  fs.writeFileSync(nsiPath, "\ufeff" + nsi, "utf-8");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  // OutFile 直接写进脚本（含中文路径也 OK），不用命令行 /D 传参（避免路径空格问题）。
  const res = spawnSync(makensis, ["/O2", nsiPath], { encoding: "utf-8", timeout: 180000 });
  try { fs.rmSync(nsiPath, { force: true }); } catch { /* ignore */ }

  if (res.error) throw new Error(`makensis 执行失败: ${res.error.message}`);
  if (res.status !== 0) {
    const out = (res.stdout || "") + (res.stderr || "");
    const tail = out.split(/\r?\n/).filter(Boolean).slice(-15).join("\n");
    throw new Error(`NSIS 编译失败（退出码 ${res.status}）:\n${tail || "（无输出，请检查 makensis 路径与脚本编码）"}`);
  }
  if (!fs.existsSync(outFile)) {
    throw new Error(`NSIS 编译结束但未生成 exe: ${outFile}`);
  }
  return outFile;
}

// 生成 NSIS 脚本。多路径 = 多 Section，各自 SetOutPath + File 通配符。
function buildNsiScript(opts: {
  entries: NsisEntry[];
  gameName: string;
  root: string;   // NSIS 根目录（保留，备用）
  outFile: string; // 输出的 exe 路径（写死进 OutFile）
}): string {
  const { entries, gameName, outFile } = opts;
  const lines: string[] = [];

  lines.push("; Playday game save backup (auto generated)");
  lines.push("Unicode true");
  lines.push(`Name "${sanitize(gameName)}"`);
  lines.push(`OutFile "${escapeNsi(outFile)}"`);
  lines.push("InstallDir \"$TEMP\\playday-restore\"");
  // 存档可能在系统目录，需要管理员权限
  lines.push("RequestExecutionLevel admin");
  lines.push("SetCompressor lzma");
  lines.push("");
  // 不用 MUI.nsh（自带的 MUI 文件是 UTF-8 无 BOM，在中文系统 ACP 下含中文
  // 的 !echo 会解析乱码导致编译失败），改用最简 Page instfiles。
  lines.push("Page instfiles");
  lines.push("");
  lines.push('BrandingText "Playday"');
  lines.push("ShowInstDetails show");
  lines.push("");

  // 每个存档路径一个 Section：SetOutPath 设恢复目标目录，File /r 递归打包匹配文件。
  // Section 名用数组下标（1、2、3...），因为存档路径不存 id，存储更简洁。
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const targetDir = targetDirOf(e.resolved);
    lines.push(`Section "Save ${i + 1}"`);
    lines.push(`  SetOutPath "${escapeNsi(targetDir)}"`);
    lines.push("  SetOverwrite on");
    lines.push(`  File /r "${escapeNsi(e.resolved)}"`);
    lines.push("SectionEnd");
    lines.push("");
  }

  lines.push('Section "Done"');
  lines.push('  DetailPrint "Game save restored successfully!"');
  lines.push("SectionEnd");

  return lines.join("\r\n");
}

// 从"含通配符的路径"取恢复目标目录（去掉最后一段通配符名字）。
function targetDirOf(raw: string): string {
  const parts = raw.split(/[\\/]/);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/[*?]/.test(parts[i])) {
      return parts.slice(0, i).join(path.sep) || path.sep;
    }
  }
  // 无通配符：若是文件取 dirname，否则当作目录
  return path.dirname(raw);
}

// 转义 NSIS 字符串：反斜杠转义成 \\（NSIS 里 \\ 输出单个 \，避免 C:\new 的 \n
// 被误作换行转义）、引号转义。OutFile / SetOutPath / File 里的路径都用它。
function escapeNsi(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// 清理非法文件名/脚本字符。
function sanitize(s: string): string {
  return s.replace(/[\\/:"*?<>|]/g, "").trim() || "游戏存档";
}
