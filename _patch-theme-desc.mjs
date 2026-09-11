// 给 themeLibrary.ts 每个主题补 zh（中文名）与 desc（中文搭配理念）。
// 幂等：重复运行会覆盖为最新文案。用法：node _patch-theme-desc.mjs
import { readFileSync, writeFileSync } from "node:fs";

const LIB = "src/utils/themeLibrary.ts";

// id → { zh: 中文名, desc: 搭配理念 }
const D = {
  "p-light": { desc: "中性浅灰蓝底 + 品牌蓝点缀，白天与办公环境久看不刺眼，信息层次干净清晰。" },
  "p-dark": { desc: "近黑深底 + 靛紫强调，夜间与暗房游玩首选，游戏封面在深底上更突出。" },
  "p-cyberpunk": { desc: "深紫黑夜城底色，霓虹玫红做主按钮、电光青绿做强调，高饱和撞色还原 2077 式霓虹夜。" },
  "p-catppuccin": { desc: "Catppuccin 社区最流行的柔和暗色，蓝紫底低饱和、薰衣草紫强调，柔和不刺眼、久用舒适。" },

  "p-modern-minimal": { zh: "现代极简", desc: "黑白灰为主、单一强调色，克制到极致的现代 SaaS 风，喜欢纯净界面选它。" },
  "p-t3-chat": { zh: "T3 聊天", desc: "开源应用 T3 Chat 的同款配色，暖灰底 + 柔和蓝，久看不累的聊天应用气质。" },
  "p-twitter": { zh: "推特蓝", desc: "推特官方蓝白体系，识别度极高的社媒经典蓝，亮色清爽干净。" },
  "p-mocha-mousse": { zh: "摩卡慕斯", desc: "2025 年度代表色「摩卡慕斯棕」，温暖可可底 + 奶咖强调，沉静温柔的复古暖调。" },
  "p-bubblegum": { zh: "泡泡糖", desc: "高饱和粉青撞色，像泡泡糖一样活泼跳脱，年轻化的甜系亮色。" },
  "p-doom-64": { zh: "毁灭战士 64", desc: "N64 经典 FPS 的工业暗灰 + 血红强调，硬核射击游戏的金属与硝烟感。" },
  "p-graphite": { zh: "石墨", desc: "全灰阶极简深色，无彩色干扰，让游戏封面成为界面里唯一的颜色主角。" },
  "p-perpetuity": { zh: "永恒", desc: "深邃墨蓝 + 冷静的蓝紫强调，沉稳大气的商务暗色。" },
  "p-kodama-grove": { zh: "木灵树林", desc: "宫崎骏式森林绿意，苔绿 + 暖木色，自然治愈的吉卜力气质。" },
  "p-cosmic-night": { zh: "宇宙之夜", desc: "深空紫黑 + 星云紫粉强调，午夜仰望宇宙的浪漫科幻感。" },
  "p-tangerine": { zh: "橘子汽水", desc: "饱和橘橙 + 奶油底，像冰镇橘子汽水一样开胃的暖亮色。" },
  "p-quantum-rose": { zh: "量子玫瑰", desc: "深灰冷底上一抹艳玫瑰，优雅中带一点攻击性的冷暖碰撞。" },
  "p-nature": { zh: "自然绿", desc: "大地的绿色系，草绿 + 棕土，回归自然的松弛感。" },
  "p-bold-tech": { zh: "硬核科技", desc: "高对比深底 + 电光强调，科幻 HUD 般的硬朗科技风。" },
  "p-elegant-luxury": { zh: "优雅奢华", desc: "墨黑 + 香槟金，五星级酒店晚宴般的奢华质感。" },
  "p-amber-minimal": { zh: "琥珀极简", desc: "琥珀橙单强调 + 大面积留白留黑，极简中带一点温度。" },
  "p-supabase": { zh: "Supabase 绿", desc: "Supabase 品牌配色，深灰底 + 荧光绿强调，开发者熟悉的极客气质。" },
  "p-neo-brutalism": { zh: "新粗野主义", desc: "粗黑描边 + 高饱和色块 + 硬阴影，当下最潮的新粗野主义，个性张扬。" },
  "p-solar-dusk": { zh: "落日黄昏", desc: "黄昏暖调，橙紫过渡像日落最后一刻的天空。" },
  "p-claymorphism": { zh: "黏土拟物", desc: "软糯的黏土质感配色，圆润柔和的粉彩立体风。" },
  "p-pastel-dreams": { zh: "粉彩梦境", desc: "低饱和马卡龙粉彩，梦一般的柔和浅色系。" },
  "p-clean-slate": { zh: "洁净白板", desc: "近乎纯白的干净起点 + 单点蓝强调，专注内容的空白画布。" },
  "p-caffeine": { zh: "咖啡因", desc: "浓缩咖啡的深棕 + 奶泡米白，咖啡馆深夜游戏的气氛组。" },
  "p-ocean-breeze": { zh: "海风", desc: "清透的海洋蓝绿，像海边微风一样凉爽的亮色。" },
  "p-retro-arcade": { zh: "复古街机", desc: "80 年代街机厅的霓虹撞色，CRT 记忆中的红蓝黄高饱和。" },
  "p-midnight-bloom": { zh: "午夜绽放", desc: "午夜蓝底上开一朵紫花，暗色中带花意的浪漫。" },
  "p-candyland": { zh: "糖果乐园", desc: "糖果色大碰撞，粉紫青的高饱和甜系暗色。" },
  "p-northern-lights": { zh: "极光", desc: "极夜绿紫渐变的极光色，北欧夜空的神秘冷调。" },
  "p-vintage-paper": { zh: "复古纸张", desc: "泛黄纸张 + 墨棕文字，旧书旧报纸的怀旧阅读感。" },
  "p-sunset-horizon": { zh: "地平线日落", desc: "地平线上最后一缕日光，橙红暖调渐入夜色。" },
  "p-starry-night": { zh: "星空夜", desc: "梵高星夜般的深蓝 + 星光黄，艺术油画气质的暗色。" },
  "p-claude": { zh: "克劳德暖橙", desc: "Claude 同款陶土橙 + 暖米色，安静温柔的文艺气质。" },
  "p-vercel": { zh: "韦塞尔黑白", desc: "Vercel 极简黑白，工程师的克制美学，对比干脆利落。" },
  "p-mono": { zh: "单色", desc: "纯单色阶，黑白灰到极致，内容至上的无彩色方案。" },
};

let lib = readFileSync(LIB, "utf8");
let patched = 0;
for (const [id, { zh, desc }] of Object.entries(D)) {
  const anchor = lib.indexOf(`id: "${id}"`);
  if (anchor < 0) { console.log(`skip ${id}（不在库中）`); continue; }
  // 定位该条目的 zh 行
  const zhRe = /^    zh: ".*",?$/m;
  const rest = lib.slice(anchor);
  const m = rest.match(zhRe);
  if (!m) { console.log(`skip ${id}（找不到 zh 行）`); continue; }
  const absStart = anchor + m.index;
  const absEnd = absStart + m[0].length;
  const newLine = `    zh: ${JSON.stringify(zh ?? (m[0].match(/zh: "(.*)"/) ?? [])[1] ?? "")},\n    desc: ${JSON.stringify(desc)},`;
  lib = lib.slice(0, absStart) + newLine + lib.slice(absEnd);
  patched++;
}
writeFileSync(LIB, lib, "utf8");
console.log(`已补全 ${patched} 个主题的中文名与描述`);
