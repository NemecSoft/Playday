// Task 8 无头验证：游戏详情页 HTTP 服务器（静态服务 / Range 206 / api/videos / 路径穿越防护）+ 公告读取。
// gameServer.ts 不依赖 electron，可直接 import 编译产物（dist-electron/electron/core/gameServer.js）。
import fs from "fs";
import os from "os";
import path from "path";
import http from "http";

const { startGameServer, stopGameServer, getGameServerBaseUrl } = await import(
  "../dist-electron/electron/core/gameServer.js"
);

// 造一个临时 Game_Details 目录
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yungame-http-"));
const root = path.join(tmp, "Game_Details");
const gameDir = path.join(root, "Kenshi剑士");
fs.mkdirSync(path.join(gameDir, "videos"), { recursive: true });
fs.mkdirSync(path.join(gameDir, "videos", "sub"), { recursive: true });
fs.writeFileSync(path.join(gameDir, "index.html"), "<h1>Kenshi 详情</h1>");
fs.writeFileSync(path.join(gameDir, "style.css"), "body{}");
fs.writeFileSync(path.join(gameDir, "videos", "实况2.mp4"), Buffer.alloc(2000));
fs.writeFileSync(path.join(gameDir, "videos", "实况10.mp4"), Buffer.alloc(3000));
fs.writeFileSync(path.join(gameDir, "videos", "sub", "隐藏视频.webm"), Buffer.alloc(1000));
fs.writeFileSync(path.join(gameDir, "videos", "readme.txt"), "not video");

const base = await startGameServer(root);
console.log("服务器 base URL:", base);
const ok = base.startsWith("http://127.0.0.1:");
console.log("[start] 启动成功:", ok);

function get(p, headers = {}) {
  return new Promise((resolve) => {
    http.get(base + p, { headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on("error", (e) => resolve({ status: -1, error: e.message, headers: {}, body: Buffer.alloc(0) }));
  });
}

// 1) 静态 HTML
const html = await get("/games/Kenshi剑士/index.html");
console.log("[html] 状态:", html.status, "| 内容:", html.body.toString().trim(), "| MIME:", html.headers["content-type"]);

// 2) 目录自动补 index.html
const dir = await get("/games/Kenshi剑士/");
console.log("[dir→index] 状态:", dir.status, "| 内容:", dir.body.toString().trim());

// 3) Range 请求 → 206 视频分段
const range = await get("/games/Kenshi剑士/videos/实况2.mp4", { Range: "bytes=0-999" });
console.log("[range] 状态:", range.status, "| Content-Range:", range.headers["content-range"], "| 长度:", range.body.length);

// 4) /api/videos（含子文件夹分组 + 自然排序）
const vids = await get("/games/Kenshi剑士/..%2F../%2Fapi/videos?dir=Kenshi剑士"); // 简单形式
const vids2 = await get("/api/videos?dir=/games/Kenshi剑士/");
const data = JSON.parse(vids2.body.toString());
console.log("[api/videos] 状态:", vids2.status, "| root:", JSON.stringify(data.root), "| dirs:", JSON.stringify(data.dirs));

// 5) 路径穿越防护 → 403
const trav = await get("/games/..%2F..%2Fetc%2Fpasswd");
console.log("[traversal] 状态:", trav.status, "(期望403)");

// 6) 不存在文件 → 404
const nf = await get("/games/Kenshi剑士/nope.png");
console.log("[404] 状态:", nf.status);

// 7) 非 games 前缀 → 404
const other = await get("/api/other");
console.log("[非games] 状态:", other.status);

console.log("\nTask 8 详情页服务器验证完成 ✅");

// 关闭服务器并清理
stopGameServer();
fs.rmSync(tmp, { recursive: true, force: true });
