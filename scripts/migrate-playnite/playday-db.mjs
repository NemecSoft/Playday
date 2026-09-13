#!/usr/bin/env node
/**
 * playday-db.mjs — Playday 数据库 ↔ JSON 双向工具。
 *
 * 不想用 GUI 管理数据时，用 JSON 直接编辑游戏字段（简介 intro、描述、类型…），
 * 然后一键写回数据库。
 *
 * 用法：
 *   导出： node playday-db.mjs export [--db <库>] [--out games.json]
 *   导入： node playday-db.mjs import [--db <库>] [--in games.json]
 *
 * 说明：
 *   - 导出字段用 camelCase（与 Game 类型一致），数组字段（genre/developer…）是
 *     JSON 数组，bool 是 true/false，简介是 intro。
 *   - 导入按 id 匹配更新；id 不存在则插入。写库前自动备份。若 JSON 内有重名
 *     （或改名后与库中其他游戏冲突）会停止报告。
 */

import { createRequire } from 'node:module'
import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { adminDbPath, runtimeDbPath } from '../lib/devData.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const PLAYDAY_ROOT = path.resolve(__dirname, '..', '..')
// 默认库路径来自规则表（scripts/lib/devData.mjs）：权威库优先，其次运行时副本。
// 别再把目录名拼在这儿 —— 数据目录挪过位置，拼死的默认值会指到一个不存在的库。
const DEFAULT_DB = existsSync(adminDbPath()) ? adminDbPath() : runtimeDbPath()

// ─── 字段映射：camelCase(Game) → snake_case(列) ─────────────────────────
// 第三项：'arr' 数组字段(JSON 序列化) / 'bool' 布尔字段(0/1) / undefined 普通文本
const FIELD_MAP = [
  ['id', 'id'],
  ['name', 'name'],
  ['originName', 'origin_name'],
  ['localizedNames', 'localized_names', 'arr'],
  ['alternateNames', 'alternate_names', 'arr'],
  ['gameId', 'game_id'],
  ['installed', 'installed', 'bool'],
  ['installDirectory', 'install_directory'],
  ['playTask', 'play_task'],
  ['otherTasks', 'other_tasks', 'arr'],
  ['lastPlayed', 'last_played'],
  ['playCount', 'play_count'],
  ['lastActivity', 'last_activity'],
  ['playtime', 'playtime'],
  ['lastSessionSeconds', 'last_session_seconds'],
  ['lastSessionEndedAt', 'last_session_ended_at'],
  ['added', 'added'],
  ['modified', 'modified'],
  ['category', 'category', 'arr'],
  ['genre', 'genre', 'arr'],
  ['developer', 'developer', 'arr'],
  ['publisher', 'publisher', 'arr'],
  ['tags', 'tags', 'arr'],
  ['series', 'series', 'arr'],
  ['ageRating', 'age_rating', 'arr'],
  ['region', 'region', 'arr'],
  ['source', 'source', 'arr'],
  ['features', 'features', 'arr'],
  ['releaseDate', 'release_date'],
  ['communityScore', 'community_score'],
  ['criticScore', 'critic_score'],
  ['userScore', 'user_score'],
  ['hidden', 'hidden', 'bool'],
  ['favorite', 'favorite', 'bool'],
  ['backgroundImage', 'background_image'],
  ['coverImage', 'cover_image'],
  ['icon', 'icon'],
  ['description', 'description'],
  ['intro', 'intro'],
  ['notes', 'notes'],
  ['version', 'version'],
  ['platform', 'platform', 'arr'],
  ['emulator', 'emulator'],
  ['completionStatus', 'completion_status'],
  ['userScoreSet', 'user_score_set', 'bool'],
  ['manualGame', 'manual_game', 'bool'],
  ['pluginId', 'plugin_id'],
  ['links', 'links', 'arr'],
  ['actions', 'actions', 'arr'],
  ['featuresEnabled', 'features_enabled', 'bool'],
  ['guide', 'guide'],
  ['screenshots', 'screenshots', 'arr'],
  ['videos', 'videos', 'arr'],
  ['gameLibrary', 'game_library'],
  ['gameLevel', 'game_level'],
  ['preLaunchScript', 'pre_launch_script'],
  ['preLaunchEnabled', 'pre_launch_enabled', 'bool'],
  ['postLaunchScript', 'post_launch_script'],
  ['postLaunchEnabled', 'post_launch_enabled', 'bool'],
  ['postExitScript', 'post_exit_script'],
  ['postExitEnabled', 'post_exit_enabled', 'bool'],
  ['savePaths', 'save_paths', 'arr'],
  ['monitorExe', 'monitor_exe'],
]
const COLUMNS = FIELD_MAP.map((f) => f[1])

function parseArgs(argv) {
  const cmd = argv[0]
  const get = (name, dflt) => {
    const i = argv.indexOf(name)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
  }
  return {
    cmd,
    dbPath: get('--db', DEFAULT_DB),
    out: get('--out', path.join(process.cwd(), 'games.json')),
    inFile: get('--in', path.join(process.cwd(), 'games.json')),
  }
}

async function openDb(dbPath) {
  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(PLAYDAY_ROOT, 'node_modules', 'sql.js', 'dist', f),
  })
  const db = new SQL.Database(await fs.readFile(dbPath))
  const res = db.exec('PRAGMA table_info(games)')
  const cols = res.length ? res[0].values.map((v) => v[1]) : []
  if (!cols.includes('intro')) db.run('ALTER TABLE games ADD COLUMN intro TEXT')
  return db
}

// ─── 导出：行 → camelCase Game（导出完整字段，方便直接编辑） ─────────────
function rowToGame(r) {
  const game = {}
  for (const [prop, col, kind] of FIELD_MAP) {
    const v = r[col]
    if (kind === 'arr') {
      if (v == null) { game[prop] = []; continue }
      try { game[prop] = JSON.parse(v) } catch { game[prop] = [] }
    } else if (kind === 'bool') {
      game[prop] = Number(v) === 1
    } else {
      game[prop] = v ?? null
    }
  }
  return game
}

async function doExport(opts) {
  const db = await openDb(opts.dbPath)
  try {
    const st = db.prepare('SELECT * FROM games')
    const rows = []
    while (st.step()) rows.push(st.getAsObject())
    st.free()
    const games = rows.map(rowToGame)
    await fs.writeFile(opts.out, JSON.stringify(games, null, 2), 'utf8')
    console.log(`导出 ${games.length} 个游戏 → ${opts.out}`)
  } finally {
    db.close()
  }
}

// ─── 导入：camelCase Game → 行 → 写回 ───────────────────────────────────
function gameToRow(g) {
  const row = {}
  for (const [prop, col, kind] of FIELD_MAP) {
    const v = g[prop]
    if (kind === 'arr') row[col] = Array.isArray(v) ? JSON.stringify(v) : null
    else if (kind === 'bool') row[col] = v ? 1 : 0
    else row[col] = v == null || v === '' ? null : v
  }
  return row
}

async function doImport(opts) {
  const raw = await fs.readFile(opts.inFile, 'utf8')
  const games = JSON.parse(raw)
  if (!Array.isArray(games)) throw new Error('JSON 顶层必须是游戏数组')

  // 校验：JSON 内部不能重名。
  const seen = new Map()
  const dupNames = new Set()
  for (const g of games) {
    const n = g?.name
    if (!n) continue
    if (seen.has(n)) dupNames.add(n)
    else seen.set(n, g.id)
  }
  if (dupNames.size) {
    console.error(`JSON 内有重名游戏（请先改名）: ${[...dupNames].join('、')}`)
    process.exitCode = 1
    return
  }

  const dbPath = opts.dbPath
  const bakPath = `${dbPath}.json-bak`
  await fs.copyFile(dbPath, bakPath)
  console.log(`已备份 → ${bakPath}`)

  const db = await openDb(dbPath)
  try {
    // 现有 id → name 映射，用于检测改名冲突。
    const idToName = new Map()
    const st = db.prepare('SELECT id, name FROM games')
    while (st.step()) {
      const r = st.getAsObject()
      idToName.set(r.id, r.name)
    }
    st.free()

    // 检测：JSON 里的名字若与库中"另一个 id"的游戏同名 → 冲突（不允许改名成已存在的名字）。
    const conflicts = []
    for (const g of games) {
      if (!g?.name) continue
      const existingForName = [...idToName.entries()].find(([id, n]) => n === g.name)
      // 归一化：JSON 里缺 id 是 undefined，库里存的是 NULL。不归一化的话
      // `null !== undefined` 恒为真，会把"同一条无 id 的记录"误判成改名冲突而中止导入。
      if (existingForName && (existingForName[0] ?? null) !== (g.id ?? null)) {
        conflicts.push(`${g.name}（与库中 id=${existingForName[0]} 同名）`)
      }
    }
    if (conflicts.length) {
      console.error(`导入停止：改名后与库中已有游戏同名（请先处理）: ${conflicts.slice(0, 20).join('；')}`)
      process.exitCode = 1
      return
    }

    const cols = COLUMNS.join(', ')
    const placeholders = COLUMNS.map(() => '?').join(', ')
    const insertSql = `INSERT INTO games (${cols}) VALUES (${placeholders})`
    const updateSql = `UPDATE games SET ${COLUMNS.filter((c) => c !== 'id').map((c) => `${c} = ?`).join(', ')} WHERE id = ?`
    // id 为 NULL 的行不能用 `id = ?`（SQL 里 NULL = NULL 恒不成立），必须用 IS NULL。
    // 库里确实存在这种行：games.json 里有条目没有 id，首次导入会以 NULL 插入。
    const updateSqlNullId = `UPDATE games SET ${COLUMNS.filter((c) => c !== 'id').map((c) => `${c} = ?`).join(', ')} WHERE id IS NULL`

    let inserted = 0
    let updated = 0
    db.run('BEGIN')
    try {
      for (const g of games) {
        if (!g?.name) continue
        const row = gameToRow(g)
        // 同冲突检测：把 undefined 归一化成 null，才能正确匹配到库里的 NULL id 行
        // （否则每次导入都会重复 INSERT 一条无 id 的游戏）。
        const gid = g.id ?? null
        if (idToName.has(gid)) {
          const args = COLUMNS.filter((c) => c !== 'id').map((c) => row[c])
          if (gid === null) {
            db.run(updateSqlNullId, args)
          } else {
            db.run(updateSql, args.concat(gid))
          }
          updated++
        } else {
          db.run(insertSql, COLUMNS.map((c) => row[c]))
          idToName.set(gid, g.name)
          inserted++
        }
      }
      db.run('COMMIT')
      db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_games_name ON games(name)')
    } catch (e) {
      db.run('ROLLBACK')
      throw e
    }
    const out = db.export()
    await fs.writeFile(dbPath, out)
    console.log(`导入完成：更新 ${updated}，新增 ${inserted}`)
  } finally {
    db.close()
  }
}

// ─── main ────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.cmd === 'export') await doExport(opts)
  else if (opts.cmd === 'import') await doImport(opts)
  else {
    console.error('用法: node playday-db.mjs export|import [--db <库>] [--out|--in <json>]')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('失败:', e)
  process.exit(1)
})
