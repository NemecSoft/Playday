// `--check` 自检模式的**执行层**：找数据、调规则层、写日志、给退出码。
//
// 需求：exe 支持一个 `--check` 参数，检查
//   1) 每个游戏 action 指定的启动项是否存在；
//   2) 每个游戏 savePaths 是否存在；
//   **只打印到 log，不启动 GUI**（服务器/无人值守环境可能根本跑不了图形界面）。
//
// 为什么能"不起 GUI"：自检只需要 Node 侧的东西（sql.js 读游戏库 + fs 判文件），
// 完全不需要 Chromium 的窗口；本函数在整个链路里**不创建任何 BrowserWindow**，
// 由 main.ts 在 app.whenReady() **之前**就调用，跑完直接 app.exit()。
//
// 判据来源（故意全部复用生产函数，见 launchCheck.ts 顶部说明）：
//   process.resolveAction / validateLaunchPath / findGameExecutable / resolvePath
//   scriptRunner.expandVariables
//
// 输出（两个文件都写，运维不用猜路径）：
//   <数据根>/logs/check-<时间戳>.log   —— 留档
//   <数据根>/logs/check-latest.log     —— 最新一次，固定路径（日志目录与崩溃日志/GPU 日志同一个）
// 注意：打包后的 exe 是 GUI 子系统程序，从 cmd 直接跑时 stdout 可能看不到，
// 所以**以日志文件为准**（需求也是这么说的：只打印到 log）。
//
// 退出码：0 = 没问题；1 = 发现问题；2 = 自检本身失败（读不到库等）。

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { openDb, getGames } from "./db";
import { configRoot, defaultGameRootPath } from "./paths";
import { resolveAction, validateLaunchPath, findGameExecutable } from "./process";
import { expandVariables } from "./scriptRunner";
import { KIND_LABEL, checkGames, type CheckSummary, type FindingKind } from "./launchCheck";

/** 当前是不是自检模式（`exe --check`）。 */
export function isCheckMode(argv: readonly string[] = process.argv): boolean {
  return argv.includes("--check");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function stamp(d = new Date()): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/** 问题类型的展示顺序：先启动项（会拦人），后存档路径。 */
const ORDER: FindingKind[] = [
  "no-play-action",
  "action-resolve-error",
  "action-missing",
  "action-unknown-type",
  "save-path-missing",
  "save-no-match",
];

function buildReport(summary: CheckSummary, meta: { dataRoot: string; gameRoot: string }): string[] {
  const lines: string[] = [];
  const sep = "=".repeat(72);
  lines.push(sep);
  lines.push("Playday 启动项 / 存档路径自检（--check）");
  lines.push(`时间      ：${new Date().toLocaleString()}`);
  lines.push(`版本      ：${app.getVersion?.() ?? "unknown"}`);
  lines.push(`数据根    ：${meta.dataRoot}`);
  lines.push(`游戏根    ：${meta.gameRoot}`);
  lines.push(`检查游戏  ：${summary.checked} 个`);
  lines.push(sep);
  lines.push("");

  const actionKinds: FindingKind[] = ["no-play-action", "action-resolve-error", "action-missing", "action-unknown-type"];
  const saveKinds: FindingKind[] = ["save-path-missing", "save-no-match"];

  const section = (title: string, kinds: FindingKind[]) => {
    const items = summary.findings.filter((f) => kinds.includes(f.kind));
    lines.push(`=== ${title}（${items.length}）===`);
    if (items.length === 0) {
      lines.push("  （无）");
    } else {
      for (const kind of kinds) {
        const group = items.filter((f) => f.kind === kind);
        if (group.length === 0) continue;
        lines.push(`  -- ${KIND_LABEL[kind]}：${group.length} 个 --`);
        for (const f of group) {
          lines.push(`  [${KIND_LABEL[kind]}] 《${f.gameName}》 (${f.gameId})`);
          lines.push(`      ${f.detail}`);
        }
      }
    }
    lines.push("");
  };

  section("1. 启动项问题", actionKinds);
  section("2. 存档路径问题", saveKinds);

  const actionTotal = actionKinds.reduce((n, k) => n + summary.counts[k], 0);
  const saveTotal = saveKinds.reduce((n, k) => n + summary.counts[k], 0);
  lines.push("=== 汇总 ===");
  lines.push(`  检查游戏      ：${summary.checked} 个`);
  lines.push(`  启动项问题    ：${actionTotal} 个`);
  lines.push(`  存档路径问题  ：${saveTotal} 个`);
  for (const kind of ORDER) {
    if (summary.counts[kind] > 0) lines.push(`      - ${KIND_LABEL[kind]}：${summary.counts[kind]}`);
  }
  lines.push("");
  lines.push("说明：");
  lines.push("  · 启动项问题 = 这个游戏在当前这台机器上点「开始游戏」会失败（路径/配置问题，必须处理）。");
  lines.push("  · 存档路径「无匹配文件」多数是「这个游戏还没人玩过」（存档目录本来就还没生成），");
  lines.push("    不一定是配置错误；但「目录不存在」若整片出现，多半是盘符/库路径配错了。");
  lines.push("");
  return lines;
}

/** 跑自检，返回进程退出码（0 无问题 / 1 有问题 / 2 自检失败）。 */
export async function runCheckMode(): Promise<number> {
  const lines: string[] = [];
  const say = (s: string) => {
    lines.push(s);
    console.log(s);
  };
  try {
    // 打开数据库（与正常启动同一条路：复制权威库到运行时副本再读入内存）。
    await openDb();
    const games = getGames();
    const gameRoot = defaultGameRootPath();
    const dataRoot = configRoot();

    const summary = checkGames(games, {
      gameRoot,
      expandVariables,
      resolveAction,
      validateAction: (p, t) => validateLaunchPath(p, t),
      findExecutable: (dir) => findGameExecutable(dir),
      exists: (p) => fs.existsSync(p),
      isDir: (p) => {
        try {
          return fs.statSync(p).isDirectory();
        } catch {
          return false;
        }
      },
      listDir: (p) => {
        try {
          return fs.readdirSync(p);
        } catch {
          return null;
        }
      },
    });

    for (const l of buildReport(summary, {
      dataRoot,
      gameRoot,
    })) {
      say(l);
    }

    const logPath = writeLogs(lines, dataRoot);
    say(`日志已写入：${logPath}`);

    const failed = summary.findings.length > 0;
    say(failed ? "[结果] 发现问题，退出码 1" : "[结果] 未发现问题，退出码 0");
    return failed ? 1 : 0;
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
    say("");
    say("[错误] 自检没能跑完：");
    say(msg);
    try {
      writeLogs(lines, configRoot());
    } catch {
      /* 日志写不出去时也只能放弃了 */
    }
    return 2;
  }
}

/** 写两份日志（时间戳 + 固定名），返回时间戳那份的路径。 */
function writeLogs(lines: string[], dataRoot: string): string {
  const dir = path.join(dataRoot, "logs");
  fs.mkdirSync(dir, { recursive: true });
  const at = stamp();
  const text = lines.join("\r\n") + "\r\n";
  const file = path.join(dir, `check-${at}.log`);
  fs.writeFileSync(file, text, "utf-8");
  // 固定名的那份方便运维/脚本直接取用（不用去猜时间戳）。
  try {
    fs.writeFileSync(path.join(dir, "check-latest.log"), text, "utf-8");
  } catch {
    /* 覆盖失败不影响时间戳那份 */
  }
  return file;
}
