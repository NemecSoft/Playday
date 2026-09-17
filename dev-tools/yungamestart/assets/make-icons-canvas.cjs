// 重新生成快捷方式图标 —— **画布那一半**（跑在 Electron 里）。
//
// 为什么要有"一半在浏览器里"：解码 ico 内嵌的 PNG、逐像素改色后按 9 种尺寸高质量缩放、
// 再导出 PNG —— 这些能力 node 都没有现成的（项目零原生依赖，不为一个图标引 sharp）。
// 与其自己写 PNG 解码器，不如借仓库里本来就有的 Electron 当画布。
// 用法见 make-icons.mjs（它负责拆包/组包，这个文件只做"像素级的事"）。

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

// 页面里跑的脚本。要点：
//  · 剪影来自原图的 alpha（所以手柄形状一个像素都不动）；
//  · 白色按键用"白色程度"当权重混色（纯白=1、渐变本体=0）→ 按键边缘不会出现锯齿；
//  · 渐变沿线采样原图 6 个色标，在 HSL 上提饱和/压亮度后再线性回填 ——
//    只提饱和是"更艳"，压亮度才有"更深"（浅黄提饱和还是鲜黄，压亮度才变深金）。
const PAGE_SCRIPT = String.raw`
window.__run = async (items, opts) => {
  const load = (p) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("加载失败: " + p));
    im.src = "file:///" + p.replace(/\\/g, "/");
  });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const hex = (r, g, b) =>
    "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
  // 原始像素 → base64（小尺寸帧走这条路：node 那边要拿 RGBA 自己封 DIB）。
  // 分段拼接：一次 String.fromCharCode(...9 万个参数) 会爆调用栈。
  function b64(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (mx === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h * 360, s * 100, l * 100];
  }
  function hsl2rgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }

  const out = {};
  for (const it of items) {
    const img = await load(it.path);
    const W = img.width, H = img.height;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const src = cx.getImageData(0, 0, W, H).data;

    // 剪影外框（alpha>8）—— 采样与渐变参数都用它
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (src[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }

    // 沿对角线取 N 个色标：对角两端常落在剪影外（手柄上下是凹的），
    // 所以从目标点向外螺旋找**第一个"有颜色且不白"的像素**。
    const N = opts.stops;
    const stops = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const px = Math.round(x0 + (x1 - x0) * t);
      const py = Math.round(y0 + (y1 - y0) * t);
      let best = null;
      for (let r = 0; r < 90 && !best; r++) {
        for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r && !best; dx++) {
          const x = px + dx, y = py + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const p = (y * W + x) * 4;
          if (src[p + 3] < 200) continue;
          if (Math.min(src[p], src[p + 1], src[p + 2]) > 180) continue; // 白色按键不算
          best = [src[p], src[p + 1], src[p + 2]];
        }
      }
      stops.push(best || [128, 128, 128]);
    }
    const deep = stops.map(([r, g, b]) => {
      const [h, s, l] = rgb2hsl(r, g, b);
      return hsl2rgb(h, clamp(s * opts.saturate, 0, 100), clamp(l * opts.darken, 0, 100));
    });

    // 重画：渐变本体 + 白色按键（按白色程度平滑混）
    const cb = document.createElement("canvas");
    cb.width = W; cb.height = H;
    const bx = cb.getContext("2d", { willReadFrequently: true });
    const dst = bx.createImageData(W, H);
    const span = (x1 - x0) + (y1 - y0);
    const gradAt = (t) => {
      const k = clamp(t, 0, 1) * (deep.length - 1);
      const i0 = Math.floor(k), i1 = Math.min(deep.length - 1, i0 + 1);
      const f = k - i0;
      return [0, 1, 2].map((c) => deep[i0][c] * (1 - f) + deep[i1][c] * f);
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = src[i + 3];
      dst.data[i + 3] = a;
      if (a === 0) continue;
      const w = clamp((Math.min(src[i], src[i + 1], src[i + 2]) - 180) / 65, 0, 1);
      const g = gradAt((x - x0 + (y - y0)) / span);
      dst.data[i] = g[0] * (1 - w) + 255 * w;
      dst.data[i + 1] = g[1] * (1 - w) + 255 * w;
      dst.data[i + 2] = g[2] * (1 - w) + 255 * w;
    }
    bx.putImageData(dst, 0, 0);

    // 各尺寸：从 256 高质量缩放下来（原图那套小尺寸也是这么来的）。
    // 小尺寸回**原始像素**、大尺寸回 PNG —— 小尺寸那几帧在 ico 里存的是 DIB（BMP），
    // 封 DIB 是容器层的活，交给 make-icons.mjs 做（这里只出像素）。
    const sizes = {};
    for (const s of opts.sizes) {
      const cs = document.createElement("canvas");
      cs.width = s; cs.height = s;
      const sx = cs.getContext("2d", { willReadFrequently: true });
      sx.imageSmoothingEnabled = true;
      sx.imageSmoothingQuality = "high";
      sx.drawImage(cb, 0, 0, s, s);
      if (s <= opts.dibMax) {
        const d = sx.getImageData(0, 0, s, s).data;
        sizes[s] = { kind: "rgba", data: b64(new Uint8Array(d.buffer, d.byteOffset, d.byteLength)) };
      } else {
        sizes[s] = { kind: "png", data: cs.toDataURL("image/png") };
      }
    }
    out[it.name] = {
      size: [W, H],
      bbox: [x0, y0, x1, y1],
      stops: stops.map((c, i) => ({ from: hex(...c), to: hex(...deep[i]) })),
      sizes,
    };
  }
  return out;
};
`;

app.whenReady().then(async () => {
  const argv = process.argv.slice(2);
  const opt = { out: "", saturate: 1.5, darken: 0.86, stops: 6, sizes: [], dibMax: 48 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") opt.out = argv[++i];
    else if (a === "--saturate") opt.saturate = Number(argv[++i]);
    else if (a === "--darken") opt.darken = Number(argv[++i]);
    else if (a === "--stops") opt.stops = Number(argv[++i]);
    else if (a === "--dib-max") opt.dibMax = Number(argv[++i]);
    else if (a === "--sizes") opt.sizes = argv[++i].split(",").map(Number);
  }
  const items = argv.filter((a) => /\.png$/i.test(a)).map((p) => ({ name: path.basename(p, ".png"), path: path.resolve(p) }));

  const win = new BrowserWindow({ width: 300, height: 200, show: false });
  await win.loadFile(path.join(__dirname, "make-icons-canvas.html"));
  win.webContents.on("console-message", (_e, _l, m) => console.log("[canvas]", m));
  try {
    // ⚠️ 注入脚本末尾必须跟一个 `0;`：executeJavaScript 会回传"最后一个表达式的值"，
    // 而这里最后一句是赋值（值是个函数）→ 函数过不了 IPC，报的是一句
    // 莫名其妙的 "An object could not be cloned."。
    await win.webContents.executeJavaScript(PAGE_SCRIPT + "\n0;");
    const res = await win.webContents.executeJavaScript(
      `(async () => {
         try { return await window.__run(${JSON.stringify(items)}, ${JSON.stringify(opt)}); }
         catch (e) { return { __error: String((e && e.stack) || e) }; }
       })()`
    );
    if (res && res.__error) throw new Error(res.__error);
    for (const [name, r] of Object.entries(res)) {
      console.log(`\n[canvas] ${name}: 源 ${r.size[0]}x${r.size[1]}  剪影 x${r.bbox[0]}..${r.bbox[2]} y${r.bbox[1]}..${r.bbox[3]}`);
      for (const s of r.stops) console.log(`         色标 ${s.from} → ${s.to}`);
      const sizes = Object.keys(r.sizes).join(", ");
      console.log(`         尺寸: ${sizes}`);
    }
    // 像素结果走文件回给 make-icons.mjs（父子进程之间只共享 stdout，传不了几十 KB 的二进制）。
    const resultFile = path.join(opt.out, "canvas-result.json");
    fs.writeFileSync(resultFile, JSON.stringify(res), "utf-8");
    console.log(`\n[canvas] 结果已写入 ${resultFile}`);
  } catch (e) {
    console.error("[canvas] 失败:", e);
    process.exitCode = 1;
  }
  app.quit();
});
