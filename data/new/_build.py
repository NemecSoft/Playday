# -*- coding: utf-8 -*-
"""
Playday 游戏内容重建脚本
--------------------------------------------------
用途：读取原始 game-content.json，套用补丁文件（_patch_*.json），
      生成格式一致的新文件 game-content-new.json。

约定：
  - gameid / name / gamelevel 三个字段原样复制，绝不改动。
  - 只覆盖 intro / region / tags 三个字段。
  - 未被任何补丁命中的条目，保留原值（不删除、不新增条目）。
  - 输出统一 2 空格缩进、UTF-8、CRLF 行尾（Windows 约定）。

补丁文件格式（可多个）：
  [{"name": "游戏名", "intro": "...", "region": "...", "tags": "..."}, ...]
"""
import json
import glob
import os

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "game-content.json")
OUT = os.path.join(BASE, "game-content-new.json")
KEYS = ["gameid", "name", "intro", "region", "tags", "gamelevel"]


def load(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    games = load(SRC)

    patches = {}
    files = sorted(glob.glob(os.path.join(BASE, "_patch_*.json")))
    for p in files:
        try:
            items = load(p)
        except Exception as e:
            print("!! patch parse failed:", p, e)
            continue
        for it in items:
            patches[it["name"]] = it

    hit = 0
    for g in games:
        p = patches.get(g["name"])
        if p:
            g["intro"] = p.get("intro", g["intro"])
            g["region"] = p.get("region", g["region"])
            g["tags"] = p.get("tags", g["tags"])
            hit += 1

    names = {g["name"] for g in games}
    missing = [n for n in patches if n not in names]

    out = [{k: g.get(k, "") for k in KEYS} for g in games]

    with open(OUT, "w", encoding="utf-8", newline="\r\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print("patches:", len(patches), "from", len(files), "files")
    print("written:", OUT, "| games:", len(games), "| patched:", hit)
    if missing:
        print("!! unmatched patch names:", len(missing), missing[:20])


if __name__ == "__main__":
    main()
