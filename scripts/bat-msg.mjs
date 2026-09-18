#!/usr/bin/env node
/**
 * .bat 要说给用户听的话，全放这里（中文）。
 *
 * 为什么需要这个文件：
 *   仓库里给用户双击的 .bat 一律**纯 ASCII**，不是偷懒 —— cmd.exe 会边执行边按
 *   字节偏移重读 .bat，配合 chcp 切代码页时，多字节文本会让它错位、把半行当命令
 *   执行（真出现过："'age.bat' is not recognized ..."）。原因写在 package.bat 顶部，
 *   dev-tools/cover-optimizer 也是同一个套路（.bat 纯 ASCII，中文放 .ps1）。
 *
 *   于是"我们自己要说的话"不能写在 .bat 里，改由 Node 打印：
 *       call node scripts\bat-msg.mjs deploy.header
 *   Node 输出 UTF-8，bat 里已经 chcp 65001，中文正常显示。
 *
 * 用法：
 *   node scripts/bat-msg.mjs <key> [{1}] [{2}] ...
 *   后几个参数会替换消息里的 {1} {2} 占位符（例如把路径填进提示里）。
 *   一次可以给多个 key，按给的顺序打印。
 *
 * 约定：
 *   - 消息一律中文，且"通俗易懂"：说清出了什么事 + 你该怎么办；
 *     不要只丢术语或错误码（那是给开发者看的，放注释里）。
 *   - 官方/第三方自己的英文输出（npm、electron-builder、g++、cmd）不要在这里翻译，
 *     也不要包一层 —— 看到英文就知道"这句不是我们说的"，这正是分得清的前提。
 *   - key 打错会打印告警并以退出码 1 结束，免得 bat 里写错名字却静默没输出。
 */

const MESSAGES = {
  // ---------- 所有 bat 共用 ----------
  "node.proto-ok": "[提示] 已切到 proto 管理的 Node 22.23.2",
  "node.proto-fallback": "[提示] 没找到 proto 管理的 Node 22，改用系统安装的 node",
  "wait-key": "   ---- 结束，按任意键关闭本窗口 ----",

  // ---------- deploy.bat ----------
  "deploy.header": [
    "============================================",
    " Playday 一键部署（直接部到本机的测试环境）",
    " 目标目录: 由 path-modes.json 决定（release 段）",
    " 暂存目录: {1}",
    "============================================",
  ],
  "deploy.full": "[提示] 收到 --full：这次做干净构建 + 完整重打包（忽略全部缓存）",
  "deploy.step-build": "[1/4] 编译主进程和界面（增量：没改动的部分整段跳过）...",
  "deploy.step-pack": "[2/4] 打包（增量：骨架没变就只重打 app.asar）...",
  "deploy.step-deploy": "[3/4] 复制到目标目录（程序 + 素材 + config.json）...",
  "deploy.step-keep": "[4/4] 保留暂存目录 {1}（它是下次增量打包的基准）...",
  "deploy.err-build": "[出错] 编译失败，已中止，目标目录没有任何改动。原因和怎么办见上面。",
  "deploy.err-pack": "[出错] 打包失败，已中止，目标目录没有任何改动。原因和怎么办见上面。",
  "deploy.err-deploy": "[出错] 复制到目标目录失败，已中止。它没有留下半成品（这是故意的），原因见上面。",
  "deploy.done": [
    "============================================",
    " 部署完成。",
    "",
    " 下一步：去目标目录双击 PlayniteUI.exe 试一下；",
    "         试过没问题，再双击 promote.bat 发布到正式机（Z: 盘）。",
    " 整次运行的日志：logs\\deploy-last.log",
    "============================================",
  ],

  // ---------- promote.bat ----------
  "promote.header": [
    "============================================",
    " Playday 一键发布（测试环境 -> 正式机）",
    "============================================",
  ],
  "promote.step": "[1/2] 发布中（按设计这里不重新编译：发出去的必须是刚试过的那个目录）...",
  "promote.err-parser": [
    "[出错] 缺少 dist-electron\\shared\\pathModes.js，已中止。",
    "        它存着路径规则表，而发布要靠那张表；先双击一次 deploy.bat 就有了。",
  ],
  "promote.err-failed": "[出错] 发布失败。测试目录**没有被清空**（这是故意的，方便你重试）。原因见上面。",
  "promote.done": [
    "============================================",
    " 发布流程结束。下一步做什么，看上面日志里打的那句。",
    " 整次运行的日志：logs\\promote-last.log",
    "============================================",
  ],

  // ---------- package.bat ----------
  "package.header": [
    "============================================",
    " Playday 打包（只产出成品目录，不做部署）",
    " 输出目录: {1}",
    " 成品文件: {1}\\PlayniteUI.exe",
    "============================================",
  ],
  "package.mirror": "[提示] Electron 安装包下载源（国内镜像）: {1}",
  "package.err-outdir": [
    "[出错] 输出目录只允许填 release，收到的是 \"{1}\"，已中止。",
    "        第 4 步会把这个目录整个清空，所以只认这一个固定名字 —— 名字打错或写成别的路径，",
    "        都不会误删别的东西。要用别的名字请改这个 bat 里的判断，别直接传参数。",
  ],
  "package.step-build": "[1/4] 编译主进程和界面...",
  "package.step-builder": "[2/4] electron-builder 打包成免安装目录...",
  "package.step-copy": "[3/4] 清空 {1}，再把成品复制进去 ...",
  "package.step-staging": "[4/4] 删除暂存目录 {1} ...",
  "package.err-build": "[出错] 编译失败，已中止。上一次的成品还在，没被破坏。原因见上面。",
  "package.err-builder": "[出错] electron-builder 打包失败，已中止。原因见上面。",
  "package.err-clear": "[出错] 清空 {1} 失败，已中止。多半是有程序正在用它（资源管理器开着、或里面的 exe 没退干净），关掉再重跑。",
  "package.err-robocopy": "[出错] 复制成品到 {1} 失败（robocopy 返回码 {2}，8 及以上才算失败）。原因见上面。",
  "package.err-yungamestart-copy": "[出错] 复制 yungamestart 失败（robocopy 返回码 {1}）。",
  "package.err-no-runtime": [
    "[出错] 找不到 dev-tools\\runtime，已中止 —— 运行库安装包发不出去，这样的包到别人机器上可能起不来。",
    "        先确认 dev-tools\\runtime 里有 VC++ 运行库和 VP9 扩展再重跑。",
  ],
  "package.err-runtime-copy": "[出错] 复制运行库安装包失败（robocopy 返回码 {1}）。",
  "package.extra-yungamestart": "[附加] 已带上 yungamestart -> {1}\\YunGameStart",
  "package.extra-skip-yungamestart": "[附加] 跳过 yungamestart（还没编译过；要带就先去 dev-tools\\yungamestart 双击 build.bat）",
  "package.extra-runtime": "[附加] 已带上运行库安装包 -> {1}\\runtime",
  "package.done": [
    "============================================",
    " 打包完成。",
    " 成品: {1}\\PlayniteUI.exe",
    " （这只是个成品目录，开发/测试用的数据没被碰过）",
    "============================================",
  ],

  // ---------- new-game-id.bat ----------
  "new-game-id.err": "[出错] id 没生成出来，原因见上面那几行。",

  // ---------- data-dir.bat ----------
  "data-dir.err": [
    "[出错] 取不到开发态数据目录，调用方应当立即中止。",
    "        两种可能：机器上没有 node，或者 path-modes.json 写坏了。",
  ],

  // ---------- sync-config.bat ----------
  "sync-config.err-preview": [
    "[出错] 预览这一步就失败了，config.json 没有被改动。常见原因：",
    "        · path-modes.json 的 dev 段不合法（dev 必须落在 D: 盘，字段不能缺、也不能有没见过的名字）",
    "        · 编译产物 dist-electron\\shared\\pathModes.js 不存在，或比它的源码 shared\\pathModes.ts 旧",
    "        源码比产物新的话，先跑一次 npm run build 再重试。",
  ],
  "sync-config.err-write": "[出错] 写入 config.json 时失败了，它没有被改动。原因见上面。",
  "sync-config.err-verify": "[出错] 最后核对没通过：两个文件还是对不上。原因见上面。",
  "sync-config.ok": "[完成] dev 的 config.json 已与 path-modes.json 一致。",

  // ---------- 窗口标题（title.*，只设标题不打印）----------
  "title.dev-client": "Playday 客户端开发模式",
  "title.deploy-web": "Playday 网站版部署",
  "title.test-web": "Playday 网站版测试",
  "title.push": "Playday 一键推送",
  "title.sync-tags": "Playday 标签同步",
  "title.export-games": "Playday - 导出数据库为 games.json（给存档工具 GameSaveHelper 用）",
  "title.librarydb-backup": "Playday - 备份权威库（Admin\\library.db -> library.db.bak-时间戳）",
  "title.librarydb-export": "Playday - 权威库 导出成 整库JSON（Admin\\library.db -> 整库 JSON 目录）",
  "title.libraryjson-import": "Playday - 整库JSON 回写进 权威库",
  "title.update-userlist": "Playday 更新用户表",
  "title.userlist-crypt": "Playday 用户表 加密 / 解密",
  "title.encrypt-userlist": "Playday 加密用户表",

  // ---------- deploy-web.bat ----------
  "deploy-web.step-build": "[1/2] 构建前端...",
  "deploy-web.err-build": "[错误] 前端构建失败。",
  "deploy-web.clear-port": "  [清理] 端口 8080 被进程 {1} 占用，正在停止...",
  "deploy-web.step-serve": "[2/2] 启动网站后端...",
  "deploy-web.visit": "访问 http://localhost:8080",

  // ---------- test-web.bat ----------
  "test-web.header": [
    "============================================",
    " Playday 网站版测试",
    "============================================",
  ],
  "test-web.err-nodatadir": "[错误] 取不到开发态数据目录，已中止。",
  "test-web.warn-incomplete": [
    "[警告] 数据不完整（缺权威库或运行时副本）：{1}",
    "        请确认桌面版数据正常（config.json 的 libraryDir；权威库固定为它的 Admin 子目录）。",
  ],
  "test-web.ask-continue": "数据不完整，仍然继续吗？(按 Y 继续 / 按 N 中止)",
  "test-web.ok-datadir": "[1/3] 数据目录 OK：{1}",
  "test-web.step-build": "[2/3] 构建前端...",
  "test-web.err-build": "[错误] 前端构建失败。",
  "test-web.step-port": "[3/4] 检查 8080 端口...",
  "test-web.clear-port": "  [清理] 端口 8080 被进程 {1} 占用，正在停止...",
  "test-web.step-serve": "[4/4] 启动网站后端，打开浏览器...",
  "test-web.stopped": "服务器已停止。",

  // ---------- export-games.bat ----------
  "export-games.header": [
    "==============================================",
    "   {1} -> games.json",
    "==============================================",
  ],
  "export-games.err-nodb": "[错误] 找不到权威库 {1}，已中止。",
  "export-games.err-failed": "[失败] 导出未完成，原来的 games.json 没有被改动。",
  "export-games.done": [
    "[完成] 已导出为项目根目录 games.json（coverImage 置空，",
    "        developer / genre / tags / series 等都是名称数组）。",
  ],

  // ---------- push.bat ----------
  "push.header": [
    "============================================",
    " Playday 一键推送（数据目录 -> GitHub）",
    "============================================",
  ],
  "push.err-noremote": [
    "[错误] 还没有配置 remote，请先执行：",
    "  git remote add origin https://github.com/NemecSoft/Playday.git",
  ],
  "push.info-data-outside": "[提示] 开发态数据不在仓库内（{1}），跳过数据变更检查，只做推送。",
  "push.info-nothing": [
    "[提示] 当前没有新的数据变更，无需提交。",
    "        （若改了代码想提交，请手动 git add + commit）",
  ],
  "push.step-commit": "[1/2] 检测到数据目录有更新，正在提交...",
  "push.err-commit": "[错误] 提交失败。原因见上面的 git 输出。",
  "push.step-push": "[2/2] 推送远程...",
  "push.err-push": [
    "[错误] 推送失败。可能原因：",
    "  - 网络不通 / 需要登录 GitHub",
    "  - 远程仓库有冲突，先 git pull 再推",
  ],
  "push.done": "推送完成。",
  "push.commit-msg": "更新数据（{1} {2}）：library / announcements / config.json",

  // ---------- update-userlist.bat ----------
  "update-userlist.err-nosrc": [
    "[错误] 找不到明文主本：{1}",
    "        默认位置是 files\\YunGame_UserList.json —— 把明文放那儿，或者把文件拖到本 bat 上。",
  ],
  "update-userlist.header": [
    "============================================",
    " Playday 更新用户表",
    " 明文  : {1}",
    " 目标  : 当前生效那份（由 config.json 的 YunGameConfigDir 决定）",
    "============================================",
  ],
  "update-userlist.step-preview": "[1/2] 预览（不写任何文件）",
  "update-userlist.err-preview": "[update-userlist] 预览就失败了（原因见上）。已中止，未写任何文件。",
  "update-userlist.ask-write": "按 Y 回车写入（会先备份旧文件）；其它键取消",
  "update-userlist.cancelled": "[update-userlist] 已取消，文件未改动。",
  "update-userlist.step-write": "[2/2] 加密并写入...",
  "update-userlist.err-write": "[update-userlist] 失败，文件未改动。",
  "update-userlist.done": [
    "[update-userlist] 完成。重启客户端即生效。",
    "                  回退：把目标目录里留下的 .bak-时间戳 覆盖回去即可。",
  ],

  // ---------- userlist-crypt.bat ----------
  "userlist-crypt.header": [
    "============================================",
    " Playday 用户表 加密 / 解密",
    "",
    "   1 = 加密（明文 -> 密文：改完后加密回去，给客户端读）",
    "   2 = 解密（密文 -> 明文：要人工编辑时，先做这一步）",
    "============================================",
  ],
  "userlist-crypt.ask-mode": "请选择 1 或 2（直接回车 = 1 加密）",
  "userlist-crypt.err-mode": "[错误] 只认 1 或 2，本次退出。",
  "userlist-crypt.ask-file": "输入要处理的文件路径（直接回车 = 用 config.json 里 YunGameConfigDir 那份）",
  "userlist-crypt.dir-encrypt": "加密（明文 -> 密文）",
  "userlist-crypt.dir-decrypt": "解密（密文 -> 明文）",
  "userlist-crypt.file-from-config": "（config.json 里那份）",
  "userlist-crypt.header2": [
    "============================================",
    " 方向: {1}",
    " 文件: {2}",
    "============================================",
  ],
  "userlist-crypt.header-dst": " 目标: {1}",
  "userlist-crypt.step-preview": "[1/2] 预览（不写任何文件）",
  "userlist-crypt.err-preview": "[userlist-crypt] 预览就失败了（原因见上）。已中止，未写任何文件。",
  "userlist-crypt.ask-apply": "按 Y 回车执行；其它键取消",
  "userlist-crypt.cancelled": "[userlist-crypt] 已取消，文件未改动。",
  "userlist-crypt.step-apply": "[2/2] 执行...",
  "userlist-crypt.err-apply": "[userlist-crypt] 失败，文件未改动。",
  "userlist-crypt.done": [
    "[userlist-crypt] 完成。客户端明文/密文都能读，不需要改配置。",
    "                回退：若脚本留下了 .bak-时间戳 备份，覆盖回原文件即可。",
  ],

  // ---------- encrypt-userlist.bat ----------
  "encrypt-userlist.header": [
    "============================================",
    " Playday 一键加密用户表",
    " 源  : {1}",
    " 目标: {2}",
    "============================================",
  ],
  "encrypt-userlist.step-preview": "[encrypt] 第 1 步：预览（不写文件）",
  "encrypt-userlist.err-preview": "[encrypt] 预览就失败了（上面有原因，例如「源文件已经是密文」）。已中止，未写任何文件。",
  "encrypt-userlist.ask-write": "按 Y 回车加密并写入目标文件（会先备份目标）；其它键取消",
  "encrypt-userlist.cancelled": "[encrypt] 已取消，文件未改动。",
  "encrypt-userlist.step-write": "[encrypt] 第 2 步：加密并写盘...",
  "encrypt-userlist.err-write": "[encrypt] 加密失败，目标文件未改动。",
  "encrypt-userlist.done": [
    "[encrypt] 完成。",
    "         回退方法：把同目录的 YunGame_UserList.json.bak-时间戳 覆盖回去即可。",
    "         客户端会自动识别明文/密文，不需要改配置。",
  ],

  // ---------- dev-tools/GameSaveHelper ----------
  "title.gsh-test": "GameSaveHelper - 测试环境",
  "title.gsh-prod": "GameSaveHelper - 正式环境",
  "title.gsh-checkjson": "GameSaveHelper - 检测 games.json",
  "title.gsh-scenarios": "GameSaveHelper - 存档备份四种场景测试",
  "gsh.err-nofile": "[错误] 找不到文件：{1}",
  "gsh.err-node": "[错误] 检测脚本跑不起来，请确认装了 node（v18 以上）。",
  "gsh.report-file": "gamesjson-问题清单.txt",
  "gsh.ask-open": "是否打开完整清单（gamesjson-问题清单.txt）？(按 Y 打开，其它键跳过)",
  "gsh.scenario-header": [
    "==================================================",
    " GameSaveHelper 存档备份四种场景测试",
    " （每个场景会弹窗显示结果，关掉窗口后自动继续）",
    "==================================================",
  ],
  "gsh.game1": "双点校园",
  "gsh.game2": "影子诡局：被诅咒的海盗",
  "gsh.game3": "大富翁11",
  "gsh.game4": "医院666-网吧联机版",
  "gsh.backup-glob": "存档备份【*】*.exe",
  "gsh.scenario1": [
    "---------- 场景 1 / 4：savePaths 为空 ----------",
    " 游戏：双点校园",
    " 预期：红底窗口提示『存档配置为空，请联系管理员』（不生成备份包）",
    " 关掉弹出的窗口后自动继续...",
  ],
  "gsh.pass1": "【通过】已正确提示『存档配置为空，请联系管理员』",
  "gsh.fail1": "【失败】没有得到预期的『配置为空』结果",
  "gsh.scenario2": [
    "---------- 场景 2 / 4：1 条路径 ----------",
    " 游戏：影子诡局：被诅咒的海盗",
    " 预期：绿底窗口显示『备份成功』，备份包生成到桌面",
  ],
  "gsh.scenario3": [
    "---------- 场景 3 / 4：2 条路径 ----------",
    " 游戏：大富翁11",
    " 预期：绿底窗口显示『备份成功』，两条路径都打进同一个包",
  ],
  "gsh.scenario4": [
    "---------- 场景 4 / 4：3 条路径，其中 1 个是空目录 ----------",
    " 游戏：医院666-网吧联机版",
    " 预期：绿底窗口显示『备份成功』，空目录被自动跳过并在详情里列出",
  ],
  "gsh.pass-backup": "【通过】备份包已生成到桌面",
  "gsh.pass-skip": "【通过】空目录已跳过，备份包已生成到桌面",
  "gsh.fail-red": "【失败】窗口里是红底失败信息，请检查存档路径",
  "gsh.result": [
    "==================================================",
    " 测试结果：通过 {1} 项 / 失败 {2} 项",
    "==================================================",
  ],
  "gsh.recent-backups": "最近生成的备份包（桌面）：",
  "gsh.usage-note": "说明：双击任一备份包，点『存档恢复』即可还原到原始位置。",
  "title.gsh-build-release": "GameSaveHelper - 构建 Release",
  "title.gsh-push-git": "GameSaveHelper - 推送到 GitHub",
  "gsh-test-name": "大富翁11",
  "gsh-build.header": [
    "==================================================",
    " GameSaveHelper 构建 Release",
    "==================================================",
  ],
  "gsh-build.step-compile": "[1/4] 编译主程序 ...",
  "gsh-build.step-prepare": "[2/4] 准备目录 {1}\\ ...",
  "gsh-build.step-copy": "[3/4] 复制文件 ...",
  "gsh-build.copy-nsis": "    复制 NSIS 编译器（较大，可 set SKIP_NSIS=1 跳过）...",
  "gsh-build.step-settings": "[4/4] 生成配置文件 settings.json ...",
  "gsh-build.done": [
    "==================================================",
    " 完成！release 目录内容：",
    "==================================================",
  ],
  "gsh-build.deploy-note": [
    "部署说明：整个 release 文件夹拷到目标机器即可。",
    "如路径有变化，直接编辑 release\\settings.json。",
  ],
  "gsh-build.err": "[错误] 构建 release 失败，请检查上面的错误信息。",
  "gsh-push.header": [
    "==================================================",
    " GameSaveHelper 推送到 GitHub",
    " 仓库: {1}",
    "==================================================",
  ],
  "gsh-push.step-init": "[1/5] git init ...",
  "gsh-push.skip-init": "[1/5] 已经是 git 仓库，跳过 init",
  "gsh-push.step-add": "[2/5] git add ...",
  "gsh-push.step-commit": "[3/5] git commit ...",
  "gsh-push.commit-msg": "更新 {1} {2}",
  "gsh-push.nothing": "        没有新的变更需要提交",
  "gsh-push.step-remote": "[4/5] 配置分支 main 和远程仓库 ...",
  "gsh-push.step-push": "[5/5] git push ...",
  "gsh-push.done": [
    "==================================================",
    " 完成！已推送到 {1}",
    "==================================================",
  ],
  "gsh-push.err": [
    "推送失败，请检查上面的错误信息。",
    "常见原因：没装 git / 网络或代理不通 / GitHub 未登录授权（首次 push 会弹浏览器登录）。",
  ],

  // ---------- scripts/migrate-playnite ----------
  "title.migrate-playnite": "Playnite -> Playday 数据迁移",
  "title.clear-playday": "一键清空 Playday 目标库（games 表）",
  "migrate.header": [
    "============================================================",
    " Playnite -> Playday 数据迁移工具",
    " 可反复运行（幂等）：按游戏名匹配，保留 Playday 特有字段",
    " 写库前自动备份目标库为 library.db.migrate-bak",
    "============================================================",
  ],
  "migrate.err": "[失败] 迁移未完成，请查看上方的错误信息。",
  "migrate.done": "[完成] 迁移成功。若要回滚，用迁移前的备份 library.db.migrate-bak 覆盖目标库即可。",
  "clear-playday.header": [
    "============================================================",
    " 一键清空 Playday 目标库 games 表",
    " 备份到 library.db.reset-bak，清空后其他表保留",
    " 注意：清空后需要重新运行迁移工具导入",
    "============================================================",
  ],
  "clear-playday.ask": "确定清空游戏库吗？输入 yes 继续",
  "clear-playday.cancelled": "已取消。",
  "clear-playday.err": "[失败] 清空未完成，请查看上方的错误信息。",
  "clear-playday.done": [
    "[完成] 目标库 games 表已清空。",
    "接着运行 migrate-playnite.bat 从 Playnite 导入即可。",
  ],

  // ---------- dev-CoverImages/golan.bat（游戏启动器，网吧玩家双击的那类）----------
  "golan.title": "王国重生-网吧联机版",
  "golan.menu": [
    "====================================================================================================",
    " 0、单人玩-单机游戏",
    " 1、联机玩-主机：多人游戏 -> 创建 -> 生成世界 -> 准备 -> 开始游戏。",
    " 2、联机玩-客机：多人游戏 -> 选择房间加入 -> 生成世界 -> 准备。",
    "====================================================================================================",
  ],
  "golan.running": "游戏运行中...",

  // ---------- sync-tags.bat ----------
  "sync-tags.header": [
    "============================================",
    " Playday 标签同步（临时权威 json -> 权威库）",
    " 来源   : D:\\AI\\games-web\\games_tags.json",
    " 权威库 : {1}",
    "============================================",
  ],
  "sync-tags.step-preview": "[标签同步] 第 1 步：预览（只看，不改库）",
  "sync-tags.err-preview": "[标签同步] 预览就失败了，同步终止。原因见上面。",
  "sync-tags.ask-apply": "是否真的同步到数据库？(输入 Y 回车确认，其它键取消)",
  "sync-tags.cancelled": "[标签同步] 已取消，数据库没有被改动。",
  "sync-tags.step-apply": "[标签同步] 第 2 步：真正同步到权威库（会先生成带时间戳的 .bak 备份）...",
  "sync-tags.err-apply": "[标签同步] 同步失败。原因见上面。",
  "sync-tags.done": [
    "[标签同步] 同步完成。旧库已备份到 {1}.bak-时间戳，",
    "           要回退就把对应的 .bak 复制回 library.db 覆盖。",
    "",
    "[标签同步] 提示：客户端下次启动会自动把权威库复制成运行时副本 library\\library.db。",
  ],

  // ---------- dev-tools/yungamestart/build.bat ----------
  "yungamestart.err-gxx": [
    "[出错] 找不到 g++（MinGW-w64），已中止。",
    "        装一份 MinGW-w64，或者把本文件里的 GXX 改成你机器上 g++.exe 的实际路径。",
  ],
  "yungamestart.compiler": "[提示] 用的编译器: {1}",
  "yungamestart.err-compile": "[出错] 编译失败，没产出 exe。原因见上面的编译器报错。",
  "yungamestart.ok": [
    "[完成] yungamestart.exe 已生成。",
    "        产物: dist\\yungamestart.exe，图标: dist\\1.ico、dist\\2.ico",
    "        下一步: 双击 deploy.bat（它会按 path-modes.json 把 dist\\* 复制到目标目录的 yungamestart\\）；",
    "                试用没问题后，再双击 promote.bat 升到正式机。",
  ],

  "sync-config.step-preview": "[1/3] 先预览：只列出会改哪些字段，不写任何文件...",
  "sync-config.step-write": "[2/3] 正在写 config.json（只有路径字段来自那张表，其它设置原样保留）...",
  "sync-config.step-verify": "[3/3] 正在核对这两个文件是否已经一致...",

  // ---------- dev-tools/GameSaveHelper/build.bat ----------
  "gamesavehelper.err-msvc": [
    "[出错] 找不到 MSVC（Visual Studio 的 C++ 编译器），已中止。",
    "        装一个 Visual Studio 2022 并勾上「使用 C++ 的桌面开发」，",
    "        或者把本文件里的 VCBASE 改成你机器上的实际路径。",
  ],
  "gamesavehelper.err-msvc-version": "[出错] 找到了 MSVC 目录，但里面读不出任何版本号，安装可能不完整（建议修复/重装 Visual Studio 的 C++ 组件）。",
  "gamesavehelper.err-sdk": "[出错] 找不到 Windows SDK 10，已中止。在 Visual Studio 安装器里勾上「Windows SDK」装一个即可。",
  "gamesavehelper.err-sdk-version": "[出错] 找到了 Windows SDK 目录，但 Include 下读不出任何版本号，安装可能不完整。",
  "gamesavehelper.toolchain": "[提示] 编译器版本: {1} ｜ Windows SDK: {2}",
  "gamesavehelper.step-resource": "  [1/3] 编译资源（图标、版本信息）...",
  "gamesavehelper.step-compile": "  [2/3] 编译 C++ 源码...",
  "gamesavehelper.step-link": "  [3/3] 链接成 exe...",
  "gamesavehelper.err-rc": "[出错] 编译资源失败（rc.exe 报错），已中止。原因见上面的报错信息。",
  "gamesavehelper.err-cl": "[出错] 编译源码失败（cl.exe 报错），已中止。原因见上面的报错信息。",
  "gamesavehelper.err-link": "[出错] 链接失败（link.exe 报错），已中止。原因见上面的报错信息。",
  "gamesavehelper.err-nsi": [
    "[出错] 缺少模板文件 {1}，已中止。",
    "        它会被编译进 exe，就是玩家解压时看到的那个说明窗口；少了它编不出来。",
  ],
  "gamesavehelper.ok": "[完成] 已生成 {1}（{2} 字节）",
  "gamesavehelper.err-no-exe": "[出错] 编译流程走完了，但没有产出 GameSaveHelper.exe。原因见上面。",

  // ---------- dev-client.bat ----------
  "dev.err-datadir": "[开发] 无法确定开发态数据目录，已中止（先检查 node 和 path-modes.json 的 dev 段）。",
  "dev.header": [
    "============================================",
    " Playday 客户端开发模式",
    " 数据目录: {1}",
    " Vite     : http://localhost:5173",
    "============================================",
  ],
  "dev.start-vite": "[开发] 启动 Vite 开发服务器...",
  "dev.compiling": "[开发] 编译主进程 (tsc -p tsconfig.main.json)...",
  "dev.err-compile": [
    "[开发] ***********************************************************",
    "[开发]  主进程编译失败，已中止启动（避免拿旧代码跑出假象）",
    "[开发]  错误详情见下面的 dev-client-build.log，文件也在仓库根目录",
    "[开发] ***********************************************************",
  ],
  "dev.compiled": "[开发] 主进程编译完成。",
  "dev.sync-config": "[开发] 同步 config.json (path-modes.json -> config.json)...",
  "dev.err-syncconfig": [
    "[开发] ***********************************************************",
    "[开发]  路径配置同步失败，已中止启动（config.json 与 path-modes.json 不一致）",
    "[开发]  宁可不开，也不要用旧路径跑出\"好像没问题\"的假象",
    "[开发] ***********************************************************",
  ],
  "dev.wait-vite": "[开发] 等待 Vite 就绪...",
  "dev.warn-vite-timeout": "[开发] 警告: Vite 没在预期时间内就绪，仍然尝试启动 Electron。",
  "dev.vite-ready": "[开发] Vite 已就绪。",
  "dev.start-electron": "[开发] 启动 Electron...",
  "dev.exited": [
    "[开发] Electron 已退出。Vite 开发服务器仍在后台运行。",
    "       要停掉它，双击 dev-stop.bat（或在任务管理器里结束 \"Playday Vite\" 窗口）。",
  ],

  // ---------- dev-stop.bat ----------
  "dev-stop.stopping": "[开发] 正在停止 Vite 开发服务器...",
  "dev-stop.done": "[开发] 已发送停止信号。若还有残留，可在任务管理器里手动结束。",

  // ---------- dev-tools/cover-optimizer/optimize-covers.bat ----------
  "covers.err-powershell": [
    "[出错] 找不到 Windows PowerShell 5.1（{1}）。",
    "        这个工具依赖 System.Drawing，只有 5.1 有；PowerShell 7 跑不了。",
  ],
};

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("用法：node scripts/bat-msg.mjs <key> [{1}] [{2}] ...");
  console.error("可用 key：" + Object.keys(MESSAGES).join("、"));
  process.exit(1);
}

// 只取第一个 key；其余参数按位置填进 {1} {2} ...
const [key, ...values] = argv;
const raw = MESSAGES[key];
if (raw === undefined) {
  console.error(`[bat-msg] 没有这个 key: ${key}（bat 里名字写错了？）`);
  process.exit(1);
}

// title.* 是"设窗口标题"，不打印任何东西。
// 为什么标题也走这里：`title Playday - 备份权威库` 这种同样写不进 .bat（多字节字符会
// 让 cmd 把行切错），而窗口标题恰恰是最该给用户看的"这是什么窗口"。
if (key.startsWith("title.")) {
  process.title = Array.isArray(raw) ? raw.join(" ") : raw;
  process.exit(0);
}

const fill = (line) =>
  line.replace(/\{(\d+)\}/g, (_m, n) => {
    const v = values[Number(n) - 1];
    return v === undefined ? "" : v;
  });

for (const line of Array.isArray(raw) ? raw : [raw]) console.log(fill(line));
