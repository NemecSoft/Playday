// 「整库 JSON」纯逻辑的"可执行说明"。
// 权威文档：docs/design/library-json.md。
// 这里钉住的关键性质是**幂等**——导出→不改→导入，库里的值必须逐字节不变；
// 一旦不幂等，表现是"我什么都没改，库却每次都被写一遍"（还可能把值越改越歪），
// 属于没人会立刻发现的那类问题。
import { describe, expect, it } from "vitest";
import {
  arrayColumnsOf,
  checkArrayColumns,
  dbValueToJson,
  diffRows,
  fileFingerprint,
  jsonValueToDb,
  localStamp,
  metaMatchesLibrary,
  missingKeysOf,
  rowToDb,
  rowToJson,
  searchRows,
  tableFileOf,
  tableOfFile,
  tableOfFilesIn,
  validateRows,
} from "./libraryJson.mjs";

const GAMES = {
  table: "games",
  columns: ["id", "name", "tags", "region", "playtime", "show_bat_console"],
  unique: ["name"],
};

describe("值转换：库 → JSON", () => {
  it("JSON 数组文本 → 真数组（tags / region / save_paths 这类列）", () => {
    expect(dbValueToJson('["休闲","生存"]')).toEqual(["休闲", "生存"]);
    expect(dbValueToJson("[]")).toEqual([]);
  });

  it("普通文本原样（哪怕里面有逗号 / 引号）", () => {
    expect(dbValueToJson("休闲,生存")).toBe("休闲,生存");
    expect(dbValueToJson('他说"你好"')).toBe('他说"你好"');
  });

  it("看着像数组但其实是坏 JSON → 原样保留，不当成空数组", () => {
    expect(dbValueToJson("[不是数组]")).toBe("[不是数组]");
  });

  it("对象数组照样解析成数组（actions / links 就是这种列，手改时也该是真数组）", () => {
    expect(dbValueToJson('[{"name":"开始游戏","path":"a.exe"}]')).toEqual([
      { name: "开始游戏", path: "a.exe" },
    ]);
    // 且同样幂等
    expect(jsonValueToDb(dbValueToJson('[{"name":"开始游戏"}]'))).toBe('[{"name":"开始游戏"}]');
  });

  it("数字 / null 原样（1 不折成 true —— show_bat_console 的 0/1 与 NULL 语义不同）", () => {
    expect(dbValueToJson(1)).toBe(1);
    expect(dbValueToJson(0)).toBe(0);
    expect(dbValueToJson(null)).toBeNull();
    expect(dbValueToJson(undefined)).toBeNull();
  });
});

describe("值转换：JSON → 库", () => {
  it("数组 → JSON 文本；布尔 → 1/0；null 保持 null", () => {
    expect(jsonValueToDb(["休闲"])).toBe('["休闲"]');
    expect(jsonValueToDb(true)).toBe(1);
    expect(jsonValueToDb(false)).toBe(0);
    expect(jsonValueToDb(null)).toBeNull();
    expect(jsonValueToDb(undefined)).toBeNull();
  });

  it("数字 / 文本原样", () => {
    expect(jsonValueToDb(128)).toBe(128);
    expect(jsonValueToDb("国产")).toBe("国产");
  });
});

describe("幂等：导出→不改→导入，值不变", () => {
  const dbValues = ['["休闲","生存"]', "[]", "国产", "", null, 1, 0, 128, '["A/B"]'];
  it("每个值往返一次都回到原样", () => {
    for (const v of dbValues) {
      expect(jsonValueToDb(dbValueToJson(v))).toBe(v);
    }
  });

  it("行级往返：列名与值都不变（库里没有的列补 null）", () => {
    const dbRow = { id: "g1", name: "30XX", tags: '["动作"]', playtime: 0 };
    const json = rowToJson(dbRow);
    expect(json).toEqual({ id: "g1", name: "30XX", tags: ["动作"], playtime: 0 });
    expect(rowToDb(json, GAMES.columns)).toEqual({
      id: "g1",
      name: "30XX",
      tags: '["动作"]',
      region: null,
      playtime: 0,
      show_bat_console: null,
    });
  });

  it("库里带空格的数组文本会被规范化（唯一允许的差异，无害）", () => {
    expect(jsonValueToDb(dbValueToJson('["a", "b"]'))).toBe('["a","b"]');
  });
});

describe("validateRows：手改时真会犯的错", () => {
  it("通过：正常一行", () => {
    expect(validateRows(GAMES, [{ id: "g1", name: "30XX" }])).toEqual([]);
  });

  it("顶层不是数组", () => {
    const p = validateRows(GAMES, { games: [] });
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("顶层必须是数组");
  });

  it("主键缺失/为空 → **不算错误**（权威库里本来就有这种空壳行，原样往返是保真的）", () => {
    expect(validateRows(GAMES, [{ name: "30XX" }])).toEqual([]);
    expect(validateRows(GAMES, [{ id: "  ", name: "30XX" }])).toEqual([]);
  });

  it("主键重复 → 指出是和第几行重复", () => {
    const p = validateRows(GAMES, [
      { id: "g1", name: "A" },
      { id: "g1", name: "B" },
    ]);
    expect(p[0]).toContain("与第 1 行重复");
  });

  it("列名拼错 → 拦下（最危险的一类：不报错，只是那列静默变 NULL）", () => {
    const p = validateRows(GAMES, [{ id: "g1", name: "A", savePath: ["x"] }]);
    expect(p[0]).toContain("savePath");
    expect(p[0]).toContain("不存在的列");
  });

  it("唯一列（games.name）重复 → 拦下，并说明是库上的唯一索引", () => {
    const p = validateRows(GAMES, [
      { id: "g1", name: "同名" },
      { id: "g2", name: "同名" },
    ]);
    expect(p[0]).toContain("唯一索引");
  });

  it("行不是对象", () => {
    expect(validateRows(GAMES, ["g1"])[0]).toContain("不是对象");
  });
});

describe("missingKeysOf：无主键行只提醒、不拦（用 name 说清是哪一行）", () => {
  it("报出第几行 + 游戏名（便于在 JSON 里搜到）", () => {
    const rows = [{ id: "g1", name: "A" }, { name: "大富翁11" }, { id: "", name: "C" }];
    expect(missingKeysOf(GAMES, rows)).toEqual([
      { index: 1, label: "「大富翁11」" },
      { index: 2, label: "「C」" },
    ]);
  });

  it("没有 name 就用占位文案；正常行不报", () => {
    expect(missingKeysOf(GAMES, [{ id: "g1", name: "A" }])).toEqual([]);
    expect(missingKeysOf(GAMES, [{ id: null, name: null }])[0].label).toContain("无名称");
  });
});

describe("diffRows：dry-run 的增 / 删 / 改", () => {
  const current = [
    { id: "g1", name: "A", tags: ["x"] },
    { id: "g2", name: "B", tags: [] },
    { id: "g3", name: "C", tags: [] },
  ];
  it("逐项计数（字段顺序不影响判定）", () => {
    const next = [
      { name: "A", tags: ["x"], id: "g1" }, // 一样，只是键顺序不同 → 不算改
      { id: "g2", name: "B", tags: ["z"] }, // 改了
      { id: "g4", name: "D", tags: [] }, // 新增
    ];
    expect(diffRows(GAMES, current, next)).toEqual({
      added: 1,
      removed: 1,
      changed: 1,
      unchanged: 1,
    });
  });

  it("无主键的行按「第几个无主键行」配对：内容没变就不算改（否则每次导出/回写都误报一条改动）", () => {
    const before = [{ id: "g1", name: "A" }, { id: null, name: "大富翁11" }];
    const same = [{ id: "g1", name: "A" }, { id: null, name: "大富翁11" }];
    expect(diffRows(GAMES, before, same)).toEqual({
      added: 0,
      removed: 0,
      changed: 0,
      unchanged: 2,
    });
    // 删掉那个空壳行 → 记 1 条删除
    expect(diffRows(GAMES, before, [before[0]]).removed).toBe(1);
  });
});

describe("数组列：手写成字符串会静默丢值，所以自动拦（不靠手写字段清单）", () => {
  it("arrayColumnsOf：导出时看哪一列出现过真数组", () => {
    expect(
      arrayColumnsOf([
        { id: "g1", tags: ["a"], note: "纯文本", region: [] },
        { id: "g2", tags: null },
      ]),
    ).toEqual(["region", "tags"]);
  });

  it("全为 NULL 的列不会被记（没有依据，也不该误报）", () => {
    expect(arrayColumnsOf([{ id: "g1", tags: null, note: "x" }])).toEqual([]);
  });

  it("checkArrayColumns：数组 / 空串 / JSON 数组文本都放行，普通字符串拦下", () => {
    const spec = { table: "games" };
    expect(checkArrayColumns(spec, [{ id: "g1", tags: ["a"] }], ["tags"])).toEqual([]);
    expect(checkArrayColumns(spec, [{ id: "g1", tags: "" }], ["tags"])).toEqual([]);
    expect(checkArrayColumns(spec, [{ id: "g1", tags: '["a"]' }], ["tags"])).toEqual([]); // 老写法
    const p = checkArrayColumns(spec, [{ id: "g1", tags: "休闲#生存" }], ["tags"]);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("当成空数组");
    expect(p[0]).toContain("第 1 行");
  });

  it("同一列写错多行也只报一次（看一条就知道怎么改）", () => {
    const p = checkArrayColumns(
      { table: "games" },
      [
        { id: "g1", tags: "x" },
        { id: "g2", tags: "y" },
      ],
      ["tags"],
    );
    expect(p).toHaveLength(1);
  });

  it("没有清单（老的 _meta.json）就不查，避免误报", () => {
    expect(checkArrayColumns({ table: "games" }, [{ id: "g1", tags: "x" }], [])).toEqual([]);
  });
});

describe("searchRows：在 12 万行的 games.json 里找游戏", () => {
  const rows = [
    { name: "消防模拟：火苗燃动-网吧联机版", id: "a1", game_id: "B25B5F82", tags: ["模拟", "联机"] },
    { name: "求生之路2-联机版", id: "b2", game_id: "ccc", tags: ["僵尸"] },
    { name: "灭火先锋-联机版", id: "c3", game_id: "ddd", tags: [] },
  ];

  it("按名字子串命中（名字带后缀也能搜到）", () => {
    const hit = searchRows(rows, "消防");
    expect(hit).toHaveLength(1);
    expect(hit[0].index).toBe(0);
    expect(hit[0].row.name).toContain("消防模拟");
  });

  it("按 id / game_id 命中，且大小写不敏感（子串即命中）", () => {
    expect(searchRows(rows, "b25b5f82")[0].index).toBe(0);
    expect(searchRows(rows, "B25B")[0].index).toBe(0);
    expect(searchRows(rows, "ddd")[0].index).toBe(2);
    expect(searchRows(rows, "c3")[0].index).toBe(2);
  });

  it("默认**不查** intro/其它字段（避免把提到同款玩法的游戏也带出来）", () => {
    const withIntro = [{ name: "别的游戏", id: "x", game_id: "y", intro: "里面有消防员" }];
    expect(searchRows(withIntro, "消防")).toEqual([]);
    expect(searchRows(withIntro, "消防", ["intro"])).toHaveLength(1);
  });

  it("数组字段（tags）要先拼成字符串再匹配，且必须显式列进 fields", () => {
    expect(searchRows(rows, "僵尸")).toEqual([]); // 默认字段不含 tags
    expect(searchRows(rows, "僵尸", ["tags"])[0].index).toBe(1);
  });

  it("空关键字不返回一堆（避免误当「列出全部」）", () => {
    expect(searchRows(rows, "   ")).toEqual([]);
    expect(searchRows(rows, undefined)).toEqual([]);
  });
});

describe("文件名 ↔ 表名", () => {
  it("表文件", () => {
    expect(tableFileOf("games")).toBe("games.json");
    expect(tableOfFile("games.json")).toBe("games");
    expect(tableOfFile("game_libraries.json")).toBe("game_libraries");
  });

  it("元数据与杂项文件不算表", () => {
    expect(tableOfFile("_meta.json")).toBeNull();
    expect(tableOfFile("_notes.json")).toBeNull();
    expect(tableOfFile("readme.md")).toBeNull();
  });

  it("目录里乱七八糟的文件不会混进来，且结果稳定有序", () => {
    expect(tableOfFilesIn(["_meta.json", "users.json", "readme.md", "games.json"])).toEqual([
      "games",
      "users",
    ]);
  });
});

describe("库指纹：拦住「拿旧导出回写」", () => {
  const stat = { size: 2146304, mtimeMs: 1758000000123.456 };
  const meta = {
    exportedAt: "2026-09-16T10:00:00.000Z",
    dbPath: "Admin/library.db",
    ...fileFingerprint(stat),
    tableRows: { games: 1285 },
  };

  it("导出后没动过库 → 一致（mtime 亚毫秒小数按毫秒取整比）", () => {
    expect(metaMatchesLibrary(meta, stat)).toBe(true);
    // NTFS 给的是 …123.456，JSON 往返后变整数 …123 —— 取整再比才不会被判成"库变了"
    expect(metaMatchesLibrary(meta, { size: stat.size, mtimeMs: 1758000000123 })).toBe(true);
  });

  it("库被改过（尺寸变了 / 时间变了）→ 不一致", () => {
    expect(metaMatchesLibrary(meta, { size: stat.size + 1, mtimeMs: stat.mtimeMs })).toBe(false);
    expect(metaMatchesLibrary(meta, { size: stat.size, mtimeMs: stat.mtimeMs + 5000 })).toBe(false);
  });

  it("没有元数据 → 一律算不一致（要 --force 才继续）", () => {
    expect(metaMatchesLibrary(null, stat)).toBe(false);
    expect(metaMatchesLibrary(undefined, stat)).toBe(false);
  });
});

describe("备份名：本地时间戳 YYYYMMDD-HHMMSS", () => {
  it("定宽补零（个位数月份/日/时/分/秒都要补）", () => {
    expect(localStamp(new Date(2026, 0, 5, 9, 8, 7))).toBe("20260105-090807");
  });

  it("用**本地时间**，不是 UTC（备份名要能在资源管理器里一眼认出来）", () => {
    const d = new Date(2026, 8, 16, 4, 30, 12); // 2026-09-16 04:30:12（本地）
    expect(localStamp(d)).toBe("20260916-043012");
    // 与 UTC 串对比：ISO 会因为时区差出「日期不同」，这正是要避免的看错
    if (d.getTimezoneOffset() !== 0) {
      expect(localStamp(d)).not.toBe(d.toISOString().slice(0, 19).replace(/[-T:]/g, ""));
    }
  });

  it("定宽 → 时间顺序 = 字典序（这样列目录时天然按时间排）", () => {
    const early = localStamp(new Date(2026, 8, 16, 9, 0, 0));
    const late = localStamp(new Date(2026, 8, 16, 10, 0, 0));
    expect(early < late).toBe(true);
    // 补零写错就会退化成 "20260916-90000" > "20260916-100000" 这种反序
    expect(localStamp(new Date(2026, 8, 16, 9, 0, 0))).toBe("20260916-090000");
  });
});
