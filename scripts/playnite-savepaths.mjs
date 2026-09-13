// 从 Playnite LiteDB 的「备份游戏存档」action 里提取存档路径，供 gen-game-content.mjs 填表用。
//
// 数据长这样（games.db 的 `Game.GameActions[]`，已由 scripts/export-litedb-games.ps1 导出成 JSON）：
//
//   { Name: "备份游戏存档", Type: "File",
//     Path: "..\\Tools\\GameSaveHelper\\GameSaveHelper",
//     Arguments: "我们到了吗-网吧联机版 \"C:\\Users\\Administrator\\AppData\\Local\\Ride\\*.*\" \"X:\\YunGame\\W\\Ride\\settings\\*.*\"" }
//
// 参数格式 = **游戏名 + 若干带引号的路径**（多个路径就是多个引号片段）。
//
// ── 判据：为什么按 Path 含 GameSaveHelper，而不是按名字等于「备份游戏存档」 ──
// 实测 1283 个游戏 / 2574 条 action，名字有这些变体（都是同一件事）：
//   "备份游戏存档"(1243) / "备份服务端游戏存档" / "备份游戏存档（注册表格式）"
//   "游戏存档备份" / 误写成"开始游戏"的 3 条 / 甚至写成了游戏自己的名字（"超级星探"）。
// 按工具路径识别正好覆盖全部 1251 条；按名字会漏掉 8 条。
// 反向验证过："名字对但路径不是 helper"的 0 条 —— 所以路径判据是名字判据的超集，用它更稳。
//
// ── 解析：为什么取"所有引号内的片段"，而不是"去掉第一个词" ──
//   1. 路径里含空格（`...\Bennett Foddy\Getting Over It`、`Two Point Campus`），
//      按空格分词会把一条路径切成两半；
//   2. 游戏名一定是**不带引号**的那一个 token，所以引号片段天然就是路径；
//   3. 实测 147/1243 条的"参数首词"与库里的游戏名并不一致（"-网吧联机版"之类的后缀差异），
//      所以更不能靠"首词"定位。
// 另外实测有 2 条把开头写成了中文左引号 `“`（`空洞骑士 “C:\...\*.*"`），正则同时认 `"` 与 `“”`。

/** 备份工具在 action.Path 里的特征串（小写匹配）。 */
export const SAVE_HELPER_HINT = "gamesavehelper";

/** 这条 action 是不是「备份游戏存档」（按工具路径识别，见文件头说明）。 */
export function isSaveBackupAction(action) {
  return String(action?.Path ?? "")
    .toLowerCase()
    .includes(SAVE_HELPER_HINT);
}

/**
 * action 参数文本 → 存档路径数组。
 * 取所有引号内的片段；一个引号都没有时退化为"去掉第一个 token，剩下全当一条路径"。
 */
export function parseSavePathArgs(args) {
  const s = String(args ?? "");
  const out = [];
  const re = /[“"]([^”"]+)[”"]/g;
  let m;
  while ((m = re.exec(s)) !== null) out.push(m[1]);
  if (out.length > 0) return out.map((x) => x.trim()).filter(Boolean);
  // 兜底：极少数没写引号的（第一个 token 是游戏名）
  const rest = s.trim().replace(/^\S+\s*/, "").trim();
  return rest ? [rest] : [];
}

/**
 * 路径规范化：`\` → `/`。
 * 为什么要转：App 内部路径的规范形式就是 `/`（shared/launchPaths.ts 的 normalizePath），
 * 库/界面上只该有一种写法，否则 `D:\a` 与 `D:/a` 会被当成两条不同的路径。
 *
 * ⚠️ 注册表格式的存档（`HKEY_CURRENT_USER\SOFTWARE\...`，实测 2 个游戏）同样会被转成 `/`：
 * 按需求"统一用 /"执行。注意 App 的 resolvePath() 本来就把这类值当相对路径处理
 * （既不是盘符绝对路径、也不是 UNC），这是既有行为，与本次改动无关。
 */
export function normalizeSavePath(p) {
  return String(p ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");
}

/**
 * 从 LiteDB 导出的 games 数组里收集「游戏 → 存档路径」。
 * 同时回一份统计，供脚本打印（哪些 action 名字不标准、哪些解析不出路径）。
 */
export function collectSavePaths(games) {
  const byGameId = new Map();
  const byName = new Map();
  const stats = {
    games: 0,
    withAction: 0,
    withPaths: 0,
    multiPath: 0,
    /** 名字不是标准「备份游戏存档」但确实指向备份工具的（供人工确认） */
    oddActionNames: [],
    /** 有 action、但参数里解析不出任何路径 */
    emptyArgs: [],
  };

  for (const g of games ?? []) {
    stats.games++;
    const name = String(g?.Name ?? "").trim();
    const gameId = String(g?.GameId ?? "").trim();
    const actions = (g?.GameActions ?? []).filter(isSaveBackupAction);
    if (actions.length === 0) continue;
    stats.withAction++;

    const paths = [];
    for (const a of actions) {
      const actName = String(a?.Name ?? "").trim();
      if (actName !== "备份游戏存档" && stats.oddActionNames.length < 20) {
        stats.oddActionNames.push(`${name}（action 名：${JSON.stringify(actName)}）`);
      }
      const parsed = parseSavePathArgs(a?.Arguments);
      if (parsed.length === 0 && stats.emptyArgs.length < 20) stats.emptyArgs.push(name);
      for (const p of parsed) {
        const norm = normalizeSavePath(p);
        if (norm && !paths.includes(norm)) paths.push(norm);
      }
    }
    if (paths.length === 0) continue;
    stats.withPaths++;
    if (paths.length > 1) stats.multiPath++;
    if (gameId) byGameId.set(gameId.trim().toLowerCase().replace(/-/g, ""), paths);
    if (name) byName.set(name, paths);
  }

  return { byGameId, byName, stats };
}
