// 架构守卫（npm run lint:arch / npm run check）。
//
// 目的：把"本项目已经踩过"的几类漂移变成**自动失败**，而不是靠人记得。
//   1) 实体类型只能定义在 shared/models.ts。两个 shim 文件
//      （electron/core/models.ts、src/types/models.ts）必须只做 re-export。
//      —— 以前 AppSettings/Game 在三处手抄，加字段漏改一处就是静默失效。
//   2) 任何非 shared 的源码文件不得再定义这些实体（同类漂移，如 mailSender
//      里的 ErrorReportConfig）。
//   3) 分层：src/ 不得 import electron/；electron/ 不得 import src/。
//   4) 渲染层不得直接碰 sql.js（数据只经 IPC，双端一致）。
//
// 退出码非 0 表示有违规。忽略 node_modules / dist / release / 备份文件。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SHARED_MODEL = 'shared/models.ts'
const SHIMS = ['electron/core/models.ts', 'src/types/models.ts']

// 单一来源管理的实体类型名。
const ENTITIES = [
  'Game', 'GameAction', 'GameLibrary', 'GameName', 'GameVideo', 'GameLink',
  'Platform', 'AppUser', 'SessionUser', 'LibraryStats', 'LibraryPluginInfo',
  'AppSettings', 'CardTextStyle', 'ErrorReportConfig', 'CrashReport',
  'DesignerConfig', 'GradientSpec', 'DeepPartial',
]

const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-electron', 'release', '.git', '.vite'])
const CODE_EXT = ['.ts', '.tsx', '.mts', '.mjs', '.js']

function walk(dir, out = [], exts = CODE_EXT) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out, exts)
    else if (exts.some((x) => e.name.endsWith(x))) out.push(full)
  }
  return out
}

/** 只去注释（保留字符串），用于扫描 import 语句。 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

/** 再去掉字符串字面量，避免把注释/字符串里的 "interface Game" 当成定义。 */
function stripCommentsAndStrings(src) {
  return stripComments(src)
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
}

const violations = []
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/')

// shared/models.ts 导出的名字：shim 里不得再声明同名类型。
// （前端独有的视图模型如 CurrentUser/RunningGame 不在 shared 里，允许留在 shim。）
const sharedCode = stripCommentsAndStrings(fs.readFileSync(path.join(ROOT, SHARED_MODEL), 'utf8'))
const sharedNames = new Set(
  [...sharedCode.matchAll(/\bexport\s+(?:interface|type|const|function)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
)

// ---- 1) shim 文件不得重复声明 shared 里的类型 ----
for (const shim of SHIMS) {
  const full = path.join(ROOT, shim)
  if (!fs.existsSync(full)) continue
  const code = stripCommentsAndStrings(fs.readFileSync(full, 'utf8'))
  const decl = [...code.matchAll(/\b(?:export\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)\s*[={]/g)].map((m) => m[1])
  for (const name of decl) {
    if (!sharedNames.has(name)) continue
    violations.push(`${shim}: 重复声明了 shared 里的类型 \`${name}\` —— 这里只应 re-export，实体定义留在 ${SHARED_MODEL}`)
  }
}

// ---- 2) 实体类型不得在别处重复定义 ----
for (const file of walk(ROOT)) {
  const r = rel(file)
  if (r === SHARED_MODEL) continue
  if (r.includes('__tests__') || r.endsWith('.test.ts') || r.endsWith('.test.tsx')) continue
  if (r.startsWith('scripts/')) continue // 守卫自身会列举这些名字
  const code = stripCommentsAndStrings(fs.readFileSync(file, 'utf8'))
  for (const name of ENTITIES) {
    const re = new RegExp(`\\b(?:export\\s+)?interface\\s+${name}\\b|\\bexport\\s+type\\s+${name}\\s*=`)
    if (re.test(code)) {
      violations.push(`${r}: 重复定义了实体类型 \`${name}\` —— 单一事实来源是 ${SHARED_MODEL}，这里只能 re-export`)
    }
  }
}

// ---- 3) / 4) 分层与渲染层依赖 ----
const NODE_BUILTINS = ['fs', 'path', 'child_process', 'os', 'crypto', 'net', 'http', 'https']
for (const file of walk(ROOT)) {
  const r = rel(file)
  const src = stripComments(fs.readFileSync(file, 'utf8'))
  const specs = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])

  if (r.startsWith('src/')) {
    for (const s of specs) {
      if (/(\.\.\/)+electron\//.test(s) || s.startsWith('electron/')) {
        violations.push(`${r}: 渲染层不得 import 主进程代码（${s}）`)
      }
      if (s === 'sql.js' || s.startsWith('sql.js/')) {
        violations.push(`${r}: 渲染层不得直接依赖 sql.js（数据只经 IPC）`)
      }
      if (NODE_BUILTINS.includes(s) || s.startsWith('node:')) {
        violations.push(`${r}: 渲染层不得 import Node 内置模块（${s}）`)
      }
    }
  }
  if (r.startsWith('electron/')) {
    for (const s of specs) {
      if (/(\.\.\/)+src\//.test(s) || s.startsWith('src/')) {
        violations.push(`${r}: 主进程不得 import 渲染层代码（${s}）`)
      }
    }
  }
}

// ---- 5) "封面上的文字"样式（--card-*）不得用在界面文字上 ----
// 由来：明亮主题下侧栏标签"整列字都是糊的"——界面文字误用了 --card-text-color
// （默认暖白 #fff8e7，那是给"盖在封面图上"的文字调的，封面总是深色）。
// --card-text-color 只允许出现在封面/遮罩文字的选择器里（.grid-card 内部）。
for (const file of walk(ROOT, [], ['.css'])) {
  const r = rel(file)
  const css = fs.readFileSync(file, 'utf8')
  // 按 `选择器 { 声明 }` 粗扫（本项目 CSS 没有嵌套块，够用）。
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = m[2]
    if (!/var\(--card-text-color/.test(body)) continue
    const selector = m[1].split('\n').pop().trim()
    if (/\.grid-card|\.title\b|cover/.test(selector)) continue
    violations.push(
      `${r}: 选择器 \`${selector}\` 用了 --card-text-color —— 那是"封面上的文字"颜色（默认暖白），界面文字请用主题令牌（--text-*）`,
    )
  }
}

// ---- 6) 数据目录名不得在"解析器"之外拼死 ----
// CoverImages / Game_Details / announcements / Admin / library.db 这些名字只允许出现在
// 两个解析器里：shared/pathConfig.ts（桌面端，含默认名）和 server/paths.mjs（网站端孪生）。
// 由来：server.mjs 曾把这三个目录写死，桌面端配了自定义目录网站端读不到（"配了没用"）。
const DATA_DIR_NAMES = ['CoverImages', 'Game_Details', 'announcements', 'Admin', 'library.db']
const PATH_RESOLVERS = new Set(['shared/pathConfig.ts', 'server/paths.mjs'])
for (const file of walk(ROOT)) {
  const r = rel(file)
  if (PATH_RESOLVERS.has(r)) continue
  if (r.startsWith('scripts/') || r.startsWith('_')) continue // 一次性维护/迁移脚本可以自己拼
  if (r.includes('__tests__') || r.endsWith('.test.ts') || r.endsWith('.test.tsx')) continue
  const code = stripCommentsAndStrings(fs.readFileSync(file, 'utf8'))
  for (const m of code.matchAll(/\b(?:path\.join|path\.resolve|joinPaths)\s*\(([^)]*)\)/g)) {
    const hit = DATA_DIR_NAMES.find((n) => m[1].includes(n))
    if (hit) {
      violations.push(
        `${r}: 用路径拼接写死了数据目录名 \`${hit}\` —— 请走 shared/pathConfig.ts（桌面端）/ server/paths.mjs（网站端）解析，或加进配置项`,
      )
    }
  }
}

// ---- 7) cover_image 已废弃：不许再写，网站端不许再读 ----
// 封面来源 = 运行期扫封面目录 + 按游戏名匹配（shared/coverMatch.ts，桌面/网站共用）。
// games.cover_image 列保留只为旧库兼容：不再写入；网站端也不能读它
// （读了就永远是空封面 —— 导出时该字段一律置空）。
for (const file of walk(ROOT)) {
  const r = rel(file)
  if (r.startsWith('scripts/') || r.startsWith('_')) continue // 一次性导出/维护脚本按需保留
  if (r.includes('__tests__') || r.endsWith('.test.ts') || r.endsWith('.test.tsx')) continue
  const code = stripCommentsAndStrings(fs.readFileSync(file, 'utf8'))
  if (/\$cover_image/.test(code)) {
    violations.push(
      `${r}: 又在写已废弃的 cover_image 列 —— 封面是运行期匹配的内存值，不落库（见 shared/coverMatch.ts）`,
    )
  }
  if (r.startsWith('server/') && /cover_image/.test(code)) {
    violations.push(
      `${r}: 网站端不得读已废弃的 cover_image 列 —— 请用 server/coverMatch.mjs 运行期匹配`,
    )
  }
}

// ---- 8) Tailwind 的 --tw-* 变量初始化不得缺失 ----
// 由来：src/styles/global.css 故意不引 @tailwind base（怕它的 reset 打乱自定义元素样式），
// 但 v3 的 transform / filter / backdrop-filter / ring 工具类都是**拼装 var(--tw-*)**：
//     .-translate-x-1\/2 { --tw-translate-x: -50%; transform: translate(var(--tw-translate-x), var(--tw-translate-y)) … }
// 变量初值只在 preflight 里给 → 只要有一个取不到值，整条声明在"计算值阶段"作废、
// 静默变 none，不报错。实测：通知条的 -translate-x-1/2 不生效，偏在屏幕右侧（用户报的
// "错误提示不在中间"）。这里把"用了这些类 → 变量必须在"变成自动失败。
// （shadow-* / space-* 自带兜底，不在此列 —— 别扩大化。）
const TW_ENTRY = 'src/styles/global.css'
const TW_NEEDS = [
  {
    name: 'transform（translate/scale/rotate/skew）',
    use: /(?:^|[\s"'`:.])(?:-)?(?:translate-[xy]-|scale(?:-[xy])?-|rotate-|skew-[xy]-)/,
    vars: ['--tw-translate-x', '--tw-translate-y', '--tw-rotate', '--tw-skew-x', '--tw-skew-y', '--tw-scale-x', '--tw-scale-y'],
  },
  {
    name: 'filter / backdrop-filter（blur 等）',
    use: /(?:^|[\s"'`:.])(?:backdrop-)?blur-/,
    vars: ['--tw-blur', '--tw-backdrop-blur'],
  },
  {
    name: 'ring（焦点环；缺变量还会连带把同元素的 box-shadow 弄失效）',
    use: /(?:^|[\s"'`:.])(?:focus-visible:|focus:|hover:)?ring-/,
    vars: ['--tw-ring-inset', '--tw-ring-color', '--tw-ring-offset-width', '--tw-ring-shadow', '--tw-ring-offset-shadow'],
  },
]
const twEntryPath = path.join(ROOT, TW_ENTRY)
const twCss = fs.existsSync(twEntryPath) ? stripComments(fs.readFileSync(twEntryPath, 'utf8')) : ''
for (const file of walk(ROOT, [], ['.tsx', '.css'])) {
  const r = rel(file)
  if (r === TW_ENTRY) continue // 变量层就定义在这个文件里，不自己查自己
  if (r.startsWith('_')) continue // 一行性临时文件（_tmp_*.css 等），与 6)/7) 的豁免保持一致
  const text = stripComments(fs.readFileSync(file, 'utf8'))
  for (const need of TW_NEEDS) {
    if (!need.use.test(text)) continue
    const missing = need.vars.filter((v) => !twCss.includes(v + ':'))
    if (missing.length) {
      violations.push(
        `${r}: 用了 Tailwind 的 ${need.name} 类，但 ${TW_ENTRY} 缺少变量初始化 ${missing.join(' / ')} —— 这些类会静默失效（声明整条作废），别删那段 --tw-* 块或改回 @tailwind base`,
      )
    }
  }
}

// ---- 9) config.json 的路径字段必须显式配置（不得靠"空串 → 默认"回退）----
// 由来：这些字段的语义是"空 = 用默认目录 <数据根>/xxx"，而**数据根**又会被
// YUNGAME_DATA_DIR / exe 位置改变 —— 留空时"实际在用哪个目录"是隐式的，从 config.json
// 里看不出来（用户就问过"为什么是空的？"）。本机约定：全部显式写。
// **相对路径是允许的**：基准 = 应用 exe 所在目录（桌面端 appRoot()，见 shared/pathConfig.ts）。
// 存在性检查的基准取本仓库根 —— 它正是开发态的 appRoot，所以顺带能验出"配了但指到空处"。
// 注意：gameSaveHelperPath 是**文件**且"空 = 备份不可用"是合法状态，不在此列。
const CONFIG_FILE = 'config.json'
const CONFIG_REQUIRED_PATHS = [
  'coverImagesDir',
  'gameDetailsDir',
  'announcementsDir',
  'libraryDir',
  'sourceLibraryDir',
  'defaultGameRootPath',
  // 下面两个也是"程序自带资源的落位"：runtimeDir 是运行库安装包目录、yungamestartDir 是
  // 开机自启工具目录。以前它们是代码里写死的默认值（<exe 同级>/xxx），运维想换位置只能重新
  // 出包；现在由 path-modes.json 定，所以也必须显式写在 config.json 里 —— 否则"实际在用哪个
  // 目录"又变成隐式的（正是本规则要拦的那件事）。
  'runtimeDir',
  'yungamestartDir',
]
// 这几项必须真实存在 —— 配错就是"封面全空 / 读不到库"这类静默故障。
// defaultGameRootPath 不查存在性：它是"游戏放在哪"的根，新机器上可能还没拷游戏进去。
const CONFIG_MUST_EXIST = CONFIG_REQUIRED_PATHS.filter((k) => k !== 'defaultGameRootPath')
const CONFIG_CHECK_ROOT = ROOT
const configFull = path.join(ROOT, CONFIG_FILE)
if (fs.existsSync(configFull)) {
  let cfg = null
  try {
    cfg = JSON.parse(fs.readFileSync(configFull, 'utf8'))
  } catch (e) {
    violations.push(`${CONFIG_FILE}: 解析失败（${e.message}）`)
  }
  const st = cfg?.settings
  for (const key of CONFIG_REQUIRED_PATHS) {
    const v = st?.[key]
    if (typeof v !== 'string' || !v.trim()) {
      violations.push(
        `${CONFIG_FILE}: settings.${key} 为空 —— 本项目约定路径全部显式配置（空串会隐式回落到 <数据根>/…，实际用哪个目录看不出来）`,
      )
      continue
    }
    if (!CONFIG_MUST_EXIST.includes(key)) continue
    const isAbs = /^[A-Za-z]:[\\/]/.test(v) || v.startsWith('\\\\') || v.startsWith('//')
    const abs = isAbs ? v : path.join(CONFIG_CHECK_ROOT, v)
    if (!fs.existsSync(abs)) {
      violations.push(
        `${CONFIG_FILE}: settings.${key} = "${v}" 解析到 ${abs}，但该目录不存在 —— 相对路径的基准是"应用 exe 所在目录"（本仓库内 = 仓库根）`,
      )
    }
  }
}

// ---- 10) 人工内容源 data/game-content.json 必须在、且结构完好 ----
// 由来：简介/地区/标签是**人工维护**的长期数据（不是构建产物）。它一度放在 release/data/
// 下 —— 而 .gitignore 只放行 release/data 里的 library、announcements、config.json，
// 于是那份几百 KB 的人工成果**根本没进 git**，随时可能随目录清理一起丢。现已固定在
// data/game-content.json（仓库根，纳入版本管理）。
// 这里拦两种事故：文件被删/挪走，以及被编辑坏（JSON 语法错、条目缺字段、整体变空）。
// 重建/补齐：node scripts/gen-game-content.mjs（只补空缺，不覆盖已有值）。
const CONTENT_FILE = 'data/game-content.json'
const CONTENT_REQUIRED_KEYS = ['gameid', 'name', 'intro', 'region', 'tags', 'gamelevel']
const contentFull = path.join(ROOT, CONTENT_FILE)
if (!fs.existsSync(contentFull)) {
  violations.push(
    `${CONTENT_FILE} 不存在 —— 这是人工维护的游戏内容源（简介/地区/标签），不是构建产物，别删也别挪出仓库；补齐：node scripts/gen-game-content.mjs`,
  )
} else {
  let items = null
  try {
    items = JSON.parse(fs.readFileSync(contentFull, 'utf8'))
  } catch (e) {
    violations.push(`${CONTENT_FILE}: JSON 解析失败（${e.message}）—— 手工编辑时括号/逗号写坏了？`)
  }
  if (items !== null && !Array.isArray(items)) {
    violations.push(`${CONTENT_FILE}: 顶层必须是数组（一条一个游戏）`)
  } else if (Array.isArray(items)) {
    if (!items.length) {
      violations.push(`${CONTENT_FILE} 是空数组 —— 内容丢了？补齐：node scripts/gen-game-content.mjs`)
    }
    const noName = items.filter((it) => !it || typeof it.name !== 'string' || !it.name.trim())
    if (noName.length) violations.push(`${CONTENT_FILE}: ${noName.length} 条缺 name 字段`)
    const lackKey = items.filter((it) => it && CONTENT_REQUIRED_KEYS.some((k) => !(k in it)))
    if (lackKey.length) {
      violations.push(
        `${CONTENT_FILE}: ${lackKey.length} 条缺字段（每条应有 ${CONTENT_REQUIRED_KEYS.join(' / ')}），例如 "${lackKey[0]?.name ?? '?'}"`,
      )
    }
    // savepaths 是**可选**字段（没配存档的游戏就不该有这个键），但一旦写了必须是
    // "非空字符串数组"：手写时最容易写成字符串或塞空数组，而坏值会让"备份存档"
    // 拿着错路径去找文件 —— 只在这类静默故障上下守卫（与 cover_image 那次同理）。
    const badSavePaths = items.filter(
      (it) =>
        it &&
        'savepaths' in it &&
        !(Array.isArray(it.savepaths) && it.savepaths.length > 0 && it.savepaths.every((p) => typeof p === 'string' && p.trim())),
    )
    if (badSavePaths.length) {
      violations.push(
        `${CONTENT_FILE}: ${badSavePaths.length} 条 savepaths 不是「非空字符串数组」（例如 "${badSavePaths[0]?.name ?? '?'}"）—— 留空就别写这个键`,
      )
    }
  }
}

// ---- 11) 数据根已从 release/data 迁到 dev-data：不许再指回去 ----
// 由来：release/ 曾经是"打包产物 + 便携数据"混在一起的目录 —— 清一次打包目录就等于清数据，
// 而它同时又会被打包脚本反复重写：两条生命周期完全不同的东西共用一个路径。
// 2026-09-14 拆开：release/ = 纯打包产物（随时可删掉重打）；dev-data/ = 开发/测试态数据根。
// 这里把"又指回 release/data"变成自动失败 —— 那种引用要么读到一个不存在的库，
// 要么更糟：读到上次打包残留的旧副本，表现成"数据莫名其妙回退了"，极难排查。
// 扫描范围比其它规则宽（补上 .bat / .ps1 / .md）：这些引用绝大多数就写在那几种文件里。
const LEGACY_DATA_REF = /release[/\\]+data/i
for (const file of walk(ROOT, [], ['.ts', '.tsx', '.mts', '.mjs', '.js', '.bat', '.ps1', '.md'])) {
  const r = rel(file)
  if (r === 'scripts/check-architecture.mjs') continue // 本文件就是这条规则的定义处
  if (r.startsWith('docs/plans/')) continue // 历史计划文档：记录的是当时的布局，不改写
  const code = stripComments(fs.readFileSync(file, 'utf8'))
  if (LEGACY_DATA_REF.test(code)) {
    violations.push(
      `${r}: 还在引用已废弃的 release/data —— 开发/测试态数据根是 dev-data/（release/ 是纯打包产物，随时会被重写）。见 docs/design/directory-structure.md`,
    )
  }
}

// ---- 12) 开发态数据目录名只许出现在解析器和它的 cmd 桥里 ----
// 由来：`dev-data` 这个名字曾经在 8 个 bat + 8 个脚本里各写一遍。挪一次数据位置就得全文搜索着改，
// 而漏一个的后果**不是报错**，是静默写到别处（脚本往新目录写、客户端还在读老目录，
// 表现成"改了没生效"）—— 这次真的踩到两次：网站端与几个脚本的默认值还指着旧路径。
// 现在取值只有两条路：
//   代码：scripts/lib/devData.mjs（唯一来源，读 path-modes.json 的 dev 段）
//   cmd ：data-dir.bat → scripts/data-dir.mjs（cmd 里没法 import 模块，所以有个薄壳）
// 这里把"又写死一处"变成自动失败。
const DEV_DATA_OWNERS = new Set([
  'scripts/lib/devData.mjs',
  'scripts/check-architecture.mjs', // 本规则的定义处（注释里要写出这个值）
]);
for (const file of walk(ROOT, [], ['.ts', '.tsx', '.mts', '.mjs', '.js', '.bat', '.ps1'])) {
  const r = rel(file)
  if (DEV_DATA_OWNERS.has(r)) continue
  if (r.startsWith('dev-data/')) continue // 数据本身
  if (r.includes('__tests__') || /\.test\.(ts|tsx|mjs|js)$/.test(r)) continue // 测试里的样例值
  if (r.startsWith('_')) continue // 一次性维护脚本
  if (r.startsWith('scripts/') && (r.includes('verify-') || r.includes('migrate-'))) continue // 历史一次性脚本
  const code = stripComments(fs.readFileSync(file, 'utf8'))
  if (/dev-data/i.test(code)) {
    violations.push(
      `${r}: 又写死了开发态数据目录名 —— 代码请用 scripts/lib/devData.mjs，bat 请 call data-dir.bat（见 docs/design/release-build.md）`,
    )
  }
}

if (violations.length) {
  console.error(`✗ 架构检查未通过（${violations.length} 项）：`)
  for (const v of violations) console.error('  - ' + v)
  process.exit(1)
}
console.log(
  '✓ 架构检查通过：实体类型单一来源、分层无越界、渲染层无 Node/sql.js 依赖、数据目录名未写死、Tailwind 变量层齐备、内容源文件完好、数据根未指回 release/data',
)
