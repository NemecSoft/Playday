// 路径报告（`exe -log`）的**纯逻辑**：排版 + 参数判定。零 fs / 零 electron，所以能单测。
//
// 需求原话（2026-09-16）：*"运行添加日志，用参数 -log 激活，报告出本次使用的实际『全路径』是什么
// …… 不然，我在测试机运行和在正式机运行，可能会有差异。"*
//
// 为什么需要：config.json 里的路径**故意**写成相对值（`data`、`runtime`、
// `tools/GameSaveHelper`（部署态）/ `dev-tools/GameSaveHelper/release`（开发态），见 path-modes.json
// 与 docs/design/release-build.md），
// 真正落在哪个盘、哪个目录，取决于 exe 在哪、数据根在哪 —— 那正是"测试机能跑、正式机不跑"这类
// 问题的现场证据。本报告把它**摊开写死**：每个字段"原值 → 实际全路径 + 在不在"，
// 字段顺序固定，两台机器各跑一次、两份日志一 diff，差异就是问题所在。
//
// 与 `--check` 的分工（两个参数互不影响，可以分别用）：
//   `--check` 是**独立模式**：查全库启动项/存档路径 → 写日志 → app.exit()，不起界面；
//   `-log`    只是**多写一份日志**：照常进界面 —— 它要回答的是"真的跑起来时，各目录落在哪"，
//             而那个答案只有在真的启动一次时才有意义。
//
// 取值与落盘在 pathLogMode.ts（IO 层）。判据来源：**全部复用生产解析函数**
// （paths.ts 的 getter / libraryPaths），报告里绝不自己算一遍 PATH —— 否则报告会与运行时脱节，
// 等于白写（checkMode.ts 顶部有同样的取舍说明）。

/** 是不是"要写路径报告"（`exe -log`；`--log` 也认，免得单双横线写成另一种就静默不生效）。 */
export function isPathLogEnabled(argv: readonly string[] = process.argv): boolean {
  return argv.includes("-log") || argv.includes("--log");
}

/** 报告里"配置字段"一行的输入（IO 层填好，这里只排版）。 */
export interface PathReportField {
  field: string;
  /** config.json 里的原值（照抄 —— 一眼看出它写的是相对还是绝对）。 */
  raw: string;
  /** 生产解析器算出来的绝对路径；null = 未配置。 */
  resolved: string | null;
  /** 解析结果在不在磁盘上；null = 未配置，没得判。 */
  exists: boolean | null;
}

export interface PathReportInput {
  time: Date;
  version: string;
  packaged: boolean;
  /** 进程可执行文件（开发态是 electron.exe）。 */
  execPath: string;
  appRoot: string;
  dataRoot: string;
  configFile: string;
  resourcesPath: string | null;
  fields: PathReportField[];
  /** 派生路径（由字段推出来、不在 config.json 里写的那些）。 */
  derived: Array<{ label: string; value: string | null; exists: boolean | null }>;
}

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/** 本地时间（人看的那行）—— 用 ISO 会显示 UTC，与备份/日志文件名对不上，白折腾一轮换算。 */
function localTime(d: Date): string {
  return (
    `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ` +
    `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
  );
}

/**
 * 按**显示宽度**补空格：中日韩字符占两格。
 * 不用 `String#padEnd` 的原因：它按码元数算，中文标签对不齐 —— 而这份报告是要人一眼扫、
 * 两台机器并排 diff 的，对不齐就白写。
 */
export function padDisplay(text: string, width: number): string {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6);
    w += wide ? 2 : 1;
  }
  return text + " ".repeat(Math.max(0, width - w));
}

/** 存在性标记：未配置不标（别把"没配"说成"缺失"）。 */
function mark(exists: boolean | null): string {
  return exists === null ? "" : exists ? "[存在]" : "[缺失]";
}

/** 排版报告（纯函数 → 可单测）。 */
export function buildPathReport(input: PathReportInput): string[] {
  const L: string[] = [];
  const sep = "=".repeat(72);
  L.push(sep);
  L.push("Playday 路径报告（-log）");
  L.push(sep);
  L.push(`${padDisplay("时间", 12)}：${localTime(input.time)}`);
  L.push(`${padDisplay("版本", 12)}：${input.version}`);
  L.push(`${padDisplay("运行形态", 12)}：${input.packaged ? "打包版（exe）" : "开发态（npm run dev / npx electron .）"}`);
  L.push(`${padDisplay("进程", 12)}：${input.execPath}`);
  L.push(`${padDisplay("应用目录", 12)}：${input.appRoot}`);
  L.push(`${padDisplay("数据根", 12)}：${input.dataRoot}`);
  L.push(`${padDisplay("配置文件", 12)}：${input.configFile}`);
  if (input.resourcesPath) L.push(`${padDisplay("资源目录", 12)}：${input.resourcesPath}`);
  L.push("");

  L.push("---- 配置里的路径字段：原值 → 实际解析出的全路径 ---------------");
  for (const f of input.fields) {
    L.push(`  ${f.field}`);
    L.push(`    ${padDisplay("原值", 6)}：${f.raw || "（空）"}`);
    L.push(`    ${padDisplay("实际", 6)}：${f.resolved ?? "（未配置）"}  ${mark(f.exists)}`.trimEnd());
  }
  L.push("");

  L.push("---- 派生路径（由上表推出来，配置里不写）-----------------------");
  for (const d of input.derived) {
    L.push(`  ${padDisplay(d.label, 16)}：${d.value ?? "（未配置）"}  ${mark(d.exists)}`.trimEnd());
  }
  L.push("");

  L.push("---- 对照用 ------------------------------------------------------");
  L.push("  测试机与正式机各带 -log 启动一次，把两份 logs\\paths-latest.log 并排 diff：");
  L.push("  「原值」多半相同（都来自同一张表），「实际」会随盘符/应用目录变化 —— 差异就是问题所在；");
  L.push("  再看「[缺失]」：缺失项 = 这个功能在这台机器上是静默失效的。");
  L.push("");
  return L;
}
