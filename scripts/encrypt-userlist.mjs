// 一键加密 / 解密 YunGame 用户表（原版 JsonCrypt 的算法：base64(UTF8(明文) XOR "yungameplaynite")）
//
// 两个方向共用一个脚本：XOR 是对称运算，加解密本来就是同一件事，`--decrypt` 只是换个说法。
//
// 【加密】把明文用户表加密成密文再部署。默认**就地加密**（同名覆盖），因此有三道闸：
//   ① 写前自动备份一份明文 `YunGame_UserList.json.bak-<时间戳>` —— 明文不丢，随时可回滚；
//   ② **已经是密文的文件直接拒绝** —— 再加密一次会把数据彻底毁掉（本脚本最重要的一道闸）；
//   ③ 不是合法 JSON 也拒绝 —— 免得把坏文件加密后上线，问题被藏起来查不出。
//
// 【解密】把密文还原成明文，供人工编辑（客户端明文/密文都能读，但**编辑必须用明文**）。
//   ① **已经是明文的文件直接拒绝** —— 对明文再解一次会得到乱码，写出去就把数据毁了；
//   ② 解出来必须是合法 JSON —— 密钥不对 / 文件损坏时解出的是一堆乱码，这时**不写任何文件**；
//   ③ 默认**不就地覆盖**，而是写成 `<原名>.decrypted.json` —— 线上那份密文是生产数据，
//      解密多半只是想"拿下来看看"，不该被顺手改掉。
//
// 客户端读取时会自动识别明文/密文（shared/userLevel.ts 的 parseUserListRaw），
// 所以加密后**不需要改任何配置**。
//
// ⚠️ 加密算法与 shared/userLevel.ts 的 xorBase64() 是同一套（那份是权威实现、有单测）。
//    这里重写一遍是因为本脚本要用纯 node 跑（不能 import .ts）。改动时请两边一起改，
//    两者的等价性由 scripts 的验证步骤保证（加密后用 shared 的实现解回来核对）。
//
// 用法：
//   node scripts/encrypt-userlist.mjs                      # 加密 config.json 里 YunGameConfigDir 那份
//   node scripts/encrypt-userlist.mjs --decrypt            # 解密同一份（默认写成 <原名>.decrypted.json）
//   node scripts/encrypt-userlist.mjs --dry-run            # 只看会做什么，不写文件（两个方向都支持）
//   node scripts/encrypt-userlist.mjs <源>                  # 加密指定文件（就地覆盖）
//   node scripts/encrypt-userlist.mjs <源> <目标>           # 加密源文件并写到目标（部署到别处用这个）
//   node scripts/encrypt-userlist.mjs --decrypt <源> <目标>  # 解密指定文件
//   node scripts/encrypt-userlist.mjs --in a.json --out b.json   # 显式参数写法（可与 --decrypt 同用）
//
// 双击入口：userlist-crypt.bat（菜单选方向；也可以把文件直接拖到它上面）
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

const DECRYPT = has("--decrypt");
const DRY = has("--dry-run");

/**
 * 默认文件：config.json → settings.YunGameConfigDir 目录下的固定文件名。
 *
 * 2026-09-17：路径表把"用户表文件"改成了"配置目录"（目录里两个文件名固定，见
 * shared/pathModes.ts 的 YunGameConfigDir），所以这里读目录、再拼文件名。
 * 旧键 settings.yunGameUserListPath 仍然认 —— 老 config.json 不至于当场用不了。
 * 相对路径以"应用目录 = 仓库根"为基准（与其它路径字段一致）。
 */
function defaultTarget() {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf-8"));
  const s = cfg?.settings ?? {};
  const legacy = String(s.yunGameUserListPath ?? "").trim();
  if (legacy) return path.isAbsolute(legacy) ? legacy : path.join(root, legacy);
  const dir = String(s.YunGameConfigDir ?? "").trim();
  if (!dir) {
    throw new Error("config.json 里既没有 settings.YunGameConfigDir 也没有 settings.yunGameUserListPath");
  }
  return path.join(path.isAbsolute(dir) ? dir : path.join(root, dir), "YunGame_UserList.json");
}

// 位置参数与 --in/--out 都支持（bat 直接透传 %* 最省事）。规则：
//   给了 --in  → 位置参数里剩下的就是**目标**（因为源已经明确说了）；
//   没给 --in → 位置参数依次是 源、目标。
// （早先版本没区分这两种情况，「--in A B」会把 B 当成源、目标丢空 —— 已修。）
const optIn = argOf("--in", "");
const optOut = argOf("--out", "");
const positional = argv.filter((a) => !a.startsWith("--") && a !== optIn && a !== optOut);
const IN = path.resolve(optIn || positional[0] || defaultTarget());

/** 解密时的默认目标：`<原名>.decrypted.json`（如 YunGame_UserList.decrypted.json）。 */
const decryptedPath = (src) => src.replace(/\.[^.\\/]+$/, "") + ".decrypted.json";

/**
 * 目标路径：
 *   · 显式 --out / 第二位置参数 → 用它；
 *   · 目标只给了**文件名**（没有目录）→ 放到"当前生效的那份所在的目录"里。
 *     这样 `encrypt-userlist.bat <明文源> YunGame_UserList.json` 就是
 *     "把明文加密后部署到线上位置"，正是最常用的那一步。
 *   · 没给目标 → 加密：就地（与源同一个文件）；解密：`<原名>.decrypted.json`（**不覆盖**密文）。
 */
const outArg = optOut || (optIn ? positional[0] : positional[1]) || "";
const OUT = outArg
  ? path.isAbsolute(outArg) || outArg.includes("/") || outArg.includes("\\")
    ? path.resolve(outArg)
    : path.join(path.dirname(defaultTarget()), outArg)
  : DECRYPT
    ? decryptedPath(IN)
    : IN;

/** 与原版 jsoncrypt 完全一致：XOR 对称，明文 → 密文。 */
function xorBase64(text) {
  const data = Buffer.from(text, "utf8");
  const k = Buffer.from(KEY, "utf8");
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ k[i % k.length];
  return out.toString("base64");
}

/**
 * 密文 → 明文（xorBase64 的逆运算）。
 *
 * 为什么不直接复用 xorBase64：那个的输入是**明文文本**，而这里要先把 base64 解回字节、
 * 再 XOR、再按 UTF-8 解码 —— 顺序不同。用错会得到"对 base64 字符串再加密一次"的垃圾，
 * 而且它是**合法 JSON 以外**的东西，容易被当成"文件损坏"查半天。
 *
 * 解不出来返回 null（不是空串）：空串会被上层当成"没有内容"静默放过，
 * 而这正是"写出一堆乱码"的入口 —— 调用方必须显式处理 null。
 */
function decryptToText(cipher) {
  const data = Buffer.from(String(cipher ?? "").trim(), "base64");
  if (!data.length) return null;
  const k = Buffer.from(KEY, "utf8");
  for (let i = 0; i < data.length; i++) data[i] ^= k[i % k.length];
  const text = data.toString("utf8");
  // UTF-8 解坏时会带 U+FFFD 替换符：这是"密钥不对/文件损坏"的硬信号。
  return text.includes("\uFFFD") ? null : text;
}

console.log(DECRYPT ? "== 一键解密 YunGame 用户表 ==" : "== 一键加密 YunGame 用户表 ==");
console.log("目标  :", OUT, IN === OUT ? (DECRYPT ? "（就地解密）" : "（就地加密）") : "");
console.log("模式  :", DRY ? "预览（不写文件）" : DECRYPT ? "解密并写盘" : "加密并写盘", "\n");

// ---- 闸 1：源文件存在且非空 ----
if (!fs.existsSync(IN)) {
  console.error(`✗ 源文件不存在：${IN}`);
  process.exit(1);
}
const text = fs.readFileSync(IN, "utf-8").trim();
if (!text) {
  console.error("✗ 源文件是空的 —— 拒绝处理（空文件更难发现）");
  process.exit(1);
}

// 源文件的**真实形态**（以 [ / { 开头就是明文）—— 如实标注，**不按**"当前方向应该是啥"去标：
// 方向搞反时（拿密文去加密）标成"（明文）"会把人引向错误方向，白多花一轮。
// 必须放在这里：text 是上面刚读出来的，写在这之前会 TDZ 报错（踩过）。
const looksPlain = text.startsWith("[") || text.startsWith("{");
console.log("源文件:", IN, looksPlain ? "（明文）" : "（密文）");

// ---- 闸 2（最重要）：方向反了就拒绝 ----
// 为什么这道闸两个方向都要有：加密遇到密文 = 把数据再 XOR 一次（彻底毁掉）；
// 解密遇到明文 = 把明文当 base64 解（同样得到垃圾）。两者都会"写出去才发现"，所以必须提前拦。
// （判据 looksPlain 在上面读源文件时已经算好。）
if (!DECRYPT && !looksPlain) {
  console.error("✗ 这份**看起来已经是密文**（内容不以 [ 或 { 开头）—— 拒绝再加密一次。");
  console.error("  二次加密会把数据彻底毁掉。若确实要重来，先用备份 .bak-* 覆盖回明文再加密。");
  console.error("");
  console.error("  想把某份**明文**加密后部署到线上位置，用这个写法：");
  console.error(`    encrypt-userlist.bat "<明文源>.json" ${path.basename(defaultTarget())}`);
  console.error("");
  console.error("  如果你要的是**解密**：加 --decrypt，或双击 userlist-crypt.bat 选 2。");
  process.exit(1);
}
if (DECRYPT && looksPlain) {
  console.error("✗ 这份**已经是明文**（内容以 [ 或 { 开头）—— 无需解密。");
  console.error("  对明文再解一次会得到乱码、写出去就把数据毁了，所以这里直接停下、什么都没动。");
  console.error("");
  console.error("  想加密它（明文 → 密文）：去掉 --decrypt，或双击 userlist-crypt.bat 选 1。");
  process.exit(1);
}

/** 本地解析（明文或密文都吃）：用来读"目标文件现在是什么"。解不出来就抛错，不猜。 */
function readRecords(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return [];
  const json = t.startsWith("[") || t.startsWith("{") ? t : decryptToText(t);
  if (!json) throw new Error("既不是明文 JSON，也解不出密文");
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

// ---- 闸 3：内容必须是合法 JSON（加密看源，解密看**解出来的明文**）----
// 解密方向的这道闸尤其重要：密钥不对/文件损坏时解出的是乱码，写出去就把用户表毁了。
// 所以顺序是"先解、先校验、通过才写"，失败路径一个字节都不落盘。
let srcRecords = [];
let payload; // 真正要写出去的内容：加密=密文，解密=明文
if (DECRYPT) {
  const plain = decryptToText(text);
  if (plain === null) {
    console.error("✗ 解不出来 —— 这份不是本密钥加密的密文（或文件已损坏）。已中止，未写任何文件。");
    process.exit(1);
  }
  try {
    const parsed = JSON.parse(plain);
    srcRecords = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    console.error(`✗ 解出来的不是合法 JSON（${e.message}）—— 密钥不对或文件已损坏。已中止，未写任何文件。`);
    console.error("  这类内容写出去就是乱码，所以宁可不做。");
    process.exit(1);
  }
  payload = plain;
} else {
  try {
    const parsed = JSON.parse(text);
    srcRecords = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    console.error(`✗ 不是合法 JSON（${e.message}）—— 拒绝加密，免得把坏文件藏起来。`);
    process.exit(1);
  }
  payload = xorBase64(text);
}

console.log(
  DECRYPT
    ? `  条目: ${srcRecords.length} | 密文 ${Buffer.byteLength(text)} 字节 → 明文 ${Buffer.byteLength(payload)} 字节`
    : `  条目: ${srcRecords.length} | 明文 ${Buffer.byteLength(text)} 字节 → 密文 ${payload.length} 字节`,
);
console.log("");
if (DECRYPT) {
  // 解密**不比差异**：reportDiff 是给"部署"用的（源会覆盖目标），而解密只是想拿下来看/编辑。
  const names = srcRecords.slice(0, 3).map((r) => r.UserName ?? r.UserIpAddress ?? "?");
  console.log(`  明文里前几条：${names.join(" / ")}${srcRecords.length > 3 ? " …" : ""}`);
} else {
  reportDiff(srcRecords, OUT);
}

if (DRY) {
  console.log("\n（DRY-RUN：未写文件。确认无误后去掉 --dry-run 再跑一次。）");
  process.exit(0);
}

// ---- 写前备份：加密是"明文不丢"，解密就地时是"密文不丢" ----
if (fs.existsSync(OUT)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bak = `${OUT}.bak-${stamp}`;
  fs.copyFileSync(OUT, bak);
  console.log(`  [备份] ${bak}`);
  if (DECRYPT && path.resolve(OUT) === path.resolve(IN)) {
    console.log("  ⚠️ 你正在**就地**把密文换成明文：客户端仍能读，但这份文件从此不再是密文。");
  }
}

fs.writeFileSync(OUT, payload, "utf-8");
if (DECRYPT) {
  console.log(`\n✓ 已写入明文：${OUT}`);
  console.log("  改完这份明文后，再加密回去（不带 --decrypt 再跑一次 / userlist-crypt.bat 选 1）。");
} else {
  console.log(`\n✓ 已写入密文：${OUT}`);
  console.log("  客户端会自动识别明文/密文，配置无需改动。");
}
