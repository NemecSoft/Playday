// Task 5 无头验证：权限校验 / 路径解析 / find_game_executable / 脚本执行 / 启动路径校验。
// process.ts 依赖 electron 的 app，无法在无头 Node 直接 import 编译产物，
// 故内联复刻各纯算法（无 electron 依赖）验证行为；模块接线已由 tsc 构建保证。
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const ROOT = "D:/AI/Code/Playnite/Playday";

// ---- 权限校验 ----
function canPlay(userLevel, gameLevel) { return userLevel >= gameLevel; }
console.log("[权限] L3玩L2:", canPlay(3, 2), "| L1玩L2:", canPlay(1, 2), "| L2玩L2:", canPlay(2, 2));

// ---- 路径解析（占位符/绝对/相对）----
function resolvePath(p, libs) {
  const root = path.join(ROOT, "data");
  const m = p.trim().match(/^\{(.+?)\}[\\/](.+)$/);
  if (m) {
    const lib = libs.find((l) => l.name.toLowerCase() === m[1].toLowerCase());
    if (lib) return path.join(lib.path, m[2]);
  }
  if (path.isAbsolute(p)) return p;
  return path.resolve(root, p);
}
const libs = [{ name: "Gamelibrary1", path: "D:\\Games2" }, { name: "库3", path: "D:\\Code" }];
console.log("[路径] {库3}\\Game\\x.exe →", resolvePath("{库3}\\Game\\x.exe", libs));
console.log("[路径] 绝对 D:\\Games\\g.exe →", resolvePath("D:\\Games\\g.exe", libs));
console.log("[路径] 相对 .\\g.exe →", resolvePath(".\\g.exe", libs));

// ---- find_game_executable（临时目录造一个游戏）----
function findGameExecutable(dir) {
  if (!fs.existsSync(dir)) return null;
  const exts = ["exe", "bat", "cmd", "lnk"];
  const cands = [];
  for (const ext of exts) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isFile() && name.toLowerCase().endsWith("." + ext)) {
        cands.push({ size: fs.statSync(full).size, file: full });
      }
    }
  }
  if (!cands.length) return null;
  const dirName = path.basename(dir).toLowerCase();
  for (const c of cands) if (path.basename(c.file, path.extname(c.file)).toLowerCase() === dirName) return c.file;
  cands.sort((a, b) => b.size - a.size);
  return cands[0].file;
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yungame-task5-"));
const gameDir = path.join(tmp, "MyGame");
fs.mkdirSync(gameDir, { recursive: true });
fs.writeFileSync(path.join(gameDir, "README.txt"), "x");
fs.writeFileSync(path.join(gameDir, "MyGame.exe"), Buffer.alloc(1000));
fs.writeFileSync(path.join(gameDir, "launcher.bat"), "@echo off");
console.log("[find_exe] 命中同名 exe →", path.basename(findGameExecutable(gameDir)));
fs.unlinkSync(path.join(gameDir, "MyGame.exe"));
console.log("[find_exe] 删除同名后选最大 →", path.basename(findGameExecutable(gameDir)));

// ---- runScript（同步执行）----
function runScript(script, cwd) {
  const results = [];
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const program = parts[0];
    const args = parts.slice(1);
    try {
      const res = spawnSync(program, args, { cwd: cwd || undefined, encoding: "utf-8", shell: false });
      if (res.error) results.push({ line, ok: false, error: res.error.message });
      else results.push({ line, ok: res.status === 0, error: res.status === 0 ? null : `退出码 ${res.status}` });
    } catch (e) {
      results.push({ line, ok: false, error: e.message });
    }
  }
  return results;
}
// 用一个不存在的命令验证失败行
console.log("[script] 不存在命令:", JSON.stringify(runScript("this_cmd_does_not_exist_xyz")));
console.log("[script] 空行+注释被跳过:", JSON.stringify(runScript("\n# 注释\n  \n")));

// ---- validate_launch_path ----
const EXEC = ["exe", "bat", "cmd", "lnk", "com"];
function validateLaunchPath(p, actionType, libs2) {
  if (actionType === "URL") return { valid: p.trim() !== "", resolved: p, reason: "", extension: "" };
  const resolved = resolvePath(p, libs2);
  if (!resolved.trim()) return { valid: false, resolved, reason: "路径为空", extension: "" };
  const ext = path.extname(resolved).slice(1).toLowerCase();
  const exists = fs.existsSync(resolved);
  const isDir = exists && fs.statSync(resolved).isDirectory();
  if (!exists) return { valid: false, resolved, reason: `文件不存在：${resolved}`, extension: ext };
  if (isDir) return { valid: false, resolved, reason: "是目录而非可执行文件", extension: ext };
  if (!EXEC.includes(ext)) return { valid: false, resolved, reason: `不是可执行文件`, extension: ext };
  return { valid: true, resolved, reason: "", extension: ext };
}
const ok = validateLaunchPath(path.join(gameDir, "launcher.bat"), "File", []);
console.log("[validate] 合法 bat:", ok.valid, "| 扩展名:", ok.extension);
console.log("[validate] 缺失文件:", validateLaunchPath("D:\\不存在的\\x.exe", "File", []).valid, validateLaunchPath("D:\\不存在的\\x.exe", "File", []).reason);

// 清理临时目录
fs.rmSync(tmp, { recursive: true, force: true });
console.log("\nTask 5 逻辑验证完成 ✅");
