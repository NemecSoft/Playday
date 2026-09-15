// 从**矢量源**渲染本目录的应用图标与托盘图标（PNG + 多尺寸 ICO）。
//
// 背景：系统图标（窗口、任务栏、托盘、打包进 exe、浏览器标签页）以前是一张 256x256 的 PNG，
// 而它的矢量源就在同目录（`playnite.svg` = 红→金那套，也就是 1.ico 同一份手柄图）。
// 2026-09-16 起系统图标换成 `icon.svg`：**同样的手柄形状**，渐变换成"黄金 + 钻石两套最深色"
// （#DB9B00 → #EE0042 → #AA0094 → #930BB0）。改配色改 SVG 里那 4 行 <stop> 就行，不用动这个脚本。
//
// 为什么用 Electron 渲染：SVG → PNG 要真渲染器（渐变、抗锯齿、那条 path 里挖空的按键都要对），
// node 里没有；而仓库里本来就有 Electron，不必为出图引 sharp/svg2png。
// **这个脚本只用于开发出图，不进包**（public/icons 下的 .cjs/.html 不进前端 bundle，
// 也不在 electron-builder 的 files 白名单里）。
//
// 用法（仓库根目录）：
//   node_modules\electron\dist\electron.exe public\icons\render-icon.cjs
//       → icon.svg → icon.png(512) + icon.ico(7 帧) + tray.png(16) + tray.ico(6 帧)
//   ... render-icon.cjs --target icon     # 只重出应用图标
//   ... render-icon.cjs --target tray     # 只重出托盘图标
//
// ⚠️ 尺寸是按用途定的，别随手改小：
//   · icon.ico 要有 256（嵌进 exe 后，资源管理器"超大图标"取的就是它），也要有小尺寸（任务栏/标题栏）。
//     **嵌进 exe 的那种，多尺寸是真起作用的** —— shell 直接按视图大小取对应帧。
//   · tray.ico 的 20 / 24 / 32：**运行期其实用不上** —— 2026-09-16 实测，Electron 的
//     nativeImage 读 .ico 只取最大那一帧（四个 ico 都量到 256x256），多尺寸被压平，
//     实际是"递一张 256 让 Windows 按 DPI 自己缩"。留这几档是为了将来用
//     addRepresentation 做多倍率托盘图时不用重渲，不是为了现在。

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
// 拉 - ico 容器（封帧规则与 tools/yungamestart 那两个快捷方式图标共用同一份实现）
const { buildIco, dibFrame } = require("../../scripts/lib/ico.cjs");

const HERE = __dirname;
const argv = process.argv.slice(2);
const arg = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const target = arg("--target", "all");
const svgPath = path.resolve(arg("--svg", path.join(HERE, "icon.svg")));

/** ≤ 这个尺寸的帧封 DIB，更大的封 PNG（与快捷方式图标同一套取舍）。 */
const DIB_MAX = 48;
const TARGETS = {
  icon: { png: 512, icoSizes: [16, 24, 32, 48, 64, 128, 256] },
  tray: { png: 16, icoSizes: [16, 20, 24, 32, 48, 64] },
};

// 页面里跑的脚本：把 SVG 当图片喂进 canvas → 按每个尺寸画一遍 →
// 小尺寸回原始像素（node 那边要自己封 DIB）、大尺寸回 PNG。
const PAGE_SCRIPT = String.raw`
window.__render = async (dataUrl, sizes, dibMax, pngSize) => {
  const img = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("SVG 加载失败"));
    im.src = dataUrl;
  });
  // 分段拼：一次 String.fromCharCode(...十几万个参数) 会爆调用栈
  const b64 = (u8) => {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(s);
  };
  const draw = (s) => {
    const c = document.createElement("canvas");
    c.width = s; c.height = s;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    x.drawImage(img, 0, 0, s, s);
    return { canvas: c, ctx: x };
  };
  const out = { sizes: {} };
  for (const s of sizes) {
    const { canvas: c, ctx: x } = draw(s);
    if (s <= dibMax) {
      const d = x.getImageData(0, 0, s, s).data;
      out.sizes[String(s)] = { kind: "rgba", data: b64(new Uint8Array(d.buffer, d.byteOffset, d.byteLength)) };
    } else {
      out.sizes[String(s)] = { kind: "png", data: c.toDataURL("image/png") };
    }
  }
  // 单张 PNG 单独给一份：托盘的 PNG 只有 16（落在 DIB 档），不能从 sizes 里凑。
  out.png = draw(pngSize).canvas.toDataURL("image/png");
  return out;
};
`;

app.whenReady().then(async () => {
  if (!fs.existsSync(svgPath)) {
    console.error(`✗ 找不到矢量源：${svgPath}`);
    app.exit(1);
    return;
  }
  const names = target === "all" ? ["icon", "tray"] : [target];
  for (const n of names) {
    if (!TARGETS[n]) {
      console.error(`✗ 不认识的目标 ${n}（只能是 all / icon / tray）`);
      app.exit(1);
      return;
    }
  }
  const svg = fs.readFileSync(svgPath, "utf-8");
  const dataUrl = "data:image/svg+xml;base64," + Buffer.from(svg, "utf-8").toString("base64");
  const stops = [...svg.matchAll(/stop-color:(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
  console.log(`[icon] 矢量源 ${path.basename(svgPath)}  渐变 ${stops.join(" → ") || "(未识别)"}`);

  const win = new BrowserWindow({ width: 120, height: 120, show: false });
  await win.loadFile(path.join(HERE, "render-icon.html"));
  win.webContents.on("console-message", (_e, _l, m) => console.log("[icon]", m));
  try {
    // ⚠️ 注入脚本结尾那个 `0;` 是必需的：executeJavaScript 会回传"最后一个表达式的值"，
    // 而这里最后一句是赋值（值是个函数）→ 函数过不了 IPC，报的是莫名其妙的
    // "An object could not be cloned."。
    await win.webContents.executeJavaScript(PAGE_SCRIPT + "\n0;");

    for (const n of names) {
      const cfg = TARGETS[n];
      const all = [...new Set([...cfg.icoSizes, cfg.png])].sort((a, b) => a - b);
      const res = await win.webContents.executeJavaScript(
        `(async () => {
           try { return await window.__render(${JSON.stringify(dataUrl)}, ${JSON.stringify(all)}, ${DIB_MAX}, ${cfg.png}); }
           catch (e) { return { __error: String((e && e.stack) || e) }; }
         })()`
      );
      if (res.__error) throw new Error(res.__error);

      // PNG（给 favicon / PNG 回退路径用）：单独一份，不从 sizes 里凑
      //（托盘的 PNG 尺寸 16 落在 DIB 档，那里只有原始像素）。
      const pngSize = cfg.png;
      const pngFile = path.join(HERE, `${n}.png`);
      const pngBuf = Buffer.from(res.png.split(",")[1], "base64");
      fs.writeFileSync(pngFile, pngBuf);

      // ICO（多尺寸）
      const frames = cfg.icoSizes.map((s) => {
        const item = res.sizes[String(s)];
        if (!item) throw new Error(`缺 ${s} 这一帧`);
        const data =
          item.kind === "rgba"
            ? dibFrame(Buffer.from(item.data, "base64"), s, s)
            : Buffer.from(item.data.split(",")[1], "base64");
        return { width: s, height: s, data, kind: item.kind === "rgba" ? "DIB" : "PNG" };
      });
      const icoFile = path.join(HERE, `${n}.ico`);
      fs.writeFileSync(icoFile, buildIco(frames));

      console.log(
        `[icon] ${n}.png  ${pngSize}x${pngSize}  ${(pngBuf.length / 1024).toFixed(1)} KB` +
          `    ${n}.ico  ${frames.length} 帧 [${frames.map((f) => f.width).join(",")}]  ` +
          `${(fs.statSync(icoFile).size / 1024).toFixed(1)} KB`
      );
    }
  } catch (e) {
    console.error("[icon] 失败:", e);
    process.exitCode = 1;
  }
  app.quit();
});
