// 自动标签：根据游戏名（含别名/多语言名）自动生成用户可见的标签。
// 移植自原 Rust 的 autotags.rs。关键词覆盖网吧游戏标题里常见的中英文描述词，
// 比如"联机""多人""恐怖""RPG""开放世界"等。大小写不敏感，中文按原样子串匹配。

// 每个自动标签：[中文标签, [触发关键词...]]。
// 当游戏名（或别名）里出现任一关键词，就给这个游戏加上该标签。
const AUTO_TAGS: [string, string[]][] = [
  // 神作 / 大作
  ["神作", ["神作", "masterpiece", "classic", "经典"]],
  ["大作", ["大作", " AAA", "3A ", "AAA"]],

  // 联网 / 社交
  ["联机", ["联机", "联网", "online", "Online", "OL ", "OL版", "online版", "网络版"]],
  ["多人", ["多人", "multiplayer", "multi-player", "multi player"]],
  ["合作", ["合作", "co-op", "coop", "COOP", "Co-op"]],
  ["PVP", ["PVP", "pvp", "对战", "玩家对战"]],
  ["PVE", ["PVE", "pve"]],

  // 氛围
  ["恐怖", ["恐怖", "horror", "HORROR", "惊悚", "scary", "鬼", "僵尸", "Zombie", "zombie"]],
  ["血腥", ["血腥", "blood", "暴力"]],

  // 视角
  ["第一人称", ["第一人称", "FPS ", "FPS版", "1st person", "first-person", "first person", " 1P ", "1P版"]],
  ["第三人称", ["第三人称", "TPS", "third-person", "third person"]],
  ["俯视角", ["俯视角", "俯视", "top-down", "top down", "topdown", " isometric", "等距", "上帝视角", "鸟瞰"]],

  // 美术风格
  ["2D", ["2D ", "2D版", "2D横版", "横版", "横屏", "side-scroller", "横版过关"]],
  ["3D", ["3D ", "3D版"]],
  ["像素", ["像素", "pixel", "Pixel", "8-bit", "8bit", "复古像素"]],
  ["复古", ["复古", "retro", "Retro"]],

  // 来源 / 体量
  ["独立", ["独立", "indie", "Indie", "国产独立"]],
  ["国产", ["国产", "中国", "chinese", "国服", "国行"]],

  // 类型
  ["RPG", ["RPG", "rpg", "角色扮演", "ARPG"]],
  ["动作", ["动作", "Action", "ACT", "act "]],
  ["射击", ["射击", "shooter", "Shooter", "STG", "枪战", "狙击", "狙击手"]],
  ["策略", ["策略", "Strategy", "strategy", "战略"]],
  ["模拟", ["模拟", "Simulation", "simulation", "SIM", "模拟器"]],
  ["冒险", ["冒险", "Adventure", "adventure", "AVG", "avg"]],
  ["解谜", ["解谜", "Puzzle", "puzzle", "益智", "密室"]],
  ["竞速", ["竞速", "赛车", "racing", "Racing", "race", "Race", "driving", "Driving", "GT ", "卡丁车", "拉力"]],
  ["格斗", ["格斗", "Fighting", "fighting", "FTG", "ftg", "拳皇", "对战格斗"]],
  ["平台跳跃", ["平台跳跃", "platformer", "Platformer"]],
  ["回合制", ["回合制", "turn-based", "Turn-Based", "回合"]],
  ["即时战略", ["即时战略", "RTS", "rts", "real-time", "real time"]],
  ["卡牌", ["卡牌", "Card", "card", "TCG", "tcg", "集换", "卡组"]],
  ["生存", ["生存", "Survival", "survival"]],
  ["沙盒", ["沙盒", "sandbox", "Sandbox"]],
  ["开放世界", ["开放世界", "open world", "Open World", "openworld"]],
  ["休闲", ["休闲", "Casual", "casual", "轻松"]],
  ["竞技", ["竞技", "competitive", "Competitive", "电竞赛", "锦标赛"]],
  ["弹幕", ["弹幕", "bullet hell", "Bullet Hell", "STG", "弹幕射击"]],
  ["塔防", ["塔防", "tower defense", "Tower Defense", "TD "]],
  ["肉鸽", ["肉鸽", "Rogue", "rogue", "Rougelike", "Roguelike", "Rogue-like", "Rogue-like"]],
  ["挂机", ["挂机", "idle", "Idle", "放置"]],
  ["模拟经营", ["模拟经营", "tycoon", "Tycoon", "经理", "管理", "经营"]],
  ["战棋", ["战棋", "SRPG", "srpg", "战术", "战棋版", "棋盘"]],
  ["音乐", ["音乐", "Music", "music", "节奏", "Rhythm"]],
  ["体育", ["体育", "Sports", "sports", "足球", "篮球", "FIFA", "NBA", "棒球", "高尔夫"]],
  ["恋爱", ["恋爱", "Romance", "romance", "GAL", "galgame", "Galgame", "视觉小说", "VN "]],
  ["动漫", ["动漫", "Anime", "anime", "二次元"]],
  ["教育", ["教育", "Education", "education", "儿童", "Kids", "kids"]],
  ["模拟飞行", ["飞行模拟", "flight sim", "Flight Sim", "模拟飞行"]],
  ["武侠", ["武侠", "江湖", "仙侠", "修真", "古风", "中国风"]],
  ["三国", ["三国", "Three Kingdoms", "ThreeKingdoms", "三国志"]],
  ["二战", ["二战", "WWII", "WW2", "World War"]],
  ["科幻", ["科幻", "Sci-Fi", "sci-fi", "sci fi", "未来", "太空"]],
  ["魔幻", ["魔幻", "Fantasy", "fantasy", "魔法", "巫师", "龙与"]],
  ["都市", ["都市", "Modern", "城市", "city"]],
  ["僵尸", ["僵尸", "Zombie", "zombie", "末日"]],
  ["忍者", ["忍者", "Ninja", "ninja", "武士", "Samurai"]],
  ["海盗", ["海盗", "Pirate", "pirate"]],
  ["赛车", ["赛车", "Racing", "racing", "GT", "卡丁"]],
  ["桌游", ["桌游", "Board Game", "boardgame", "棋盘"]],
  ["麻将", ["麻将", "Mahjong", "mahjong"]],
  ["扑克", ["扑克", "Poker", "poker"]],
];

// 给一个游戏名（可附带别名/多语言名合成一段文本）算出应加的自动标签列表。
// 返回去重后的标签数组。
export function autoTagsFor(searchText: string): string[] {
  const lower = searchText.toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const [tag, keywords] of AUTO_TAGS) {
    const hit = keywords.some((kw) => {
      const kl = kw.toLowerCase();
      // 纯 ASCII 关键词用小写子串匹配（大小写不敏感）；含中文的按原样子串匹配。
      if ([...kl].every((c) => c.charCodeAt(0) < 128)) {
        return lower.includes(kl);
      }
      return searchText.includes(kw);
    });
    if (hit && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}
