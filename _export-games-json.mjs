// 导出权威库 → games.json（供人工查看/可再用 playday-db.mjs import 写回）
// 规则（用户指定）：
//   - coverImage 一律置空字符串（不再使用）
//   - developer/publisher/genre/tags/series/category/platform 等关系字段
//     全部是「名称数组」（导入时已按 id 解析成名称），不再出现 id
//   - 不带单独的查找表，全部平铺为名称
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { adminDbPath } from './scripts/lib/devData.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const ROOT = path.resolve(__dirname)
const DB = adminDbPath()
const OUT = path.join(ROOT, 'games.json')

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
  ['coverImage', 'cover_image'],
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
  ['monitorExe', 'monitor_exe'],
  ['savePaths', 'save_paths', 'arr'],
]

const initSqlJs = require('sql.js')
const SQL = await initSqlJs({ locateFile: (f) => path.join(ROOT, 'node_modules/sql.js/dist/', f) })
const db = new SQL.Database(readFileSync(DB))

const st = db.prepare('SELECT * FROM games')
const rows = []
while (st.step()) rows.push(st.getAsObject())
st.free()
db.close()

const games = rows.map((r) => {
  const g = {}
  for (const [prop, col, kind] of FIELD_MAP) {
    const v = r[col]
    if (kind === 'arr') {
      if (v == null || v === '') { g[prop] = []; continue }
      try { g[prop] = JSON.parse(v) } catch { g[prop] = [] }
    } else if (kind === 'bool') {
      g[prop] = Number(v) === 1
    } else {
      g[prop] = v ?? null
    }
  }
  // 用户要求：coverImage 不再使用，填为空
  g.coverImage = ''
  return g
})

writeFileSync(OUT, JSON.stringify(games, null, '\t'), 'utf8')
console.log(`导出 ${games.length} 个游戏 → ${OUT}`)

// 抽样打印 3 个有开发商/系列数据的，便于人工核对
for (const g of games.filter((g) => g.developer.length && g.series.length).slice(0, 3)) {
  console.log(JSON.stringify({ name: g.name, developer: g.developer, genre: g.genre, tags: g.tags, series: g.series, coverImage: g.coverImage }))
}
