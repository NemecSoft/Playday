// 一键加密 YunGame 用户表（原版 JsonCrypt 的算法：base64(UTF8(明文) XOR "yungameplaynite")）
//
// 用途：把明文用户表加密成密文再部署。默认**就地加密**（同名覆盖），因此有三道闸：
//   ① 写前自动备份一份明文 `YunGame_UserList.json.bak-<时间戳>` —— 明文不丢，随时可回滚；
//   ② **已经是密文的文件直接拒绝** —— 再加密一次会把数据彻底毁掉（本脚本最重要的一道闸）；
//   ③ 不是合法 JSON 也拒绝 —— 免得把坏文件加密后上线，问题被藏起来查不出。
//
// 客户端读取时会自动识别明文/密文（shared/userLevel.ts 的 parseUserListRaw），
// 所以加密后**不需要改任何配置**。
//
// ⚠️ 加密算法与 shared/userLevel.ts 的 xorBase64() 是同一套（那份是权威实现、有单测）。
//    这里重写一遍是因为本脚本要用纯 node 跑（不能 import .ts）。改动时请两边一起改，
//    两者的等价性由 scripts 的验证步骤保证（加密后用 shared 的实现解回来核对）。
//
// 用法：
//   node scripts/encrypt-userlist.mjs                      # 加密 config.json 里 yunGameUserListPath 指向的那份
//   node scripts/encrypt-userlist.mjs --dry-run            # 只看会做什么，不写文件
//   node scripts/encrypt-userlist.mjs <源>                  # 加密指定文件（就地覆盖）
//   node scripts/encrypt-userlist.mjs <源> <目标>           # 加密源文件并写到目标（部署到别处用这个）
//   node scripts/encrypt-userlist.mjs --in a.json --out b.json   # 同上，显式参数写法
import fs from "fs";
import path from "path";

const KEY = "yungameplaynite";
const root = process.cwd();
const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

/** 默认目标：config.json → settings.yunGameUserListPath（相对路径以应用目录 = 仓库根为基准）。 */
function defaultTarget() {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf-8"));
  const raw = String(cfg?.settings?.yunGameUserListPath ?? "").trim();
  if (!raw) throw new Error("config.json 里没有 settings.yunGameUserListPath");
  return path.isAbsolute(raw) ? raw : path.join(root, raw);
}

// 位置参数与 --in/--out 都支持（bat 直接透传 %* 最省事）。规则：
//   给了 --in  → 位置参数里剩下的就是**目标**（因为源已经明确说了）；
//   没给 --in → 位置参数依次是 源、目标。
// （早先版本没区分这两种情况，「--in A B」会把 B 当成源、目标丢空 —— 已修。）
const optIn = argOf("--in", "");
const optOut = argOf("--out", "");
const positional = argv.filter((a) => !a.startsWith("--") && a !== optIn && a !== optOut);
const IN = path.resolve(optIn || positional[0] || defaultTarget());

/**
 * 目标路径：
 *   · 显式 --out / 第二位置参数 → 用它；
 *   · 目标只给了**文件名**（没有目录）→ 放到"当前生效的那份所在的目录"里。
 *     这样 `encrypt-userlist.bat <明文源> YunGame_UserList.json` 就是
 *     "把明文加密后部署到线上位置"，正是最常用的那一步。
 *   · 没给目标 → 就地加密（与源同一个文件）。
 */
const outArg = optOut || (optIn ? positional[0] : positional[1]) || "";
const OUT = outArg
  ? path.isAbsolute(outArg) || outArg.includes("/") || outArg.includes("\\")
    ? path.resolve(outArg)
    : path.join(path.dirname(defaultTarget()), outArg)
  : IN;
const DRY = has("--dry-run");

/** 与原版 jsoncrypt 完全一致：XOR 对称，同一个函数即可加密也可解密。 */
function xorBase64(text) {
  const data = Buffer.from(text, "utf8");
  const k = Buffer.from(KEY, "utf8");
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ k[i % k.length];
  return out.toString("base64");
}

console.log("== 一键加密 YunGame 用户表 ==");
console.log("源文件:", IN);
console.log("目标  :", OUT, IN === OUT ? "（就地加密）" : "");
console.log("模式  :", DRY ? "DRY-RUN（不写文件）" : "加密并写盘", "\n");

// ---- 闸 1：源文件存在且非空 ----
if (!fs.existsSync(IN)) {
  console.error(`✗ 源文件不存在：${IN}`);
  process.exit(1);
}
const text = fs.readFileSync(IN, "utf-8").trim();
if (!text) {
  console.error("✗ 源文件是空的 —— 拒绝加密（空文件加密后更难发现）");
  process.exit(1);
}

// ---- 闸 2（最重要）：已经是密文就拒绝，防二次加密 ----
if (!text.startsWith("[") && !text.startsWith("{")) {
  console.error("✗ 这份**看起来已经是密文**（内容不以 [ 或 { 开头）—— 拒绝再加密一次。");
  console.error("  二次加密会把数据彻底毁掉。若确实要重来，先用备份 .bak-* 覆盖回明文再加密。");
  console.error("");
  console.error("  想把某份**明文**加密后部署到线上位置，用这个写法：");
  console.error(`    encrypt-userlist.bat "<明文源>.json" ${path.basename(defaultTarget())}`);
  process.exit(1);
}

/** 本地解析（明文或密文都吃）：用来读"目标文件现在是什么"。 */
function readRecords(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return [];
  let json = t;
  if (!t.startsWith("[") && !t.startsWith("{")) {
    const d = Buffer.from(t, "base64");
    const k = Buffer.from(KEY, "utf8");
    for (let i = 0; i < d.length; i++) d[i] ^= k[i % k.length];
    json = d.toString("utf8");
  }
  const parsed = JSON.parse(json);
  return Array.isArray(parsed) ? parsed : [parsed];
}

/**
 * 目标已存在时，先报出"这次部署会改掉哪些记录"（只提示、不阻拦 —— 差异往往是有意改的）。
 * 为什么需要：加密是**原样搬运**，源与目标若是不同版本，会静默替换线上数据。
 * 真实踩过：源里「鹊踏枝酒店」是 L2、线上是 L1，直接部署就把这家店从黄金版降级了。
 */
function reportDiff(srcRecords, outPath) {
  if (!fs.existsSync(outPath)) {
    console.log("  目标文件不存在 → 本次是新建。");
    return;
  }
  let oldRecords;
  try {
    oldRecords = readRecords(fs.readFileSync(outPath, "utf-8"));
  } catch (e) {
    console.log(`  （目标文件读不出来，跳过比对：${e.message}）`);
    return;
  }
  const keyOf = (r) => String(r.UserIpAddress ?? r.user_ip_address ?? "").trim();
  const oldMap = new Map(oldRecords.map((r) => [keyOf(r), r]));
  const newMap = new Map(srcRecords.map((r) => [keyOf(r), r]));
  const added = [...newMap.keys()].filter((k) => !oldMap.has(k));
  const removed = [...oldMap.keys()].filter((k) => !newMap.has(k));
  const changed = [];
  for (const [k, nr] of newMap) {
    const or = oldMap.get(k);
    if (!or) continue;
    const fields = new Set([...Object.keys(or), ...Object.keys(nr)]);
    const diffs = [...fields].filter((f) => JSON.stringify(or[f]) !== JSON.stringify(nr[f]));
    if (diffs.length) {
      changed.push({
        label: `${nr.UserName ?? or.UserName ?? k} (${k})`,
        diffs: diffs.map((f) => `${f}: ${JSON.stringify(or[f])} → ${JSON.stringify(nr[f])}`),
      });
    }
  }
  console.log(`  目标现有 ${oldRecords.length} 条 | 源 ${srcRecords.length} 条`);
  if (!added.length && !removed.length && !changed.length) {
    console.log("  与源完全一致（部署后内容不变）。");
    return;
  }
  console.log(`  ⚠️ 部署后会改变：新增 ${added.length} 条 / 删除 ${removed.length} 条 / 修改 ${changed.length} 条`);
  for (const k of added.slice(0, 5)) console.log(`     + ${newMap.get(k).UserName ?? ""} (${k})`);
  for (const k of removed.slice(0, 5)) console.log(`     - ${oldMap.get(k).UserName ?? ""} (${k})`);
  for (const c of changed.slice(0, 5)) console.log(`     ~ ${c.label} ${c.diffs.join("; ")}`);
  if (changed.length > 5) console.log(`     ~ …还有 ${changed.length - 5} 条修改（完整内容以源为准）`);
}

// ---- 闸 3：必须是合法 JSON ----
let srcRecords = [];
try {
  const parsed = JSON.parse(text);
  srcRecords = Array.isArray(parsed) ? parsed : [parsed];
} catch (e) {
  console.error(`✗ 不是合法 JSON（${e.message}）—— 拒绝加密，免得把坏文件藏起来。`);
  process.exit(1);
}

const cipher = xorBase64(text);
console.log(`  条目: ${srcRecords.length} | 明文 ${Buffer.byteLength(text)} 字节 → 密文 ${cipher.length} 字节`);
console.log("");
reportDiff(srcRecords, OUT);

if (DRY) {
  console.log("\n（DRY-RUN：未写文件。确认无误后去掉 --dry-run 再跑一次。）");
  process.exit(0);
}

// ---- 写前备份（明文不丢）----
if (fs.existsSync(OUT)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bak = `${OUT}.bak-${stamp}`;
  fs.copyFileSync(OUT, bak);
  console.log(`  [备份] ${bak}`);
}

fs.writeFileSync(OUT, cipher, "utf-8");
console.log(`\n✓ 已写入密文：${OUT}`);
console.log("  客户端会自动识别明文/密文，配置无需改动。");
