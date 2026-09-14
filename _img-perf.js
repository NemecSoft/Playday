// 一次性（跑完即删）：用 Electron（应用里的同一个 Chromium 解码器）实测 PNG vs JPEG 的渲染链路。
//
// 第一版测法的两个错误（别再犯）：
//   1) bmp.close() 之后才读 width/height → 全是 0；
//   2) 第一个被测文件承担了冷启动（JIT / 画布 / 光栅化初始化）→ 188ms 的假数据。
// 这一版：每个文件跑 6 轮、丢掉第 1 轮、取中位数；画到卡片尺寸的画布（≈实际显示）；
// 窗口**可见** —— 隐藏窗口不参与合成，光栅化会走软件路径，测出来不代表真实手感。
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const DIR = path.join(process.env.TEMP || ".", "playday-img-perf");
const MIME = { ".png": "image/png", ".jpg": "image/jpeg" };
const ROUNDS = 6;
const CARD_W = 320; // ≈ 卡片实际显示宽度（config.json cardWidth=320）
const CARD_H = 180; // 16:9 封面

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: true, // 必须可见：隐藏窗口不走 GPU 合成
    width: 420,
    height: 260,
    x: 0,
    y: 0,
    frame: false,
  });
  await win.loadURL(
    `data:text/html,<html><body style="margin:0"><canvas id=c width=${CARD_W} height=${CARD_H}></canvas></body></html>`,
  );

  const files = fs.readdirSync(DIR).filter((f) => /\.(png|jpg)$/i.test(f));
  const rows = [];
  for (const f of files.sort()) {
    const buf = fs.readFileSync(path.join(DIR, f));
    const b64 = buf.toString("base64");
    const mime = MIME[path.extname(f).toLowerCase()];
    const r = await win.webContents.executeJavaScript(`(async () => {
      const b64 = ${JSON.stringify(b64)};
      const mime = ${JSON.stringify(mime)};
      const atobMs = [], decodeMs = [], drawMs = [];
      let w = 0, h = 0;
      const c = document.getElementById("c");
      const g = c.getContext("2d");
      for (let round = 0; round < ${ROUNDS}; round++) {
        // 与 src/utils/assets.ts 的真实链路一致：base64 → atob → 字节数组 → Blob
        const t0 = performance.now();
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const t1 = performance.now();
        const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
        const t2 = performance.now();
        g.drawImage(bmp, 0, 0, c.width, c.height);
        g.getImageData(0, 0, 1, 1); // 强制完成光栅化
        const t3 = performance.now();
        w = bmp.width; h = bmp.height;   // 先读尺寸，再 close
        bmp.close();
        if (round > 0) { atobMs.push(t1 - t0); decodeMs.push(t2 - t1); drawMs.push(t3 - t2); }
      }
      const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
      return { w, h, atobMs: med(atobMs), decodeMs: med(decodeMs), drawMs: med(drawMs) };
    })()`);
    rows.push({ file: f, kb: Math.round(buf.length / 1024), b64kb: Math.round(b64.length / 1024), ...r });
  }
  fs.writeFileSync(path.join(DIR, "_result.json"), JSON.stringify(rows, null, 2), "utf-8");
  app.quit();
});
