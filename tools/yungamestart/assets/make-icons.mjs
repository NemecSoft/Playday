// 重新生成快捷方式图标（1.ico = 黄金版 / 2.ico = 钻石版）。
//
// 这两个图标是 YunGameStart 建桌面快捷方式时用的（见 docs/design/yungamestart.md）。
// 图案是**同一个手柄剪影**、两套渐变：1.ico 红→橙→金、2.ico 洋红→紫→青。
//
// ⚠️⚠️ **当前仓库里这两张图是原版**（= release\yungamestart\1.ico / 2.ico，303785 / 303480 字节）。
//    2026-09-16 先按下面的算法做过一版"加深"，随后用户拍板**先用原版、先不动**，资产已回退。
//    也就是说：**跑这个工具（默认参数）会生成"加深版"并覆盖现在的原图。**
//    真要用加深版就明着跑；想复原，就从 release\yungamestart\ 或本目录的
//    *.bak-20260916 拷回来（三处内容一致）。
//
// 2026-09-16 需求："深度加深，重新生成更鲜艳的图标"。做法不是重新画图，而是：
//   · **剪影与白色按键原样保留**（来自原图的 alpha，一个像素都不动 —— 用户认的还是这个形状）；
//   · 沿对角线采样原渐变的 6 个色标，在 HSL 上**提饱和 ×1.5、压亮度 ×0.86**；
//   · 按新色标逐像素重画渐变，按键边缘按"白色程度"平滑混回去。
// 为什么不是"整图过一遍滤镜"（saturate/contrast）：滤镜只能把浅黄变成鲜黄，
// **变不成深金**（饱和度提不暗亮度）—— "深度"要的是压亮度，所以必须重画渐变。
// 为什么借 Electron 当画布：解码 ico 内嵌 PNG、高质量缩放、getImageData，node 里都没有现成能力，
// 而项目零原生依赖（不为一个图标引 sharp）。**这只用于开发，不进包**。
//
// 用法（在本目录或任意位置）：
//   node make-icons.mjs                 # 按默认参数重生成两个 ico（原文件自动备份）
//   node make-icons.mjs --dry           # 只算不写：看看色标变成什么、文件会多大
//   node make-icons.mjs --list          # 只列出当前两个 ico 里有哪几帧（查看用）
//   node make-icons.mjs --saturate 1.7 --darken 0.8    # 想更艳 / 更深就调这两个旋钮
//
// ⚠️ 生成的是 9 帧（16…256）：≤48 用 **DIB**（老式位图帧，兼容最老的那批 shell 代码路径），
//    ≥64 用 **PNG**（体积小）。原文件是 ≤192 DIB + 256 PNG（303KB），新文件约 50KB。
// ⚠️ 中间产物落在系统临时目录（%TEMP%\yungame-icon-build），**故意不删**：
//    本机 IDE 把 fs.rmSync 接到了"移到回收站"的 shim 上，递归删目录会直接抛错；留着也方便核对。

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
// 拆帧/封帧（含 32bpp DIB）统一在 scripts/lib/ico.cjs —— 与系统图标的出图工具
// （public/icons/render-icon.cjs）共用同一份实现，免得两个 .ico 的帧布局悄悄不一样
//（那种问题只在 Windows 上某个尺寸显示异常时才看得出来）。
import ico from "../../../scripts/lib/ico.cjs";

const { parseIco, buildIco, dibFrame, isPngFrame: isPng } = ico;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const WORK = path.join(os.tmpdir(), "yungame-icon-build");
/** 与原文件一致的 9 帧。 */
const SIZES = [16, 24, 32, 48, 64, 96, 128, 192, 256];
/** ≤ 这个尺寸的帧封 DIB，更大的封 PNG。 */
const DIB_MAX = 48;
const ICONS = ["1", "2"];

// ---------------------------------------------------------------- 参数
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => (argv.includes(f) ? Number(argv[argv.indexOf(f) + 1]) : d);
const OPTS = {
  dry: has("--dry"),
  list: has("--list"),
  saturate: val("--saturate", 1.5),
  darken: val("--darken", 0.86),
  stops: val("--stops", 6),
};

// ---------------------------------------------------------------- ico 容器
// 拆帧 / 封帧（含 32bpp DIB）全部来自 scripts/lib/ico.cjs —— 见文件头那个 import。
// 那里有一份实现给两个出图工具共用，规则与坑都记在那边的注释里。

// ---------------------------------------------------------------- 主流程
fs.mkdirSync(WORK, { recursive: true });

if (OPTS.list) {
  for (const name of ICONS) {
    const file = path.join(HERE, `${name}.ico`);
    const frames = parseIco(fs.readFileSync(file));
    const bytes = fs.statSync(file).size;
    console.log(`\n${name}.ico  ${bytes} 字节  ${frames.length} 帧`);
    for (const f of frames) {
      console.log(
        `  ${String(f.width).padStart(3)}x${String(f.height).padEnd(3)} ${f.bpp}bpp  ${String(f.size).padStart(7)} 字节  ${isPng(f.data) ? "PNG" : "DIB"}`
      );
    }
  }
  process.exit(0);
}

// 1) 从现有 ico 里取**最大的那一帧 PNG**当源图（形状与渐变的来源）
const sources = [];
for (const name of ICONS) {
  const file = path.join(HERE, `${name}.ico`);
  const frames = parseIco(fs.readFileSync(file));
  const pngs = frames.filter((f) => isPng(f.data));
  if (pngs.length === 0) {
    console.error(`✗ ${name}.ico 里没有 PNG 帧，取不到源图（这个工具只吃"内嵌 PNG 帧"的图标）`);
    process.exit(1);
  }
  const biggest = pngs.reduce((a, b) => (a.width >= b.width ? a : b));
  const out = path.join(WORK, `${name}-source.png`);
  fs.writeFileSync(out, biggest.data);
  console.log(`[源图] ${name}.ico → ${biggest.width}x${biggest.height} 帧（${frames.length} 帧里最大）→ ${out}`);
  sources.push(out);
}

// 2) 交给 Electron（画布）做像素级的事
const electron = path.join(REPO, "node_modules", "electron", "dist", "electron.exe");
if (!fs.existsSync(electron)) {
  console.error(`✗ 找不到 electron：${electron}\n  这个工具借仓库 devDependencies 里的 Electron 当画布（只为开发用，不进包）。`);
  process.exit(1);
}
const args = [
  path.join(HERE, "make-icons-canvas.cjs"),
  ...sources,
  "--out", WORK,
  "--saturate", String(OPTS.saturate),
  "--darken", String(OPTS.darken),
  "--stops", String(OPTS.stops),
  "--dib-max", String(DIB_MAX),
  "--sizes", SIZES.join(","),
];
console.log(`[画布] 提饱和 ×${OPTS.saturate}  压亮度 ×${OPTS.darken}  色标 ${OPTS.stops} 个\n`);
const r = spawnSync(electron, args, { stdio: "inherit" });
if (r.status !== 0) {
  console.error("✗ 画布这一步失败了（上面有原因）");
  process.exit(1);
}
const result = JSON.parse(fs.readFileSync(path.join(WORK, "canvas-result.json"), "utf-8"));

// 3) 把像素封成 ico（小尺寸 DIB / 大尺寸 PNG）
for (const name of ICONS) {
  const r0 = result[`${name}-source`];
  if (!r0) {
    console.error(`✗ 画布没回 ${name}-source 的结果`);
    process.exit(1);
  }
  const frames = SIZES.map((s) => {
    const item = r0.sizes[String(s)];
    if (!item) throw new Error(`缺 ${s} 这一帧`);
    const data =
      item.kind === "rgba"
        ? dibFrame(Buffer.from(item.data, "base64"), s, s)
        : Buffer.from(item.data.split(",")[1], "base64");
    return { width: s, height: s, data, kind: item.kind === "rgba" ? "DIB" : "PNG" };
  });
  const ico = buildIco(frames);
  const file = path.join(HERE, `${name}.ico`);
  const before = fs.statSync(file).size;
  console.log(
    `\n${name}.ico  ${SIZES.length} 帧  ${before} → ${ico.length} 字节  ` +
      `(${frames.filter((f) => f.kind === "DIB").length} DIB + ${frames.filter((f) => f.kind === "PNG").length} PNG)`
  );
  if (OPTS.dry) {
    console.log("  --dry：没有写盘");
    continue;
  }
  // 备份原文件（只备份一次：已经存在同名 .bak 就不覆盖，免得第二次跑把原始版本冲掉）
  // ⚠️ 用**本地日期**，别用 toISOString()：那是 UTC，东八区下午跑会写成"昨天"，
  //    备份名和当天的日期对不上（第一次跑就踩到了）。
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const bak = `${file}.bak-${stamp}`;
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(file, bak);
    console.log(`  原文件已备份 → ${path.basename(bak)}`);
  } else {
    console.log(`  备份已存在，未覆盖 → ${path.basename(bak)}`);
  }
  fs.writeFileSync(file, ico);
  console.log(`  已写入 → ${file}`);
}

console.log(`\n中间产物（源图 PNG 与像素结果）留在：${WORK}`);
console.log("下一步：tools\\yungamestart\\build.bat（它会把新图标复制进 dist\\）");
