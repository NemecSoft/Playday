#!/usr/bin/env node
/**
 * migrate-playnite.mjs — 把 Playnite 的游戏库数据迁移到 Playday。
 *
 * 流程：
 *   1) 调 dump-playnite.ps1（PowerShell + LiteDB.dll）把 Playnite 的 LiteDB
 *      数据库导出为 JSON。
 *   2) 读 JSON，建立 Guid→名称 映射（类型/平台/开发商/发行商…）。
 *   3) 用 sql.js 打开 Playday 目标库（默认权威库 dev-data/Admin/library.db），
 *      对每个 Playnite 游戏按【游戏名】做 UPSERT：
 *         - 已存在：更新 Playnite 能提供的字段，保留 Playday 特有字段
 *           （game_library / guide / videos / save_paths / monitor_exe / 会话时长 等）。
 *         - 不存在：插入新行。
 *   4) 写回前自动备份目标库（.migrate-bak），可重复运行（幂等）。
 *
 * 封面不迁移：Playday 已改为按 CoverImages 目录同名图片自动匹配。
 *
 * 用法：
 *   node scripts/migrate-playnite/migrate-playnite.mjs \
 *     [--playnite D:\YunGame\PlayNite] [--data <Playday 数据根>] [--db <目标库>] [--out <临时目录>]
 *
 * 常用：
 *   node scripts/migrate-playnite/migrate-playnite.mjs
 */

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const PLAYDAY_ROOT = path.resolve(__dirname, '..', '..')
const DUMP_SCRIPT = path.join(__dirname, 'dump-playnite.ps1')

// ─── 参数 ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const get = (name, dflt) => {
    const i = argv.indexOf(name)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
  }
  return {
    playniteDir: get('--playnite', 'D:\\YunGame\\PlayNite'),
    dataDir: get('--data', path.join(PLAYDAY_ROOT, 'release', 'data')),
    dbPath: get('--db', null),
    outDir: get('--out', path.join(os.tmpdir(), 'playnite-dump')),
    skipDump: argv.includes('--skip-dump'),
    // --out-json <文件>：把映射后的 Playday 行写成 JSON 就结束（**不打开、不改动任何数据库**）。
    outJson: get('--out-json', null),
    // --clear：清空目标库后全量导入（保留 Playday 维护的简介与特有字段）。
    clear: argv.includes('--clear'),
    // --reset：只清空目标库 games 表（备份后），不导入。
    reset: argv.includes('--reset'),
  }
}

// ─── 1. dump：PowerShell + LiteDB.dll → JSON ─────────────────────────────
function runDump(opts) {
  console.log(`[1/4] 读取 Playnite 数据 (${opts.playniteDir}) → ${opts.outDir}`)
  const ps = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', DUMP_SCRIPT,
      '-PlayniteDir', opts.playniteDir, '-OutDir', opts.outDir],
    { encoding: 'utf8' },
  )
  if (ps.status !== 0) {
    console.error(ps.stderr || ps.stdout || 'dump-playnite.ps1 failed')
    process.exit(1)
  }
  console.log(ps.stdout)
}

// ─── 2. 读 JSON + 建 Guid→Name 映射 ─────────────────────────────────────
async function loadJson(dir, file) {
  const p = path.join(dir, file)
  try {
    const raw = await fs.readFile(p, 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

/** 把 {"_id": Guid, "Name": ...} 列表建成 { guid: name } 映射。 */
function indexByName(list) {
  const map = {}
  for (const it of list || []) {
    if (it && it._id) map[it._id] = it.Name ?? ''
  }
  return map
}

async function buildMaps(outDir) {
  const maps = {
    genres: indexByName(await loadJson(outDir, 'genres.json')),
    platforms: indexByName(await loadJson(outDir, 'platforms.json')),
    companies: indexByName(await loadJson(outDir, 'companies.json')),
    categories: indexByName(await loadJson(outDir, 'categories.json')),
    tags: indexByName(await loadJson(outDir, 'tags.json')),
    series: indexByName(await loadJson(outDir, 'series.json')),
    regions: indexByName(await loadJson(outDir, 'regions.json')),
    ageratings: indexByName(await loadJson(outDir, 'ageratings.json')),
    completionstatuses: indexByName(await loadJson(outDir, 'completionstatuses.json')),
    features: indexByName(await loadJson(outDir, 'features.json')),
    sources: indexByName(await loadJson(outDir, 'sources.json')),
    emulators: indexByName(await loadJson(outDir, 'emulators.json')),
  }
  return maps
}

// ─── 字段映射辅助 ────────────────────────────────────────────────────────
const num = (v) => (typeof v === 'number' ? v : Number(v) || 0)
const numOrNull = (v) => (v == null || v === '' ? null : num(v))
const toIdArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])
const resolveNames = (ids, map) => toIdArray(ids).map((id) => map[id]).filter(Boolean)
const resolveName = (id, map) => (id == null ? null : map[id] ?? null)
const jsonArr = (a) => (Array.isArray(a) && a.length ? JSON.stringify(a) : null)
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000'
const emptyGuid = (g) => !g || g === EMPTY_GUID

/** Playnite GameAction → Playday GameAction（id 由工具生成，供 play_task 引用）。 */
function mapActions(acts) {
  // ⚠️ 源里的 GameActions 可能是**单个对象**而不是数组：PowerShell 导出 JSON 时，
  // 只有一个元素的数组会被塌成对象（实测 1283 个游戏里有 29 个如此）。
  // 以前这里 `!Array.isArray` 直接 return []，等于这些游戏的启动动作被**静默丢弃**
  // （库里 actions 为空，只能靠"无动作 → 自动找 exe"兜底）。这里统一包成数组。
  if (acts == null) return []
  const list = Array.isArray(acts) ? acts : [acts]
  if (list.length === 0) return []
  return list.map((a, i) => ({
    id: `pn-${i}`,
    name: a.Name ?? '',
    type: a.Type === 'URL' ? 'URL' : 'File',
    path: a.Path ?? undefined,
    workingDir: a.WorkingDir ?? undefined,
    arguments: a.Arguments ?? undefined,
    isPlayAction: !!a.IsPlayAction,
    trackGame: (a.TrackingMode ?? 'Default') !== 'Disabled',
  }))
}

function mapLinks(links) {
  if (!Array.isArray(links)) return []
  return links.map((l) => ({ name: l.Name ?? '', url: l.Url ?? '' }))
}

/**
 * Playnite Game 文档 → Playday games 表行。
 * Playday 特有字段填默认值；UPSERT 时已存在的行会保留原值（见 KEEP_ON_UPDATE）。
 */
function mapGame(pn, maps) {
  const actions = mapActions(pn.GameActions)
  const playId = actions.find((a) => a.isPlayAction)?.id ?? null
  return {
    id: pn._id ?? null,
    name: pn.Name ?? '',
    origin_name: null,
    localized_names: null,
    alternate_names: null,
    game_id: pn.GameId ?? null,
    installed: pn.IsInstalled ? 1 : 0,
    install_directory: pn.InstallDirectory ?? null,
    play_task: playId,
    other_tasks: null,
    last_played: null,
    play_count: num(pn.PlayCount),
    last_activity: pn.LastActivity ?? null,
    playtime: num(pn.Playtime),
    last_session_seconds: null,
    last_session_ended_at: null,
    added: pn.Added ?? null,
    modified: pn.Modified ?? null,
    category: jsonArr(resolveNames(pn.CategoryIds, maps.categories)),
    genre: jsonArr(resolveNames(pn.GenreIds, maps.genres)),
    developer: jsonArr(resolveNames(pn.DeveloperIds, maps.companies)),
    publisher: jsonArr(resolveNames(pn.PublisherIds, maps.companies)),
    tags: jsonArr(resolveNames(pn.TagIds, maps.tags)),
    series: jsonArr(resolveNames(pn.SeriesIds, maps.series)),
    age_rating: jsonArr(resolveNames(pn.AgeRatingIds, maps.ageratings)),
    region: jsonArr(resolveNames(pn.RegionIds, maps.regions)),
    source: jsonArr(resolveName(pn.SourceId, maps.sources)),
    features: jsonArr(resolveNames(pn.FeatureIds, maps.features)),
    release_date: pn.ReleaseDate ?? null,
    community_score: numOrNull(pn.CommunityScore),
    critic_score: numOrNull(pn.CriticScore),
    user_score: numOrNull(pn.UserScore),
    // hidden **必须同步**（2026-09-15 需求）：平台侧把某些游戏标成隐藏 = 这台机器 /
    // 这个渠道**不提供**该游戏，不是个人偏好 —— Playday 里也必须跟着隐藏。
    // 影响（改这里前必须知道）：hidden=1 的游戏会被客户端列表过滤掉（
    // src/utils/selectors.ts 的 `g.hidden && !opts.showHidden`），而 GamesView 目前
    // 固定传 showHidden:false —— 也就是隐藏的游戏在客户端看不到，这正是平台要的效果。
    hidden: pn.Hidden ? 1 : 0,
    favorite: pn.Favorite ? 1 : 0,
    // 封面/背景/图标：不迁移（Playday 用 CoverImages 同名图片自动匹配）。
    background_image: null,
    cover_image: null,
    icon: null,
    // description = Playnite 的描述（版本信息/简要操作）。
    description: pn.Description ?? null,
    // 备用描述：已有游戏（--clear 回填）Playday 保留原 description 时，Playnite 描述存这里。
    description_alt: null,
    // intro = Playday 用户维护的简介，迁移不填（用户后续在 Playday 里维护）。
    intro: null,
    notes: pn.Notes ?? null,
    version: pn.Version ?? null,
    platform: jsonArr(resolveNames(pn.PlatformIds, maps.platforms)),
    emulator: resolveName(pn.EmulatorId, maps.emulators),
    completion_status: resolveName(pn.CompletionStatusId, maps.completionstatuses),
    user_score_set: 0,
    manual_game: pn.Manual || pn.IsCustomGame ? 1 : 0,
    plugin_id: emptyGuid(pn.PluginId) ? null : pn.PluginId,
    links: jsonArr(mapLinks(pn.Links)),
    actions: jsonArr(actions),
    features_enabled: 0,
    guide: null,
    screenshots: null,
    videos: null,
    game_library: null,
    game_level: 1,
    pre_launch_script: pn.PreScript ?? null,
    pre_launch_enabled: 0,
    post_launch_script: pn.PostScript ?? null,
    post_launch_enabled: 0,
    post_exit_script: null,
    post_exit_enabled: 0,
    save_paths: null,
    monitor_exe: null,
  }
}

// 目标库列（与 electron/core/db.ts 的 games 表一一对应）。
const COLUMNS = [
  'id', 'name', 'origin_name', 'localized_names', 'alternate_names', 'game_id',
  'installed', 'install_directory', 'play_task', 'other_tasks', 'last_played',
  'play_count', 'last_activity', 'playtime', 'last_session_seconds',
  'last_session_ended_at', 'added', 'modified', 'category', 'genre', 'developer',
  'publisher', 'tags', 'series', 'age_rating', 'region', 'source', 'features',
  'release_date', 'community_score', 'critic_score', 'user_score', 'hidden',
  'favorite', 'background_image', 'cover_image', 'icon', 'description',
  'description_alt', 'intro', 'notes', 'version', 'platform', 'emulator',
  'completion_status', 'user_score_set',
  'manual_game', 'plugin_id', 'links', 'actions', 'features_enabled', 'guide',
  'screenshots', 'videos', 'game_library', 'game_level', 'pre_launch_script',
  'pre_launch_enabled', 'post_launch_script', 'post_launch_enabled',
  'post_exit_script', 'post_exit_enabled', 'save_paths', 'monitor_exe',
]

// ─── 3. 打开 Playday 目标库 ──────────────────────────────────────────────
function pickTargetDb(opts) {
  if (opts.dbPath) return opts.dbPath
  // 权威库优先（客户端启动会自动下发给运行时库）；否则用运行时库。
  const admin = path.join(opts.dataDir, 'Admin', 'library.db')
  const runtime = path.join(opts.dataDir, 'library', 'library.db')
  return existsSync(admin) ? admin : runtime
}

async function openDb(dbPath) {
  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(PLAYDAY_ROOT, 'node_modules', 'sql.js', 'dist', f),
  })
  const bytes = await fs.readFile(dbPath)
  const db = new SQL.Database(bytes)
  // 确保工具需要、但旧库可能没有的列存在。
  ensureColumn(db, 'games', 'description_alt', 'ALTER TABLE games ADD COLUMN description_alt TEXT')
  ensureColumn(db, 'games', 'intro', 'ALTER TABLE games ADD COLUMN intro TEXT')
  return db
}

/** 若表缺少某列，执行 ddl 补上（sql.js / SQLite 支持）。 */
function ensureColumn(db, table, column, ddl) {
  const res = db.exec(`PRAGMA table_info(${table})`)
  const cols = res.length ? res[0].values.map((v) => v[1]) : []
  if (!cols.includes(column)) {
    db.run(ddl)
  }
}

// ─── 4. 校验 + 导入（同名即停止报告，不覆盖） ─────────────────────────────
/** 找出数组里按名字重复的项（一个名字对应多条记录）。 */
function findDuplicateNames(items, getName) {
  const seen = new Set()
  const dups = new Set()
  for (const it of items) {
    const n = getName(it)
    if (!n) continue
    if (seen.has(n)) dups.add(n)
    else seen.add(n)
  }
  return [...dups]
}

/**
 * Playday 维护的字段：--clear 重导时按游戏名回填，不被 Playnite 覆盖。
 * description 单独处理（Playday 简介优先，Playnite 简介进 description_alt）。
 */
const PRESERVE = [
  'origin_name', 'localized_names', 'alternate_names',
  'last_played', 'last_session_seconds', 'last_session_ended_at',
  'game_library', 'game_level',
  'pre_launch_enabled', 'post_launch_enabled',
  'post_exit_script', 'post_exit_enabled',
  'save_paths', 'monitor_exe',
  'user_score_set', 'features_enabled',
  'guide', 'screenshots', 'videos', 'other_tasks',
  'intro',
]

/**
 * 把 Playnite 游戏导入 Playday。
 *
 * 默认模式（无 --clear）：严格导入。业务规则：一个游戏名只能对应一个游戏。
 * 发现下列任一情况即停止（不写库）：
 *   1) Playnite 数据源内部重名；
 *   2) Playday 目标库内部重名；
 *   3) Playday 目标库已存在同名游戏（工具不覆盖）。
 *
 * --clear 模式：备份后清空目标库 games 表，全量重导；按游戏名回填 Playday
 * 维护的字段（简介/游戏库/指南/视频/存档路径…），Playday 简介优先，Playnite
 * 简介进 description_alt。
 *
 * @returns {{ok: boolean, problems: string[], inserted: number}}
 */
async function importGames(db, games, maps, { clear = false } = {}) {
  const existing = new Set()
  const st = db.prepare('SELECT name FROM games')
  try {
    while (st.step()) existing.add(st.getAsObject().name)
  } finally {
    st.free()
  }

  const problems = []

  const pnDup = findDuplicateNames(games, (g) => g && g.Name)
  if (pnDup.length) {
    problems.push(`Playnite 数据源内部重名（请去 Playnite 修改游戏名）: ${pnDup.join('、')}`)
  }

  // Playday 目标库内部重名 / 跨库同名：仅非 --clear 模式阻止（清空重导后自然消失）。
  if (!clear) {
    const pdDup = []
    const dupSt = db.prepare('SELECT name FROM games GROUP BY name HAVING COUNT(*) > 1')
    try {
      while (dupSt.step()) pdDup.push(dupSt.getAsObject().name)
    } finally {
      dupSt.free()
    }
    if (pdDup.length) {
      problems.push(`Playday 目标库内部重名（请先清理）: ${pdDup.join('、')}`)
    }

    const crossDup = []
    for (const g of games) {
      if (g && g.Name && existing.has(g.Name)) crossDup.push(g.Name)
    }
    if (crossDup.length) {
      const shown = crossDup.slice(0, 20).join('、')
      problems.push(
        `Playday 目标库已存在 ${crossDup.length} 个同名游戏（工具不覆盖同名，请用 --clear 清空重导或改名）: ${shown}${crossDup.length > 20 ? '…' : ''}`,
      )
    }
  }

  if (problems.length) {
    return { ok: false, problems, inserted: 0 }
  }

  // --clear：先快照 Playday 维护的字段，再清空 games 表。
  const preserve = new Map() // name -> { col: value }
  if (clear) {
    const pSt = db.prepare('SELECT * FROM games')
    try {
      while (pSt.step()) {
        const r = pSt.getAsObject()
        const keep = {}
        for (const col of PRESERVE) keep[col] = r[col] ?? null
        keep.description = r.description ?? null
        preserve.set(r.name, keep)
      }
    } finally {
      pSt.free()
    }
    db.run('DELETE FROM games')
  }

  const cols = COLUMNS.join(', ')
  const placeholders = COLUMNS.map(() => '?').join(', ')
  const insertSql = `INSERT INTO games (${cols}) VALUES (${placeholders})`
  let inserted = 0

  db.run('BEGIN')
  try {
    for (const pn of games) {
      if (!pn || !pn.Name) continue
      const row = mapGame(pn, maps)
      if (!row.name) continue

      // --clear 时按名回填 Playday 维护的字段。
      const keep = clear ? preserve.get(row.name) : undefined
      if (keep) {
        for (const col of PRESERVE) row[col] = keep[col]
        if (keep.description) {
          // Playday 简介优先保留，Playnite 简介存 description_alt。
          row.description = keep.description
          row.description_alt = pn.Description ?? null
        } else {
          row.description_alt = null
        }
      } else if (clear) {
        row.description_alt = null
      }

      db.run(insertSql, COLUMNS.map((c) => row[c]))
      inserted++
    }
    db.run('COMMIT')
    // 确保唯一索引存在（防止以后重名）。此时库内已无重名，创建必然成功。
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_games_name ON games(name)')
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
  return { ok: true, problems: [], inserted }
}

// ─── main ────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2))

  // ── --reset：一键清空目标库 games 表（备份后），不导入。 ──
  if (opts.reset) {
    const dbPath = pickTargetDb(opts)
    console.log(`[清空] 目标库 ${dbPath}`)
    const bakPath = `${dbPath}.reset-bak`
    await fs.copyFile(dbPath, bakPath)
    console.log(`  已备份 → ${bakPath}`)
    const db = await openDb(dbPath)
    try {
      const n = db.exec('SELECT COUNT(*) n FROM games').length
        ? (db.exec('SELECT COUNT(*) n FROM games')[0].values[0][0])
        : 0
      db.run('DELETE FROM games')
      const out = db.export()
      await fs.writeFile(dbPath, out)
      console.log(`  已清空 games 表（删除 ${n} 个游戏）。其他表（用户/游戏库/平台）保留。`)
      console.log(`  接下来可运行迁移工具全量导入。`)
    } finally {
      db.close()
    }
    return
  }

  if (!opts.skipDump) runDump(opts)
  else console.log('[1/4] 跳过 dump（--skip-dump）')

  console.log('[2/4] 解析 Playnite JSON + 建映射…')
  const games = await loadJson(opts.outDir, 'games.json')
  const maps = await buildMaps(opts.outDir)
  console.log(`  游戏 ${games.length} 个；类型 ${Object.keys(maps.genres).length}、平台 ${Object.keys(maps.platforms).length}、厂商 ${Object.keys(maps.companies).length}`)

  // --out-json：只导出映射结果（增量同步按 id 增/改时用），不碰数据库。
  // 为什么需要它：增量同步要用**真实映射**得到完整行（含 Playday 特有字段的默认值，
  // 如 game_level / actions 结构），手写一份既容易漏字段、也会和既有行形态不一致。
  // 导出的 JSON 可以合进 dev-data/library-json/games.json 的对应行，再 npm run db:import -- --apply 回写
  // （2026-09-16 起；旧的 playday-db.mjs import 已退役，见 docs/design/library-json.md）。
  if (opts.outJson) {
    const mapped = games.map((g) => mapGame(g, maps))
    await fs.writeFile(opts.outJson, JSON.stringify(mapped, null, 2), 'utf8')
    console.log(`[仅导出] ${mapped.length} 行 → ${opts.outJson}（未打开、未改动任何数据库）`)
    return
  }

  const dbPath = pickTargetDb(opts)
  console.log(`[3/4] 打开目标库 ${dbPath}`)

  // 写库前备份。
  const bakPath = `${dbPath}.migrate-bak`
  await fs.copyFile(dbPath, bakPath)
  console.log(`  已备份 → ${bakPath}`)

  const db = await openDb(dbPath)
  try {
    const result = await importGames(db, games, maps, { clear: opts.clear })
    if (!result.ok) {
      console.error('[4/4] 迁移停止：发现同名/数据问题，未写入任何数据。')
      for (const p of result.problems) console.error('  ✗ ' + p)
      console.error('请先处理上述问题后重新运行。')
      process.exitCode = 1
      return
    }
    const out = db.export()
    await fs.writeFile(dbPath, out)
    console.log('[4/4] 写入完成')
    if (opts.clear) {
      console.log(`  已清空重导：导入 ${result.inserted} 个游戏，并回填 Playday 维护的简介/游戏库/指南等字段。`)
    } else {
      console.log(`  导入 ${result.inserted} 个游戏（无同名冲突）。`)
    }
    console.log(`  封面由 Playday 启动时按 CoverImages 同名图自动匹配。`)
  } finally {
    db.close()
  }
}

main().catch((e) => {
  console.error('迁移失败:', e)
  process.exit(1)
})
