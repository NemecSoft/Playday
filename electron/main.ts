// 整个应用的主入口：负责创建窗口、注册 IPC、挂系统托盘。
// 名字统一从 electron/config.ts 拿，不在本文件硬编码。
import { app, BrowserWindow, Menu } from "electron";
import * as path from "path";
import { registerIpc } from "./ipc/register";
import { openDb, closeDb, syncRuntimeDatabase } from "./core/db";
import { readSettings } from "./core/settings";
import { stopGameServer } from "./core/gameServer";
import { createTray, destroyTray } from "./core/tray";
import { refreshAppIcons } from "./core/appIcon";
import { registerErrorCollector } from "./core/errorCollector";
import { ensureRuntimeDeps } from "./core/runtimeSetup";
import { reportGpuStatus } from "./core/gpuReport";
import { isCheckMode, runCheckMode } from "./core/checkMode";
import { isPathLogEnabled, writePathReport } from "./core/pathLogMode";
import {
  createClientWindow,
  createAnnouncementWindow,
  createCrashHandlerWindow,
  setCrashReport,
} from "./windows";

// 说明：管理端应用已移除（数据由手工维护的整库 JSON 写进源库 —— npm run db:export / db:import，
// 见 docs/design/library-json.md）。
// 现在只有客户端一种运行形态，不再有 --admin / Playday.Admin.exe 分支。

// 全局保存窗口引用，避免被垃圾回收。
let clientWin: BrowserWindow | null = null;
let announcementWin: BrowserWindow | null = null;

// `exe --check`：启动项 / 存档路径自检，**不创建任何窗口**（服务器、无人值守环境用，
// 那里可能根本跑不了图形界面）。放在 whenReady 之前发起：自检只需要 Node 侧的东西
// （sql.js 读库 + fs 判文件），不需要 Chromium 的窗口栈；结果写 <数据根>\logs\check-*.log，
// 跑完立刻 app.exit(退出码)（0 无问题 / 1 有问题 / 2 自检失败）。见 docs/design/launch-and-paths.md。
if (isCheckMode()) {
  void runCheckMode().then((code) => {
    closeDb();
    app.exit(code);
  });
}

// `exe -log`（也认 --log）：**只多写一份路径日志，照常进界面**。
// 与 --check 的分工见 pathReport.ts 顶部：--check 是独立模式（跑完就退），而 -log 要回答的是
// "真的跑起来时各目录落在哪" —— 那只有在真的启动一次时才有答案。
// 放在 whenReady 之前写：此刻不依赖窗口/渲染进程，而且越早越不容易被后面的失败掩盖
//（路径配错往往正是启动失败的原因）。结果写 <数据根>\logs\paths-<时间戳>.log + paths-latest.log。
if (isPathLogEnabled()) {
  writePathReport();
}

app.whenReady().then(async () => {
  // 自检模式：不建窗口、不注册 IPC、不装运行库 —— 直接交回（进程会在自检结束后退出）。
  // 这个判断与上面那段是配套的：whenReady 可能先于自检完成而触发，不拦就会弹出公告窗口，
  // 那正是"不许起 GUI"要避免的事。
  if (isCheckMode()) return;

  // 去掉 Electron 自带的顶部应用菜单（File/Edit/View/Window/Help）。
  // 窗口已用 frame:false 去掉了原生标题栏和外框，这里再用 setApplicationMenu
  // 把剩下的菜单条彻底清掉，让 UI 完全由前端 TopBar 自定义。
  Menu.setApplicationMenu(null);

  // 注册所有主进程 ←→ 渲染进程 的命令。
  registerIpc();

  // 错误收集器：主进程崩溃/未捕获异常/渲染进程崩溃时，弹崩溃处理窗口（UnityCrashHandler64 风格）。
  registerErrorCollector((report) => {
    try {
      setCrashReport(report);
      createCrashHandlerWindow();
    } catch (e) {
      console.error("[main] 创建崩溃处理窗口失败:", e);
    }
  });

  // 按设置决定是否启用系统托盘。
  // 注：游戏详情页本地 HTTP 服务器不再在这里启动，改为"第一次打开详情页时"
  // 由 get_game_server_url 惰性启动（见 ipc/gameHtml.ts），缩短应用启动时间。
  if (readSettings().enableTray) {
    try {
      createTray();
    } catch (e) {
      console.error("[main] 创建托盘失败:", e);
    }
  }

  // 启动就先比一次"权威库 vs 运行时副本"（大小 + 修改时间），**不一致就复制**（用户指定）。
  // 这步很轻（一次 stat；不一致时本机实测复制 7.7ms），放在窗口之前做掉也感觉不到。
  // 真正重的是"sql.js 初始化 + 把库读进内存"，那个仍然推迟到点"进入系统"时（见 enterSystem）——
  // 所以公告窗口一样能第一时间弹出来。
  syncRuntimeDatabase();

  // 先弹公告窗口（独立引导窗口）。
  announcementWin = createAnnouncementWindow();

  // 应用图标按等级定（黄金 1.ico / 钻石 2.ico，见 core/appIcon.ts）：
  // 这里先用**上次落库的等级**把窗口与托盘刷一遍 —— 窗口构造时已按同一份等级初设过，
  // 这一步补的是托盘（它的图标在 createTray 里取，也在"判出等级之前"）。
  // 本机等级真正判出来之后，ipc/auth.ts 那几条命令会再刷一次（这是常态路径）。
  refreshAppIcons();

  // 运行库静默检测安装（VC++ 运行库 x64/x86、VP9 解码扩展）：
  // 完全后台 —— 本调用同步立刻返回，且内部还刻意延后几秒才开始，不阻塞也不抢启动期的资源；
  // 缺哪个装哪个，装不上只写 <数据根>\logs\runtime-setup.log，不弹任何窗口。
  // 放在"公告窗口已创建"之后，是为了把启动路径上的活干完再谈后台任务。
  ensureRuntimeDeps();

  // 记一行 GPU 加速状态到 <数据根>\logs\gpu.log（等 GPU 信息就绪再读，绝不阻塞启动）。
  // 为什么留这条日志：网吧现场"界面发涩、滚动掉帧"时，第一件要确认的事就是"这台机器到底有没有
  // 在用硬件加速" —— 有日志就不用再去现场写探针。见 docs/design/gpu-acceleration.md。
  void reportGpuStatus();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      clientWin = createClientWindow();
    }
  });
});

// "进入系统"：公告窗口点按钮后回调到主进程，关闭公告窗口、创建主窗口。
// 供 system.ts 的 IPC 调用，避免循环依赖。
// 这里打开数据库 —— 但"整库复制"不在这儿：**那一步已经在应用启动时做过了**
// （见 whenReady 里的 syncRuntimeDatabase），这里只剩"sql.js 初始化 + 把库读进内存"
// （openDb 内部会再调一次同步做幂等兜底，一致时只是一次 stat），所以公告窗口仍是第一时间弹出。
export async function enterSystem(): Promise<void> {
  // 先打开数据库（sql.js 是异步初始化，幂等：已打开则直接复用）。
  // 只有 db 就绪后才创建主窗口，避免主窗口里访问数据时库还没就绪。
  await openDb();
  // 关闭公告窗口
  if (announcementWin) {
    announcementWin.close();
    announcementWin = null;
  }
  // 创建主窗口（如果还没创建）
  if (!clientWin || clientWin.isDestroyed()) {
    clientWin = createClientWindow();
  }
}

// 窗口全关时的行为：若启用了托盘，则进程常驻（托盘可唤回窗口）；否则退出。
app.on("window-all-closed", () => {
  const trayEnabled = readSettings().enableTray;
  if (process.platform !== "darwin" && !trayEnabled) {
    app.quit();
  }
});

// 退出前清理：**只关连接、不写库**（用户指定"退出应用，不能写库"；每个写操作都已在改完后
// 自己落盘，见 core/db.ts 的 closeDb 说明）、关闭详情页服务器、销毁托盘，避免端口/资源占用。
app.on("before-quit", () => {
  closeDb();
  stopGameServer();
  destroyTray();
});

// 导出窗口引用，供系统命令（system.ts）控制窗口时使用。
export function getClientWindow(): BrowserWindow | null {
  return clientWin;
}
