// 「整库 JSON」的数据层纯逻辑（**零 import**、零 IO）—— 供 scripts/library-json.mjs
// 与 scripts/check-architecture.mjs 共用。单测在同目录 libraryJson.test.mjs
// （vitest 配置里显式列了 scripts/**/*.test.mjs）。
//
// 为什么要有这套东西（2026-09-16 需求）："直接把库导出成 json，我改 json 再回写回去，
// 这样管理数据库。不用 game-content.json 了 —— 免得一会加这个字段一会加那个字段。"
//   旧链（人工内容表 game-content.json → apply 脚本 → 库）是**按固定键重建**的：加一个字段
//   要在生成脚本、apply 脚本、守卫的必需键列表里各改一处，漏一处就是"改了没生效"。
//   现在这套是 **schema 驱动、零字段清单**：表与列都从库里现发现（sqlite_master /
//   PRAGMA table_info），**加一列、加一张表都不用改代码**。
//
// 放 scripts/lib/ 而不是 shared/ 的原因：这是**构建期工具**的逻辑，不进任何运行时 bundle
// （shared/ 会被打进渲染层，不能塞只有脚本用的东西 —— 与 scripts/lib/devData.mjs 同理）。
//
// ⚠️ 与 electron/core/db.ts 的 SCHEMA 无关（刻意如此）：权威库的真实列可能与 SCHEMA 不一致
//   （实测多一列 description_alt、且没有 show_bat_console）。所以回写必须"复制现库 →
//   清空目标表 → 插回"，绝不能"按 SCHEMA 重建一个新库"—— 那会整列丢数据。

/**
 * 整库 JSON（人工编辑内容的镜像）所在目录，相对仓库根。**唯一来源，别在别处拼**。
 *
 * 2026-09-17 从 `data/library` 搬到 `dev-data/library-json`（用户要求：开发态一律用 dev-data）：
 *   · **不能**叫 `dev-data/library` —— 那是"运行时副本"的位置（`dev-data/library/library.db`，
 *     由客户端每次启动从权威库重建），两者同名会互相踩；
 *   · 搬进 `dev-data/` 之后它落在 .gitignore 的默认忽略区里（`dev-data/*` 只白名单了库与公告）
 *     —— 也就是说这份 JSON **不再纳入版本管理**，改动没有 diff/回滚可依赖，
 *     手工编辑前请先 `npm run db:backup` 留个点（这是用户明确接受的代价）。
 */
import path from "node:path";
import { libraryJsonDir, ROOT } from "./devData.mjs";

// 从 devData.mjs **派生**（不在这里写死 `dev-` 目录名 —— 守卫规则 12 会拦；改名时也只改一处）。
// 输出保持"相对仓库根"的形式，因为消费方（ps1 / bat 壳 / 提示文案）都按这个形式用它。
export const LIBRARY_JSON_DIR = path.relative(ROOT, libraryJsonDir()).split(path.sep).join("/");

/** 元数据文件名：记录**导出时**权威库的指纹，用来拦住"拿旧 JSON 覆盖新改动"。 */
export const LIBRARY_JSON_META = "_meta.json";

/** 表名 → 文件名（`games` → `games.json`）。 */
export function tableFileOf(table) {
  return `${table}.json`;
}

/**
 * 文件名 → 表名；不是**表文件**时返回 null。
 * `_meta.json`（元数据）返回 null —— 它长得也像表文件，导入时必须跳过。
 * @param {string} file
 * @returns {string | null}
 */
export function tableOfFile(file) {
  if (!file.endsWith(".json")) return null;
  const table = file.slice(0, -".json".length);
  if (!table || table.startsWith("_")) return null;
  return table;
}

/**
 * 一组文件名 → 表名列表（跳过元数据/杂项）。
 * @param {string[]} files
 * @returns {string[]}
 */
export function tableOfFilesIn(files) {
  return files.map(tableOfFile).filter((t) => t !== null).sort();
}

/**
 * 备份文件名用的**本地时间戳**：`YYYYMMDD-HHMMSS`。
 *
 * 为什么不用 `Date#toISOString()`（UTC）：备份名是**出事时要一眼找到并拷回去**的东西，
 * 而 UTC 那串（`library.db.bak-2026-09-15T19-23-46-171Z`）得先换算时区才认得出是哪天哪次。
 * 本地时间戳既好认，排序性也一样（定宽、从大到小），与同目录里已有的备份（`bak-20260915-033847`）
 * 还是同一种写法。放这儿是为了**只有一份命名规则**：回写备份与独立备份共用它。
 *
 * @param {Date} [d]
 * @returns {string}
 */
export function localStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * 库里的值 → JSON 里的值。
 *
 * 只做**一件**通用变换：看起来是 JSON 数组的字符串（`[...]` 且能解析成数组）→ 真数组。
 * 为什么要它：库里 `tags` / `region` / `save_paths` / `actions` 这些列存的是 JSON 数组文本
 * （`"[\"休闲\",\"生存\"]"`），直接导出就是一层转义引号，手改极易写坏。
 *
 * 其余一律**原样**：数字保持数字、`null` 保持 `null`、`1/0` 保持 `1/0`（不猜布尔 ——
 * 猜错会改变语义，比如 `show_bat_console` 的 0/1 是"强制隐藏/显示"、NULL 才是"跟随全局"）。
 *
 * ⚠️ 与 jsonValueToDb 互为逆运算，且**幂等**（导出→不改→导入，库里的值不变）。
 *   唯一的规范化：库里若存的是带空格的 `["a", "b"]`，回写会变成 `["a","b"]`（无害）。
 */
export function dbValueToJson(value) {
  if (value === undefined) return null;
  if (typeof value !== "string") return value;
  const s = value.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return value;
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    return value;
  }
}

/**
 * JSON 里的值 → 存库的值。
 * 数组一律 `JSON.stringify`（与库里的存储约定一致）；`null` / `undefined` → SQL NULL。
 * 布尔 → 1/0（手写 `true/false` 比 1/0 清楚，库里是 INTEGER）。
 */
export function jsonValueToDb(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value;
  // 对象等复合值：库里这类列本来就是 JSON 文本，别丢信息
  return JSON.stringify(value);
}

/**
 * 一行：库 → JSON。
 * @param {Record<string, unknown>} row
 */
export function rowToJson(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = dbValueToJson(v);
  return out;
}

/**
 * 一行：JSON → 库。**按表的真实列取键**（JSON 里多余的键不会写进去 ——
 * 多余键在 validateRows 里已经报错拦下了）。
 * @param {Record<string, unknown>} row
 * @param {string[]} columns
 */
export function rowToDb(row, columns) {
  const out = {};
  for (const col of columns) out[col] = jsonValueToDb(row[col]);
  return out;
}

/** 主键是否为空（库里真有这种行，见 missingKeysOf 的说明）。 */
export function isEmptyKey(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

/**
 * 校验一张表的 JSON 内容。返回**错误**列表（空 = 通过）。分两级处理：
 *   · **错误**（这里返回，会拦住写库）：顶层不是数组、行不是对象、主键重复、列名拼错、唯一列重复；
 *   · **警告**（不拦，见 missingKeysOf）：主键为空 —— 库里本来就有这种行，原样往返是保真的。
 *
 * 这些都是"手改 JSON 时真会犯、而报错信息会很难懂"的错，所以在**写库之前**拦住：
 *   · 顶层不是数组（整份粘串了，或包了一层对象）；
 *   · 行不是对象（多写个逗号把行变成标量）；
 *   · 主键重复 → `INSERT` 直接违反 PRIMARY KEY，报的是 SQL 层的话；
 *   · 列名拼错 → **最危险的一类**：不报错，只是那一列静默写回 NULL（数据看着"丢了"）；
 *   · 唯一列重复（games.name）→ 违反 UNIQUE 索引，导入到一半才炸。
 *
 * @param {{ table: string, columns: string[], pk?: string, unique?: string[] }} spec
 * @param {unknown} rows
 * @returns {string[]}
 */
export function validateRows(spec, rows) {
  const pk = spec.pk ?? "id";
  const problems = [];
  if (!Array.isArray(rows)) {
    problems.push(`${spec.table}.json: 顶层必须是数组（一行一个对象）`);
    return problems;
  }
  const known = new Set(spec.columns);
  const seenPk = new Map();
  const seenUnique = new Map();
  const unknownCols = new Map(); // 列名 → 首次出现的行号
  rows.forEach((row, i) => {
    const at = `第 ${i + 1} 行`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      problems.push(`${spec.table}.json: ${at} 不是对象`);
      return;
    }
    const id = row[pk];
    if (isEmptyKey(id)) {
      // 主键为空**不算错误**：权威库里就存在这种空壳行（实测 games 表有一行
      // id / game_id / install_directory 全空、只有 name="大富翁11"，是早期"无 id 导入"
      // 留下的）。SQLite 的非 INTEGER 主键允许 NULL，原样往返是保真的；硬拦下等于
      // "用户得先去修一条他不知情的老数据才能用这个工具"。但它必须**被说出来**
      // （脚本会警告，见 missingKeysOf）—— 这类行在 --merge 下没法按主键匹配。
    } else if (seenPk.has(id)) {
      problems.push(`${spec.table}.json: ${at} 的 ${pk} 与第 ${seenPk.get(id)} 行重复（${String(id)}）`);
    } else {
      seenPk.set(id, i + 1);
    }
    // 拼错的列名只在**表一级**报一次（按行报会把同一处拼错刷成几百条，反而看不清）。
    for (const k of Object.keys(row)) if (!known.has(k) && !unknownCols.has(k)) unknownCols.set(k, i + 1);
    for (const col of spec.unique ?? []) {
      const v = row[col];
      if (v === undefined || v === null || String(v).trim() === "") continue;
      const key = String(v);
      const m = seenUnique.get(col) ?? new Map();
      seenUnique.set(col, m);
      if (m.has(key)) {
        problems.push(
          `${spec.table}.json: ${at} 的 ${col} 与第 ${m.get(key)} 行重复（${key}）—— 库上这个列有唯一索引，重复会直接插不进去`,
        );
      } else {
        m.set(key, i + 1);
      }
    }
  });
  // 每张表只报一次（而不是每行一次）：写错的列不会进库、也不会报错，
  // 是最容易"看着改了其实没改"的一类，必须拦；但按行刷屏反而看不清是哪一列。
  for (const [col, line] of unknownCols) {
    problems.push(
      `${spec.table}.json: 有库里不存在的列 \`${col}\`（首次出现在第 ${line} 行）—— 拼错了？写错的列不会进库、也不会报错，所以这里直接拦下`,
    );
  }
  return problems;
}

/**
 * 找出**主键为空**的行（不拦导入，只提醒）。
 *
 * 为什么要单列一档而不是当错误：库里本来就有这种行（实测 games 表一行 `name="大富翁11"`、
 * id/game_id/install_directory 全 NULL），导出→回写是保真的。但用户**该知道**：
 *   · 想修就给它补一个 id（或删掉这行）—— JSON 里直接改；
 *   · `--merge`（只合并不删）模式下这类行没法按主键匹配，会被跳过。
 * label 优先用 name：用户在 games.json 里搜名字比搜"第 1277 行"容易得多。
 *
 * @param {{ table: string, pk?: string }} spec
 * @param {unknown} rows
 * @returns {{ index: number, label: string }[]}
 */
export function missingKeysOf(spec, rows) {
  const pk = spec.pk ?? "id";
  if (!Array.isArray(rows)) return [];
  const out = [];
  rows.forEach((row, i) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return;
    if (!isEmptyKey(row[pk])) return;
    const name = typeof row.name === "string" && row.name.trim() ? `「${row.name}」` : "(无名称)";
    out.push({ index: i, label: name });
  });
  return out;
}

/**
 * 在整库 JSON 的行里按关键字找游戏（纯函数、可单测）。
 *
 * 为什么需要它：`games.json` 是 3.5MB / 12 万行级别的文件，在编辑器里 Ctrl+F
 * 既慢又容易搜不到（**搜索框里带/不带隐藏字符、或者名字本身带后缀**，比如用户找
 * 「消防模拟」而库里叫「消防模拟：火苗燃动-网吧联机版」）。
 *
 * 匹配规则：大小写不敏感的子串匹配，数组值（tags/region…）先 join 成字符串再比。
 * 默认只查"身份类"字段（name/id/game_id/origin_name）—— 查 intro 会把一堆
 * 提到同款玩法的游戏也带出来。
 *
 * @param {Record<string, unknown>[]} rows
 * @param {string} keyword
 * @param {string[]} [fields]
 * @returns {{ index: number, row: Record<string, unknown> }[]} index = 在数组里的序号（从 0 起）
 */
export function searchRows(rows, keyword, fields = ["name", "id", "game_id", "origin_name"]) {
  const kw = String(keyword ?? "").trim().toLowerCase();
  if (!kw || !Array.isArray(rows)) return [];
  const out = [];
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return;
    const hit = fields.some((f) => {
      const v = row[f];
      if (v === null || v === undefined) return false;
      const text = Array.isArray(v) ? v.join(" ") : String(v);
      return text.toLowerCase().includes(kw);
    });
    if (hit) out.push({ index, row });
  });
  return out;
}

/**
 * 找出"数组列"：哪些列的值在**导出时**是真数组。
 *
 * 为什么需要：库里 `tags` / `region` / `save_paths` / `actions` 这些列存的是 JSON 数组文本，
 * App 读它们时是 `JSON.parse` + `Array.isArray`，**解析失败就当成空数组**（见 electron/core/db.ts
 * 的 arr/rowToGame）。于是手改成字符串（`"tags": "休闲#生存"`）会被原样存进库，而界面读到的是
 * 空 —— 不报错、值却"丢了"，正是本项目反复防的那类静默故障。
 *
 * 判定**不靠手写字段清单**（那正是旧链"加字段要改三处"的病根）：导出时看这一列有没有出现过
 * 真数组，有就记进 `_meta.json`；导入时若该列写成了"不是数组的字符串"就报错拦下。
 * 导出时全为 NULL 的列不会被记（没有信息可依据），也就不会误报。
 *
 * @param {Record<string, unknown>[]} rows
 * @returns {string[]} 排好序的列名
 */
export function arrayColumnsOf(rows) {
  const cols = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    for (const [k, v] of Object.entries(row)) if (Array.isArray(v)) cols.add(k);
  }
  return [...cols].sort();
}

/** 字符串是不是"JSON 数组文本"（老写法：库里本来就长这样，允许照原样写回）。 */
function looksLikeArrayText(s) {
  const t = s.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) return false;
  try {
    return Array.isArray(JSON.parse(t));
  } catch {
    return false;
  }
}

/**
 * 检查"数组列"有没有被写成普通字符串（会被 App 静默读成空数组 → 值等于丢了）。
 * 空串不算错（含义就是"没有"）；能解析成数组的 JSON 文本也不算错（老写法）。
 *
 * @param {{ table: string }} spec
 * @param {unknown} rows
 * @param {string[]} arrayColumns 导出时由 arrayColumnsOf 记下的列名（存在 _meta.json 里）
 * @returns {string[]}
 */
export function checkArrayColumns(spec, rows, arrayColumns) {
  if (!arrayColumns?.length || !Array.isArray(rows)) return [];
  const problems = [];
  const hit = new Set();
  rows.forEach((row, i) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return;
    for (const col of arrayColumns) {
      const v = row[col];
      if (typeof v !== "string" || !v.trim()) continue;
      if (looksLikeArrayText(v)) continue;
      if (hit.has(col)) continue; // 每列只报一次（哪一列的写法错了，看一条就够）
      hit.add(col);
      problems.push(
        `${spec.table}.json: 第 ${i + 1} 行的 \`${col}\` 写成了字符串（${JSON.stringify(
          v.length > 30 ? v.slice(0, 30) + "…" : v,
        )}）—— 这一列库里存的是 JSON 数组，App 读它时解析失败会**当成空数组**（值就静默丢了）。` +
          `请写成数组，例如 "tags": ["休闲","生存"]`,
      );
    }
  });
  return problems;
}

/**
 * 一行的比较用字符串。两条规则都是为了避免"假改动"：
 *   · 键**排序**：字段顺序不同不算改；
 *   · 缺失的键**补成 null**：JSON 里没写这一列（= 回写时是 NULL）要与库里的 NULL 视为一样。
 *     不做这一步的话，新增一列会让预览把整张表都报成"修改 1284 行"（其实只动了 3 行）。
 */
function rowKey(row, columns) {
  const out = {};
  for (const c of [...columns].sort()) out[c] = row[c] === undefined ? null : row[c];
  try {
    return JSON.stringify(out);
  } catch {
    return JSON.stringify(row);
  }
}

/**
 * 配对用的键生成器：有主键用主键；**没有主键的行**（库里真有）按"第几个无主键行"配对。
 * 前缀用 \u0000 是为了不可能与真实 id 撞上。
 */
function makeKeyer(pk) {
  let noid = 0;
  return (row) => {
    const id = row[pk];
    if (isEmptyKey(id)) return `\u0000noid-${noid++}`;
    return String(id);
  };
}

/**
 * 对比"库现在的行"与"JSON 里的行"（两边都已在 JSON 空间，即都过了 rowToJson）。
 * @param {{ table: string, columns: string[], pk?: string }} spec
 * @param {Record<string, unknown>[]} current
 * @param {Record<string, unknown>[]} next
 * @returns {{ added: number, removed: number, changed: number, unchanged: number }}
 */
export function diffRows(spec, current, next) {
  const pk = spec.pk ?? "id";
  const out = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  const keyOfBefore = makeKeyer(pk);
  const keyOfNext = makeKeyer(pk);
  const before = new Map();
  for (const r of current) before.set(keyOfBefore(r), rowKey(r, spec.columns));
  const seen = new Set();
  for (const r of next) {
    const id = keyOfNext(r);
    seen.add(id);
    const old = before.get(id);
    if (old === undefined) out.added++;
    else if (old === rowKey(r, spec.columns)) out.unchanged++;
    else out.changed++;
  }
  for (const id of before.keys()) if (!seen.has(id)) out.removed++;
  return out;
}

/**
 * 由文件的 stat 生成指纹字段（大小 + 修改时间，与 shared/librarySync.ts 同口径）。
 * @param {{ size: number, mtimeMs: number }} stat
 */
export function fileFingerprint(stat) {
  return { dbBytes: stat.size, dbMtimeMs: stat.mtimeMs };
}

/**
 * `_meta.json` 的指纹与当前库是否一致。
 *
 * 为什么需要它：手改 JSON 最常见的翻车方式是"基于三天前的导出回写"，而那期间库已经被别的
 * 脚本改过 —— 回写就等于把那些改动悄悄抹掉。所以导出时记下指纹，导入时对不上就拒绝。
 *
 * mtime 取整到毫秒再比：NTFS 会给出亚毫秒小数，而 JSON 往返后可能被取整 —— 不取整会出现
 * "刚导出就说库变了"（同一个坑在 shared/librarySync.ts 里踩过）。
 *
 * @param {{ dbBytes: number, dbMtimeMs: number } | null | undefined} meta
 * @param {{ size: number, mtimeMs: number }} stat
 */
export function metaMatchesLibrary(meta, stat) {
  if (!meta) return false;
  return meta.dbBytes === stat.size && Math.round(meta.dbMtimeMs) === Math.round(stat.mtimeMs);
}
