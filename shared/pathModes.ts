// 路径模式表（path-modes.json）的**纯逻辑**：解析、套用到 settings、校验。
//
// 背景：封面 / 音乐 / 详情页（含 videos 视频）/ 游戏库 / 公告 都是"环境相关数据"——
// 同一份代码在测试机要读 D 盘、在正式机要读 X 盘。以前这些值散在 config.json 和十几个脚本里，
// 出包时靠人逐个改，漏一个就是"正式机上打不开库 / 没有封面"且不报错。
//
// 现在：**规则只写在 path-modes.json**（三种模式 × 各目录），
// config.json 由它生成、并在 `npm run check` 里校验一致性（见 scripts/prepare-release.mjs）。
//
// 本模块不碰 fs（所以能单测），IO 在脚本里。
import type { AppSettings } from "./models";

/** 三种模式。 */
export const PATH_MODES = ["dev", "prerelease", "release"] as const;
export type PathMode = (typeof PATH_MODES)[number];

/**
 * 允许出现在模式表里的字段 = config.json 里那些"环境相关路径"。
 * 新增字段时两边一起加（漏了会被 readModeTable 报出来，不会静默忽略）。
 */
export const PATH_FIELDS = [
  "coverImagesDir",
  "gameDetailsDir",
  "musicDir",
  // 应用自带字体目录（2026-09-15 加入）：字体/音乐都是**平台级资源**，
  // 由管理员在本表里配、随模式同步进 config.json，**不在设置界面暴露**。
  "fontsDir",
  "libraryDir",
  "sourceLibraryDir",
  "announcementsDir",
  "defaultGameRootPath",
  "runtimeDir",
  "yungamestartDir",
  "yunGameUserListPath",
  "yunGameServerStatusPath",
  "gameSaveHelperPath",
] as const;
export type PathField = (typeof PATH_FIELDS)[number];

/** 每个模式允许的盘符：测试环境（D 盘）或正式环境（X 盘）。 */
const MODE_DRIVE: Record<PathMode, "D" | "X"> = {
  dev: "D",
  prerelease: "D",
  release: "X",
};

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export interface ModeResult {
  settings: AppSettings;
  /** 相对开发态 settings 需要改动的字段（mode=dev 时为空说明"配置与规则一致"）。 */
  changes: FieldChange[];
}

export class PathModeError extends Error {}

function isUnderDrive(value: string, drive: string): boolean {
  return new RegExp(`^${drive}:[\\\\/]`, "i").test(value.trim());
}

/**
 * 校验并规范化模式表（从 path-modes.json 读出来的原始 JSON）。
 * @throws PathModeError 结构不对 / 缺模式 / 缺字段 / 有多余字段 / 盘符与环境不符
 */
export function readModeTable(raw: unknown): Record<PathMode, Record<PathField, string>> {
  const table = (raw as { modes?: unknown } | null)?.modes;
  if (!table || typeof table !== "object") {
    throw new PathModeError("path-modes.json 缺少 modes 段");
  }
  const modes = table as Record<string, unknown>;
  // 先查"三个模式在不在"，再逐模式查内容 —— 缺模式是结构问题，先报出来最清楚
  // （否则会先抱怨 dev 少字段，把真正的原因盖住）。
  const missingModes = PATH_MODES.filter((m) => !modes[m] || typeof modes[m] !== "object");
  if (missingModes.length) {
    throw new PathModeError(`path-modes.json 缺少模式：${missingModes.join(", ")}`);
  }
  for (const mode of PATH_MODES) {
    const values = modes[mode] as Record<string, unknown>;
    const unknownKeys = Object.keys(values).filter((k) => !(PATH_FIELDS as readonly string[]).includes(k));
    if (unknownKeys.length) {
      throw new PathModeError(
        `模式 "${mode}" 里有不认识的字段：${unknownKeys.join(", ")}（可用字段见 shared/pathModes.ts 的 PATH_FIELDS）`,
      );
    }
    const missing = PATH_FIELDS.filter((f) => typeof values[f] !== "string" || !(values[f] as string).trim());
    if (missing.length) {
      throw new PathModeError(`模式 "${mode}" 缺字段（或值为空）：${missing.join(", ")}`);
    }
    // 盘符与环境必须一致：测试环境不许出现 X 盘、正式环境不许出现 D 盘。
    const want = MODE_DRIVE[mode];
    const wrong = want === "D" ? "X" : "D";
    const offenders = PATH_FIELDS.filter((f) => isUnderDrive(values[f] as string, wrong));
    if (offenders.length) {
      throw new PathModeError(
        `模式 "${mode}" 是 ${want} 盘环境，但这几个字段指的是 ${wrong} 盘：` +
          offenders.map((f) => `${f}=${values[f] as string}`).join(", "),
      );
    }
  }
  return modes as Record<PathMode, Record<PathField, string>>;
}

/**
 * 把某个模式的规则套到开发态 settings 上（只改 PATH_FIELDS，其余字段原样）。
 * @returns 新 settings（不动入参）+ 改动清单
 */
export function resolveModeSettings(
  dev: AppSettings,
  table: Record<PathMode, Record<PathField, string>>,
  mode: PathMode,
): ModeResult {
  const rules = table[mode];
  if (!rules) throw new PathModeError(`模式表里没有 "${mode}"`);
  const out: Record<string, unknown> = { ...(dev as unknown as Record<string, unknown>) };
  const changes: FieldChange[] = [];
  for (const field of PATH_FIELDS) {
    const from = typeof out[field] === "string" ? (out[field] as string) : "";
    const to = rules[field];
    if (from === to) continue;
    changes.push({ field: `settings.${field}`, from, to });
    out[field] = to;
  }
  return { settings: out as unknown as AppSettings, changes };
}

/** 某个模式下"数据根"字段（出包时决定要不要随包带数据）。 */
export function dataRootOf(table: Record<PathMode, Record<PathField, string>>, mode: PathMode): string {
  return table[mode].libraryDir;
}
