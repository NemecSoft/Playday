// 路径报告（`exe -log`）的**执行层**：收集本机实际路径 → 交给纯逻辑排版 → 写日志。
// 纯逻辑在 pathReport.ts（有单测）；这一层碰 fs / electron，所以不写单测（与 checkMode.ts 同一分工）。
//
// 输出（与 `--check` 同一个约定，GUI 程序 stdout 看不到，**以日志文件为准**）：
//   <数据根>/logs/paths-<时间戳>.log   —— 留档
//   <数据根>/logs/paths-latest.log     —— 最新一次，固定路径（运维/脚本直接取它与另一台机器 diff）

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { PATH_FIELDS, type PathField } from "../../shared/pathModes";
import { buildPathReport, isPathLogEnabled, type PathReportField, type PathReportInput } from "./pathReport";
import {
  announcementFile,
  appRoot,
  configPath,
  configRoot,
  coverImagesDir,
  defaultGameRootPath,
  fontsDir,
  gameSaveHelperDir,
  gamesHtmlDir,
  libraryPaths,
  musicDir,
  runtimeDatabasePath,
  runtimeDir,
  sourceDatabasePath,
  vendorDir,
  yunGameConfigDir,
  yungamestartDir,
} from "./paths";

export { isPathLogEnabled };

/**
 * 每个字段对应的**生产解析器**。
 *
 * 类型写成 `Record<PathField, …>` 是有意的：`path-modes.json` 里新增字段而这里没跟上时
 * **编译就会失败** —— 报告不可能悄悄漏掉一条路径（这正是拿 PATH_FIELDS 当字段清单的原因）。
 */
const RESOLVERS: Record<PathField, () => string | null> = {
  coverImagesDir: () => coverImagesDir(),
  gameDetailsDir: () => gamesHtmlDir(),
  musicDir: () => musicDir(),
  fontsDir: () => fontsDir(),
  libraryDir: () => libraryPaths().root,
  defaultGameRootPath: () => defaultGameRootPath(),
  runtimeDir: () => runtimeDir(),
  yungamestartDir: () => yungamestartDir(),
  // 只配目录、文件名由程序内部固定的那两个：报告里给出**目录**（文件名不影响"落在哪"的对比）。
  YunGameConfigDir: () => yunGameConfigDir(),
  gameSaveHelperDir: () => gameSaveHelperDir(),
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 与 checkMode.ts 的时间戳同格式（YYYYMMDD-HHMMSS，本地时间）—— 只为日志文件名排序用。 */
function stamp(d = new Date()): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/** 路径存不存在（判不了算 null：别把"读不动"写成"缺失"）。 */
function existsAt(p: string | null): boolean | null {
  if (!p) return null;
  try {
    return fs.existsSync(p);
  } catch {
    return null;
  }
}

/**
 * config.json 里某字段的**原值**（照抄，不做任何解析）。
 *
 * 直接读文件而不是复用 paths.ts 的 readSettingsField：那个是私有的，而且这里要的是
 * "配置里到底写了什么"（含相对写法），与"解析后的值"是两回事 —— 报告的价值正在于两者对照。
 */
function rawField(field: PathField): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), "utf-8")) as { settings?: Record<string, unknown> };
    const v = parsed?.settings?.[field];
    return typeof v === "string" ? v : "";
  } catch {
    // config.json 不在/坏了：其余地方会各自走默认值，这里如实留空 —— 报告本身就是用来发现这种事的
    return "";
  }
}

/** 收集本机实际路径 → 生成报告 → 写日志。返回时间戳那份的路径（写不出去时返回 ""）。 */
export function writePathReport(): string {
  const dataRoot = configRoot();
  const lib = libraryPaths();
  const input: PathReportInput = {
    time: new Date(),
    version: app.getVersion?.() ?? "unknown",
    packaged: app.isPackaged,
    execPath: process.execPath,
    appRoot: appRoot(),
    dataRoot,
    configFile: configPath(),
    resourcesPath: process.resourcesPath ?? null,
    fields: PATH_FIELDS.map((field): PathReportField => {
      let resolved: string | null;
      try {
        resolved = RESOLVERS[field]();
      } catch {
        // 单个字段解析失败不该让整份报告作废（其余字段照样能对比）
        resolved = null;
      }
      return { field, raw: rawField(field), resolved, exists: existsAt(resolved) };
    }),
    derived: [
      { label: "权威库（源库）", value: sourceDatabasePath(), exists: existsAt(sourceDatabasePath()) },
      { label: "运行时副本", value: runtimeDatabasePath(), exists: existsAt(runtimeDatabasePath()) },
      { label: "公告文件", value: announcementFile(), exists: existsAt(announcementFile()) },
      { label: "随包前端资源", value: vendorDir(), exists: existsAt(vendorDir()) },
      { label: "日志目录", value: path.join(dataRoot, "logs"), exists: existsAt(path.join(dataRoot, "logs")) },
    ],
  };

  const lines = buildPathReport(input);
  for (const l of lines) console.log(l);

  try {
    const dir = path.join(dataRoot, "logs");
    fs.mkdirSync(dir, { recursive: true });
    const text = lines.join("\r\n") + "\r\n";
    const file = path.join(dir, `paths-${stamp(input.time)}.log`);
    fs.writeFileSync(file, text, "utf-8");
    // 固定名那份：两台机器各跑一次，直接拿它 diff（不用去猜时间戳）。
    try {
      fs.writeFileSync(path.join(dir, "paths-latest.log"), text, "utf-8");
    } catch {
      /* 覆盖失败不影响时间戳那份 */
    }
    return file;
  } catch (e) {
    console.log(`[path-report] 日志写不出去（不影响启动）：${e instanceof Error ? e.message : String(e)}`);
    return "";
  }
}
