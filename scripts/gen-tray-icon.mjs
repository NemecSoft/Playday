// 生成托盘专用图标：16x16 高对比 PNG。
// 背景用主题强调色（蓝），中间画一个白色播放三角——在 Windows 托盘(16x16)
// 上清晰可见，替代原来 256x256 的细线暗色 logo（那个缩到托盘根本看不见）。
//
// ⚠️ **已废弃（2026-09-16）**：托盘图标现在与系统图标**同源** —— 由 `public/icons/icon.svg`
// 渲成 `tray.png` + 多尺寸 `tray.ico`（见 `public/icons/render-icon.cjs` 与
// docs/design/app-icons.md），不再是这个蓝色方块。这里保留代码只是留个"手写 PNG 编码"的样例。
// 因此加了 `--force` 闸门：**不加参数直接跑会拒绝执行**，免得有人顺手跑它、把 tray.png
// 悄悄覆盖回旧图标（那种事只有下次看托盘才会发现）。
//
// 用法：node scripts/gen-tray-icon.mjs --force   （输出到 public/icons/tray.png）
import fs from "fs";
import path from "path";
import zlib from "zlib";

const SIZE = 16;
// 主题强调色（接近 accent）：蓝
const BG = [59, 130, 246, 255]; // #3b82f6
// 白色播放三角
const FG = [255, 255, 255, 255];

// 构造 RGBA 像素缓冲
function makePng() {
  const raw = Buffer.alloc(SIZE * SIZE * 4);
  // 播放三角顶点：右侧中点为圆心，画一个向右的三角
  // 圆角矩形背景
  const radius = 3;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      // 背景：圆角矩形
      const cx = x < radius ? radius - x : (x >= SIZE - radius ? x - (SIZE - 1 - radius) : 0);
      const cy = y < radius ? radius - y : (y >= SIZE - radius ? y - (SIZE - 1 - radius) : 0);
      const dist = Math.sqrt(cx * cx + cy * cy);
      const inRounded = x >= 0 && y >= 0 && x < SIZE && y < SIZE &&
        !(dist > radius && (x < radius || x >= SIZE - radius || y < radius || y >= SIZE - radius));
      if (inRounded) {
        raw[i] = BG[0]; raw[i + 1] = BG[1]; raw[i + 2] = BG[2]; raw[i + 3] = BG[3];
      } else {
        raw[i] = 0; raw[i + 1] = 0; raw[i + 2] = 0; raw[i + 3] = 0; // 透明
      }
      // 白色播放三角（中心偏右）
      const tx = x - 6.5; // 三角左边界
      const ty = y - 8;   // 三角垂直中心
      // 三角区域：从 (3,-5) 到 (9,0) 到 (3,5)（相对 ty 中心）
      const halfH = 4.5;
      const triLeft = 3;
      const triRight = 9.5;
      if (ty >= -halfH && ty <= halfH) {
        // 在当前 y 行，三角的 x 范围从 triLeft 线性扩展到 triRight
        const xStart = triLeft;
        const xEnd = triRight;
        if (tx >= xStart && tx <= xEnd) {
          raw[i] = FG[0]; raw[i + 1] = FG[1]; raw[i + 2] = FG[2]; raw[i + 3] = FG[3];
        }
      }
    }
  }
  return raw;
}

// 组装 PNG
function encodePNG(width, height, rawRGBA) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // 加 filter byte (0) 到每行
  const stride = width * 4;
  const filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0; // filter none
    rawRGBA.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(filtered, { level: 9 });
  const chunk = (type, data) => {
    const t = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcInput = Buffer.concat([t, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput) >>> 0, 0);
    return Buffer.concat([len, t, data, crcBuf]);
  };
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return crc ^ -1;
}

if (!process.argv.includes("--force")) {
  console.error("已废弃：托盘图标改由 public/icons/render-icon.cjs 生成（图标同源于 icon.svg，见 docs/design/app-icons.md）。");
  console.error("确实要重新生成旧的蓝色方块，就加 --force。");
  process.exit(1);
}

const raw = makePng();
const png = encodePNG(SIZE, SIZE, raw);
const out = path.join(process.cwd(), "public", "icons", "tray.png");
fs.writeFileSync(out, png);
console.log("已生成托盘图标:", out, `(${png.length} 字节)`);
