// 路径模式表（path-modes.json）的**纯逻辑**：解析、套用到 settings、校验、出"搬运清单"。
//
// 背景：封面 / 音乐 / 详情页（含 videos 视频）/ 游戏库 / 公告 都是"环境相关数据"——
// 同一份代码在测试机要读 D 盘、在正式机要读 X 盘。以前这些值散在 config.json 和十几个脚本里，
// 出包时靠人逐个改，漏一个就是"正式机上打不开库 / 没有封面"且不报错。
//
// 现在：**规则只写在 path-modes.json**（三种模式 × 各目录），config.json 由它生成、
// 部署时"搬什么"也由它决定（见 copyPlan），并在 `npm run check` 里校验一致性。
//
// 值的两种写法（2026-09-16 加入第二种）：
//   "路径"         —— **就地用**：数据本来就在那儿（`X:/Addons`、`D:/KwDownload/song`），部署时不搬。
//   ["源", "目标"] —— **要搬**：部署时把源的内容搬进目标（源是文件就放进目录），运行时读**目标**。
// 一个字段是哪一类，以前只能靠人记（runtime / fonts 会被复制、Addons 不会），而"搬"这件事本身
// 还散在 package.bat 与 prepare-release.mjs 两处代码里 —— 写法统一后**表一眼看得出谁会搬**，
// 搬运清单也就有了唯一来源。
//
// 落点与"运行时值"有时**不是同一个东西**：`gameSaveHelperPath` 的值必须是 exe 文件（客户端要 spawn 它），
// 而它整目录的运行时依赖（settings.json / template / assets / nsis）也得一起搬过去 ——
// 那就**源写目录、目标写完整文件路径**（`["tools/GameSaveHelper/release", "…/GameSaveHelper.exe"]`）：
// 搬运时把源的内容并入**目标所在目录**（判据见 targetIsFile），运行时值仍是那个文件路径。
//
// 本模块不碰 fs（所以能单测），IO 在 scripts/deploy.mjs 里。

import type { AppSettings } from "./models";

/** 两种模式（2026-09-17 起：prerelease 并入 release —— 两种模式只差"搬不搬"）。 */
export const PATH_MODES = ["dev", "release"] as const;
export type PathMode = (typeof PATH_MODES)[number];

/**
 * 允许出现在模式表里的字段 = config.json 里那些"环境相关路径"。
 * 新增字段时两边一起加（漏了会被 readModeTable 报出来，不会静默忽略）。
 *
 * 2026-09-17 的三处收敛（都为了"少一个能写错的地方"）：
 *   · 去掉 sourceLibraryDir / announcementsDir：库与公告的位置由 libraryDir 推出来
 *     （`<库根>/Admin/library.db`、`<库根>/announcements/announcement.html`，复制关系固定）；
 *   · YunGameConfigDir 取代 yunGameUserListPath / yunGameServerStatusPath：只配**目录**，
 *     文件名（YunGame_UserList.json / YunGame_ServerStatus.json）由程序内部固定，不暴露在配置里；
 *   · gameSaveHelperPath → gameSaveHelperDir：同理只配目录，exe 名内部固定。
 */
export const PATH_FIELDS = [
  "coverImagesDir",
  "gameDetailsDir",
  "musicDir",
  // 应用自带字体目录（2026-09-15 加入）：字体/音乐都是**平台级资源**，
  // 由管理员在本表里配、随模式同步进 config.json，**不在设置界面暴露**。
  "fontsDir",
  "libraryDir",
  "defaultGameRootPath",
  "runtimeDir",
  "yungamestartDir",
  "YunGameConfigDir",
  "gameSaveHelperDir",
] as const;
export type PathField = (typeof PATH_FIELDS)[number];

/** 表里一个字段的值：字符串 = 就地用；两元数组 = [源, 目标]，部署时要搬。 */
export type PathRule = string | [string, string];
/** 一个模式的全部字段。 */
export type ModeRules = Record<PathField, PathRule>;
/** 三个模式的规则表。 */
export type ModeTable = Record<PathMode, ModeRules>;

// 盘符校验 2026-09-17 **去掉了**（原来是"dev/prerelease 不许出现 X 盘、release 不许出现 D 盘"）。
// 原因：正式环境不再是"表里写 X 盘"，而是部署到 D 盘目的地、测试通过后由 promote 脚本把
// config.json 与库里的 D: 改写成 X:（见 path-modes.json 的说明）。表里 release 段写的就是
// **测试目的地**，所以老规矩正好是反的。
// 替代它的是下面 readModeTable 里那条"就地字段两模式必须一致"——它拦的是真正会出事的情况：
// 有人按老习惯在 release 段里写死 X: 路径，promote 之后再改一次就变成 X→X 或写串。

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

/** 部署时要搬的一项（copyPlan 的输出）。 */
export interface CopyItem {
  /** 表里的字段名（清单与报错里用来定位）。 */
  field: PathField;
  /** 源：相对 = 仓库根；绝对 = 原样。 */
  src: string;
  /** 目标：相对 = 目标根（defaultGameRootPath）；绝对 = 原样。 */
  dst: string;
}

export class PathModeError extends Error {}

/** 是不是"要搬"的写法。 */
export function isCopyRule(rule: PathRule): rule is [string, string] {
  return Array.isArray(rule);
}

/**
 * 运行时真正使用的值：要搬的取**目标**，就地用的取自身。
 * 所有读 config.json 的代码拿到的都是这个值 —— 表里的"源"只属于部署，运行期不存在。
 */
export function runtimeValue(rule: PathRule): string {
  return isCopyRule(rule) ? rule[1] : rule;
}

/**
 * 目标是"文件"还是"目录"：看最后一段有没有扩展名。
 *
 * 为什么要判：源是**目录**、目标却是**文件**时（`gameSaveHelperPath` 就是），
 * 搬运必须落到"目标所在目录"而不是去覆盖那个文件 —— 见文件头的"落点"一段。
 * 判据只看扩展名，不看磁盘：本模块不碰 fs，而且部署时目标通常还不存在。
 */
export function targetIsFile(target: string): boolean {
  const base = target.replace(/\\/g, "/").split("/").pop() ?? "";
  return /\.[a-z0-9]+$/i.test(base);
}

function isAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("//");
}

/** 相对目标用 `..` 跑出目标根 → 部署会写到目的地外面，直接拦下。 */
function escapesTargetRoot(target: string): boolean {
  if (isAbsolutePath(target)) return false;
  const parts = target.replace(/\\/g, "/").split("/").filter((s) => s && s !== ".");
  return parts[0] === "..";
}

function readRule(mode: PathMode, field: PathField, raw: unknown): PathRule {
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) throw new PathModeError(`模式 "${mode}" 的 ${field} 是空字符串`);
    return value;
  }
  if (Array.isArray(raw)) {
    if (raw.length !== 2) {
      throw new PathModeError(
        `模式 "${mode}" 的 ${field} 写成数组时必须正好两项 ["源", "目标"]，现在是 ${raw.length} 项`,
      );
    }
    const [src, dst] = raw as unknown[];
    if (typeof src !== "string" || !src.trim()) {
      throw new PathModeError(`模式 "${mode}" 的 ${field}：源（第 1 项）必须是非空字符串`);
    }
    if (typeof dst !== "string" || !dst.trim()) {
      throw new PathModeError(`模式 "${mode}" 的 ${field}：目标（第 2 项）必须是非空字符串`);
    }
    const target = dst.trim();
    if (escapesTargetRoot(target)) {
      throw new PathModeError(
        `模式 "${mode}" 的 ${field} 目标 "${target}" 用 .. 跑出了目标根 —— 部署只许往目的地里写`,
      );
    }
    return [src.trim(), target];
  }
  throw new PathModeError(`模式 "${mode}" 的 ${field} 既不是字符串也不是 ["源", "目标"] 两元数组`);
}

/**
 * 校验并规范化模式表（从 path-modes.json 读出来的原始 JSON）。
 * @throws PathModeError 结构不对 / 缺模式 / 缺字段 / 有多余字段 / 盘符与环境不符 / 数组写法不合法
 */
export function readModeTable(raw: unknown): ModeTable {
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
  const out = {} as ModeTable;
  for (const mode of PATH_MODES) {
    const values = modes[mode] as Record<string, unknown>;
    const unknownKeys = Object.keys(values).filter((k) => !(PATH_FIELDS as readonly string[]).includes(k));
    if (unknownKeys.length) {
      throw new PathModeError(
        `模式 "${mode}" 里有不认识的字段：${unknownKeys.join(", ")}（可用字段见 shared/pathModes.ts 的 PATH_FIELDS）`,
      );
    }
    const rules: Record<string, PathRule> = {};
    for (const field of PATH_FIELDS) {
      rules[field] = readRule(mode, field, values[field]);
    }
    // 目标根必须是**位置**，不能自己也是个搬运项：所有相对目标的基准就是它，
    // 让它再去引用一个"目标"就是循环定义（部署时先算谁的根？）。
    if (isCopyRule(rules.defaultGameRootPath)) {
      throw new PathModeError(
        `模式 "${mode}" 的 defaultGameRootPath 不能写成 ["源", "目标"]：它是目的地根（所有相对目标的基准），必须是一个位置`,
      );
    }
    out[mode] = rules as ModeRules;
  }
  // 跨模式校验：**就地字段（字符串）两模式必须写一样**。
  // 它拦的是真会出事的情况：有人按老习惯在 release 段里写死 `X:/…` —— 而正式环境的盘符
  // 现在由 promote 脚本统一改写（D:→X:），表里再写一遍 X: 会把库与配置改对不上。
  // defaultGameRootPath 例外：它是**各自模式的目的地根**（dev 就是仓库根 `.`）。
  const differs = PATH_FIELDS.filter((f) => {
    if (f === "defaultGameRootPath") return false;
    const a = out.dev[f];
    const b = out.release[f];
    return typeof a === "string" && typeof b === "string" && a !== b;
  });
  if (differs.length) {
    throw new PathModeError(
      `这些"就地"字段在 dev / release 里写得不一样：` +
        differs.map((f) => `${f}（dev=${String(out.dev[f])} / release=${String(out.release[f])}）`).join("、") +
        `\n  正式环境的盘符由 promote 脚本统一改写，表里两种模式请写同一个值。`,
    );
  }
  return out;
}

/**
 * 把某个模式的规则套到开发态 settings 上（只改 PATH_FIELDS，其余字段原样）。
 * 写进去的是**运行时值**（要搬的字段写它的目标）。
 * @returns 新 settings（不动入参）+ 改动清单
 */
export function resolveModeSettings(dev: AppSettings, table: ModeTable, mode: PathMode): ModeResult {
  const rules = table[mode];
  if (!rules) throw new PathModeError(`模式表里没有 "${mode}"`);
  const out: Record<string, unknown> = { ...(dev as unknown as Record<string, unknown>) };
  const changes: FieldChange[] = [];
  for (const field of PATH_FIELDS) {
    const from = typeof out[field] === "string" ? (out[field] as string) : "";
    const to = runtimeValue(rules[field]);
    if (from === to) continue;
    changes.push({ field: `settings.${field}`, from, to });
    out[field] = to;
  }
  return { settings: out as unknown as AppSettings, changes };
}

/** 某个模式的**目标根**（目的地）：程序与各"目标"都落在它下面。 */
export function targetRoot(table: ModeTable, mode: PathMode): string {
  return runtimeValue(table[mode].defaultGameRootPath);
}

/**
 * 某个模式下**要搬的东西**（只有写成 ["源", "目标"] 的字段会进来）。
 *
 * 顺序 = PATH_FIELDS 顺序（清单稳定，便于人核对 diff）。源/目标的相对基准不同：
 * 源相对仓库根、目标相对目标根 —— 解析成绝对路径是 IO 层的事（本模块不碰 fs）。
 */
export function copyPlan(table: ModeTable, mode: PathMode): CopyItem[] {
  const rules = table[mode];
  if (!rules) throw new PathModeError(`模式表里没有 "${mode}"`);
  return PATH_FIELDS.filter((f) => isCopyRule(rules[f])).map((f) => {
    const [src, dst] = rules[f] as [string, string];
    return { field: f, src, dst };
  });
}

/** 某个模式下"数据根"字段（出包时决定要不要随包带数据）。 */
export function dataRootOf(table: ModeTable, mode: PathMode): string {
  return runtimeValue(table[mode].libraryDir);
}
