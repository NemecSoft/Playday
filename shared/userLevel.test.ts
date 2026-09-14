// 用户等级检测的单测：加解密往返、命中/未命中、黄金/钻石、覆盖开关。
// 对照文档：docs/design/user-level-detection.md

import { describe, it, expect } from "vitest";
import {
  parseUserListRaw,
  parseServerStatusRaw,
  resolveMaintenance,
  resolveUserLevel,
  xorBase64,
  canPlay,
  YUNGAME_USERLIST_KEY,
  type YunGameUser,
} from "./userLevel";

const LIST = [
  { UserId: "1", UserAccount: "a", UserName: "钻石网吧", UserIpAddress: "125.72.52.124", UserLevel: 2 },
  { UserId: "2", UserAccount: "b", UserName: "黄金网吧", UserIpAddress: "125.72.52.123", UserLevel: 1 },
];
const PLAIN = JSON.stringify(LIST);

function rec(over: Partial<YunGameUser> = {}): YunGameUser {
  return { userId: "1", account: "a", name: "某网吧", ipAddress: "1.2.3.4", level: 2, ...over };
}

describe("用户表解析：明文与密文都要能吃", () => {
  it("明文直接解析（实测用户给的就是明文）", () => {
    const r = parseUserListRaw(PLAIN);
    expect(r).toHaveLength(2);
    expect(r[0].ipAddress).toBe("125.72.52.124");
    expect(r[0].level).toBe(2);
    expect(r[1].name).toBe("黄金网吧");
  });

  it("密文（原版 base64+XOR）能解回同一份内容", () => {
    const cipher = xorBase64(PLAIN);
    expect(cipher.startsWith("[")).toBe(false); // 确认它真的不是明文
    expect(parseUserListRaw(cipher)).toEqual(parseUserListRaw(PLAIN));
  });

  it("XOR 是对称的：解一次加密结果 = 原文", () => {
    const cipher = xorBase64("hello 网吧");
    const bytes = Buffer.from(cipher, "base64");
    const key = Buffer.from(YUNGAME_USERLIST_KEY, "utf8");
    for (let i = 0; i < bytes.length; i++) bytes[i] ^= key[i % key.length];
    expect(bytes.toString("utf8")).toBe("hello 网吧");
  });

  it("兼容下划线的字段名，并丢掉没有 IP 的记录", () => {
    const r = parseUserListRaw(
      JSON.stringify([
        { user_id: "9", user_name: "X", user_ip_address: "10.0.0.1", user_level: 1 },
        { UserId: "10", UserName: "无IP", UserIpAddress: "", UserLevel: 2 },
      ]),
    );
    expect(r).toHaveLength(1);
    expect(r[0].userId).toBe("9");
  });

  it("空内容返回空数组；坏内容抛错（不静默吞掉）", () => {
    expect(parseUserListRaw("")).toEqual([]);
    expect(() => parseUserListRaw("这不是JSON也不是base64!!")).toThrow();
  });
});

describe("resolveUserLevel：黄金 / 钻石判定", () => {
  it("命中且 UserLevel=2 → 钻石(2)", () => {
    const r = resolveUserLevel([rec()], ["1.2.3.4"]);
    expect(r).toMatchObject({ level: 2, matched: true, source: "userlist", cafeName: "某网吧" });
  });

  it("命中但 UserLevel=1 → 黄金(1)", () => {
    const r = resolveUserLevel([rec({ level: 1 })], ["1.2.3.4"]);
    expect(r).toMatchObject({ level: 1, matched: true, source: "userlist" });
  });

  it("命中但 UserLevel 是脏值（3 / 0）→ 仍然黄金(1)（只有 2 才算钻石）", () => {
    expect(resolveUserLevel([rec({ level: 3 })], ["1.2.3.4"]).level).toBe(1);
    expect(resolveUserLevel([rec({ level: 0 })], ["1.2.3.4"]).level).toBe(1);
  });

  it("未命中 → 黄金(1)（不再是从前的'游客全权限'）", () => {
    const r = resolveUserLevel([rec()], ["9.9.9.9"]);
    expect(r).toMatchObject({ level: 1, matched: false, source: "fallback", cafeName: "" });
  });

  it("空名单 → 黄金(1)", () => {
    expect(resolveUserLevel([], ["1.2.3.4"]).level).toBe(1);
  });

  it("IP 前后空格/多个候选 IP 都能匹配（公网在前、内网兜底交给调用方排序）", () => {
    const r = resolveUserLevel([rec({ ipAddress: "125.72.52.124" })], ["", " 125.72.52.124 ", "192.168.1.2"]);
    expect(r.matched).toBe(true);
  });
});

// 注：这里曾经有两条"等级覆盖开关（override）"的用例，随该后门一起删掉了（2026-09-14 用户要求）——
// 本机自测改成"把本机 IP 写进用户表"，所以优先级只剩下：用户表 > 个人会话 > 黄金。
describe("优先级：用户表 > 个人会话 > 黄金（没有覆盖开关）", () => {
  it("用户表命中优先于个人会话等级", () => {
    const r = resolveUserLevel([rec({ level: 1 })], ["1.2.3.4"], { personalLevel: 3 });
    expect(r).toMatchObject({ level: 1, source: "userlist" });
  });

  it("未命中时用个人会话等级（排障提权用）", () => {
    expect(resolveUserLevel([], ["9.9.9.9"], { personalLevel: 3 })).toMatchObject({
      level: 3,
      source: "personal",
    });
    expect(resolveUserLevel([], ["9.9.9.9"], { personalLevel: 1 }).level).toBe(1);
  });
});

describe("维护状态（YunGame_ServerStatus.json）", () => {
  const STATUS = JSON.stringify([
    { UserLevel: 1, Status: 1 },
    { UserLevel: 2, Status: 0 },
  ]);

  it("Status=0 的等级 = 维护中；其它等级不受影响（黄金维护时钻石照常营业）", () => {
    const r = parseServerStatusRaw(STATUS);
    expect(resolveMaintenance(r, 1)).toMatchObject({ maintenance: false, status: 1, level: 1 });
    expect(resolveMaintenance(r, 2)).toMatchObject({ maintenance: true, status: 0, level: 2 });
  });

  it("与用户表同一套加密：密文也能解", () => {
    expect(parseServerStatusRaw(xorBase64(STATUS))).toEqual(parseServerStatusRaw(STATUS));
  });

  it("只认显式 0：Status=1 / 缺字段 / 找不到该等级 / 空表 → 都算正常营业", () => {
    expect(parseServerStatusRaw(JSON.stringify([{ UserLevel: 1, Status: 1 }]))[0].status).toBe(1);
    // 缺 Status 时默认 1（正常），不能因为漏写字段就把人锁在门外
    const noStatus = parseServerStatusRaw(JSON.stringify([{ UserLevel: 3 }]));
    expect(resolveMaintenance(noStatus, 3).maintenance).toBe(false);
    // 该等级没有配置行（如覆盖开关设成 3）→ 正常
    expect(resolveMaintenance(parseServerStatusRaw(STATUS), 3).maintenance).toBe(false);
    expect(resolveMaintenance([], 1)).toMatchObject({ maintenance: false, status: null });
  });

  it("空内容返回空数组；坏内容抛错", () => {
    expect(parseServerStatusRaw("")).toEqual([]);
    expect(() => parseServerStatusRaw("不是JSON也不是base64!!")).toThrow();
  });
});

describe("canPlay：唯一判定函数", () => {
  it("用户等级 >= 游戏等级才可玩", () => {
    expect(canPlay(2, 2)).toBe(true);
    expect(canPlay(2, 1)).toBe(true);
    expect(canPlay(1, 2)).toBe(false);
    expect(canPlay(3, 3)).toBe(true);
  });

  it("脏值一律按 0 处理（宁可锁住，也不误放行）", () => {
    expect(canPlay(Number.NaN, 1)).toBe(false);
    expect(canPlay(1, Number.NaN)).toBe(true); // gameLevel 缺失 = 0 = 人人可玩
  });
});
