// 把开发态数据路径打印出来，供 .bat（cmd 里没法 import 模块）和其它脚本使用。
// 取值的逻辑在 scripts/lib/devData.mjs —— 本文件只是个薄壳，别在这里加规则。
//
// 用法：
//   node scripts/data-dir.mjs            # 数据根绝对路径（一行）
//   node scripts/data-dir.mjs --bat      # KEY=VALUE 多行，供 bat 里 for /f 直接 set
//   node scripts/data-dir.mjs --admin    # 权威库（源库）文件路径
//   node scripts/data-dir.mjs --runtime  # 运行时副本文件路径
//   node scripts/data-dir.mjs --json     # 整库 JSON（人工编辑镜像）目录
//   node scripts/data-dir.mjs --exists   # 必需文件都在 → 退出码 0；缺 → 1（stderr 说明缺什么）
import {
  adminDbPath,
  dataDirGitPath,
  devDataDir,
  libraryJsonDir,
  missingDevData,
  runtimeDbPath,
} from "./lib/devData.mjs";

const has = (flag) => process.argv.includes(flag);

let root;
try {
  root = devDataDir();
} catch (e) {
  console.error(`[data-dir] ${e.message}`);
  process.exit(1);
}

if (has("--exists")) {
  const missing = missingDevData(root);
  if (missing.length) {
    console.error(`[data-dir] 开发态数据不完整（${root}），缺少：`);
    for (const p of missing) console.error(`    ${p}`);
    process.exit(1);
  }
  process.exit(0);
}

if (has("--bat")) {
  // 一行一个 KEY=VALUE，bat 侧 `for /f "delims=" %%i in (...) do set "%%i"` 直接用。
  process.stdout.write(
    [
      `YUNGAME_DATA_DIR=${root}`,
      `PLAYDAY_ADMIN_DB=${adminDbPath(root)}`,
      `PLAYDAY_RUNTIME_DB=${runtimeDbPath(root)}`,
      `PLAYDAY_LIBRARY_JSON=${libraryJsonDir(root)}`,
      `PLAYDAY_DATA_REL=${dataDirGitPath(root)}`,
    ].join("\r\n") + "\r\n",
  );
  process.exit(0);
}

if (has("--admin")) process.stdout.write(adminDbPath(root));
else if (has("--runtime")) process.stdout.write(runtimeDbPath(root));
else if (has("--json")) process.stdout.write(libraryJsonDir(root));
else process.stdout.write(root);
