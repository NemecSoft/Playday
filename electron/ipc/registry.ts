// IPC 命令注册的中间件层（借鉴 deepseek-harness 的 hook 桥思路）。
//
// 目的：把散落在各个 handler 里的重复样板代码收敛到一处，让每个业务 handler
// 只写"真正要做的事"，不重复处理下面三件事：
//   1. 参数解包：兼容"Electron spread 风格（直接传值）"和"Tauri 对象包装风格
//      （传 { 字段: 值 }）"。前端统一用对象包装调用，但偶尔有 spread 调用，
//      以前每个 handler 都要手写 typeof 判断，容易写错漏（covers.ts 破图 bug 的根因）。
//   2. 错误归一化：以前不少 handler 用 try/catch 把异常吞成 null/undefined，
//      导致前端拿到破图/空数据却不知道真实原因。这里统一 catch，把真正的
//      异常抛给前端（Electron 会 reject、Web fetch 会走错误分支）。
//   3. 可选切面：日志计时、权限门槛，可在此统一加，不用改每个 handler。
//
// 注意：这里只处理"真正的异常"，业务上"合法返回 null"（比如图片不存在）仍由
// handler 自己 return null，不拦截。

import { ipcMain } from "electron";

// 参数解包规则：
//   - none   ：不接收参数（或参数忽略），handler 无参
//   - spread ：参数本来就是业务值（单个值），直接透传给 handler
//   - object ：参数是 { 字段: 值 } 包装对象，透传给 handler，由 handler 自己取字段
//   - auto   ：兼容"单个值"或"对象包装"两种风格（最常用），
//              通过 `field` 字段声明"对象包装时该字段叫什么"
export type UnwrapMode = "none" | "spread" | "object" | "auto";

export interface RegisterOptions {
  // 参数解包方式，默认 "auto"
  unwrap?: UnwrapMode;
  // 对象包装时的字段名（仅 unwrap 为 "auto" 或 "object" 时用到，供 handler 取参）
  field?: string;
  // 需要登录才能调用（可选切面，先预留，默认不校验）
  requireUser?: boolean;
  // 打印调用耗时日志（可选切面，默认关）
  log?: boolean;
}

// 统一的 handler 类型：入参是"解包后"的原始值或对象，返回任意结果。
type CommandHandler<A = unknown, R = unknown> = (args: A) => R | Promise<R>;

// 自动解包：兼容"直接传单值"和"传 { field }"两种风格。
// 例：registerCommand(ipc, "get_game", { field: "id" }, ({ id }) => ...)
//   调用 spread 风格时 arg 是字符串 → 返回 { id: 字符串 }
//   调用对象包装时 arg 是 { id } → 原样返回 { id }
function unwrapArgs(arg: unknown, second: unknown, opts: RegisterOptions): unknown {
  const mode = opts.unwrap ?? "auto";
  if (mode === "none") return undefined;
  if (mode === "spread") return arg;
  if (mode === "object") return arg ?? {};
  // auto：先看是否是对象包装（非空对象且含 field 字段）
  const field = opts.field;
  if (field) {
    if (arg && typeof arg === "object" && field in arg) {
      // 已是对象包装，直接返回原对象
      return arg;
    }
    // 是 spread 单值（或 second 参数），包装成 { field: 值 }
    const wrapped: Record<string, unknown> = {};
    wrapped[field] = arg ?? second;
    return wrapped;
  }
  // 没有声明 field，无法自动区分，原样透传
  return arg;
}

// 注册一个带中间件能力的 IPC 命令。
// handler 收到的是"解包后的参数对象/值"，直接使用即可，不用再写 typeof 判断。
export function registerCommand<A = unknown, R = unknown>(
  ipc: typeof ipcMain,
  name: string,
  handler: CommandHandler<A, R>,
  opts: RegisterOptions = {}
) {
  ipc.handle(name, async (_e, arg: unknown, second?: unknown) => {
    const start = opts.log ? Date.now() : 0;
    try {
      // 可选：权限门槛（先预留，后续如需按等级拦截可在此统一加）
      // if (opts.requireUser && !isLoggedIn()) throw new Error("未登录");
      const args = unwrapArgs(arg, second, opts);
      const result = await (handler as CommandHandler)(args as A);
      if (opts.log) {
        console.log(`[ipc] ${name} 完成，耗时 ${Date.now() - start}ms`);
      }
      return result;
    } catch (e) {
      // 统一错误归一化：把真正的异常抛给前端，而不是吞掉。
      // 前端会收到 reject 的 Error（桌面端）或 HTTP 错误（Web 端）。
      console.error(`[ipc] ${name} 执行失败:`, e);
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(message);
    }
  });
}
