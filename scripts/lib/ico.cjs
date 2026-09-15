// ICO 容器：拆帧 / 封帧（32bpp DIB 与内嵌 PNG 两种帧）。
//
// 为什么单独一个模块：仓库里有两个出图工具都要写 .ico ——
//   · tools/yungamestart/assets/make-icons.mjs（桌面快捷方式的 1.ico / 2.ico）
//   · public/icons/render-icon.cjs（系统图标 icon.ico / 托盘 tray.ico）
// 各写一份封装代码的后果是"两个 ico 的帧布局悄悄不一样"，而这种事只有 Windows 上
// 某个尺寸显示异常时才看得出来。所以统一到这里，两边都 require 它。
//
// 用 CommonJS：调用方一个是 .cjs（Electron 主进程）、一个是 .mjs，CJS 两边都能吃
// （ESM 里 `import ico from "..."` 拿到的就是 module.exports）。
//
// 格式要点（Vista 起允许把 PNG 直接塞进 ico，省得自己编码位图）：
//   ICONDIR(6B) + N × ICONDIRENTRY(16B) + 各帧数据
// 帧有两种：
//   · **PNG**（直接内嵌，体积小，大尺寸首选）
//   · **DIB**（BITMAPINFOHEADER + 自下而上的 BGRA + AND 掩码，最老的那批 shell 代码路径只认它）

"use strict";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 这一帧是不是内嵌的 PNG（否则就是 DIB）。 */
function isPngFrame(data) {
  return data.subarray(0, 8).equals(PNG_SIG);
}

/** 拆 ico → 每一帧的尺寸/编码/数据。 */
function parseIco(buf) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) {
    throw new Error("不是 ico 文件（头部不对）");
  }
  const count = buf.readUInt16LE(4);
  const frames = [];
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16;
    const size = buf.readUInt32LE(o + 8);
    const offset = buf.readUInt32LE(o + 12);
    frames.push({
      width: buf[o] || 256, // 目录里宽高写 0 表示 256
      height: buf[o + 1] || 256,
      bpp: buf.readUInt16LE(o + 6),
      size,
      offset,
      data: buf.subarray(offset, offset + size),
    });
  }
  return frames;
}

/** 组 ico：ICONDIR + 各帧目录项 + 各帧数据（顺序即目录顺序）。 */
function buildIco(frames) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(frames.length, 4);
  const dir = Buffer.alloc(16 * frames.length);
  let offset = 6 + 16 * frames.length;
  frames.forEach((f, i) => {
    const o = i * 16;
    dir[o] = f.width >= 256 ? 0 : f.width;
    dir[o + 1] = f.height >= 256 ? 0 : f.height;
    dir[o + 2] = 0; // 调色板数（32bpp 用不到）
    dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6); // bpp
    dir.writeUInt32LE(f.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += f.data.length;
  });
  return Buffer.concat([head, dir, ...frames.map((f) => f.data)]);
}

/**
 * 32bpp 的 DIB 帧：BITMAPINFOHEADER + 自下而上的 BGRA + AND 掩码。
 * ⚠️ 三处容易错、且错了不报错的地方（照规范来，别"简化"）：
 *   · biHeight 要写**两倍**高度（XOR 位图 + AND 掩码各一份）；
 *   · 行序是**自下而上**；
 *   · AND 掩码每行按 4 字节对齐（16 宽 → 4 字节/行），alpha<128 的位要置 1。
 * 实测对照：宽度 16/24/32/48 的帧长正好是 1128/2440/4264/9640 ——
 * 与原版 1.ico 里那几帧**字节数完全一致**，说明这套算法与当年生成它的工具一致。
 *
 * @param {Buffer} rgba 原始像素（宽*高*4，未预乘）
 */
function dibFrame(rgba, w, h) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(w, 4);
  header.writeInt32LE(h * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16); // BI_RGB
  header.writeUInt32LE(w * h * 4, 20);

  const xor = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w * 4;
    for (let x = 0; x < w; x++) {
      const s = srcRow + x * 4;
      const d = (y * w + x) * 4;
      xor[d] = rgba[s + 2];
      xor[d + 1] = rgba[s + 1];
      xor[d + 2] = rgba[s];
      xor[d + 3] = rgba[s + 3];
    }
  }

  const stride = Math.ceil(w / 32) * 4;
  const mask = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[((h - 1 - y) * w + x) * 4 + 3] < 128) {
        mask[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return Buffer.concat([header, xor, mask]);
}

module.exports = { isPngFrame, parseIco, buildIco, dibFrame };
