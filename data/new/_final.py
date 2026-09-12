# -*- coding: utf-8 -*-
"""最终核对：新文件 vs 原文件。gameid/name/gamelevel 必须逐字一致；三字段必须非空。"""
import json, os, collections

BASE = os.path.dirname(os.path.abspath(__file__))
old = json.load(open(os.path.join(BASE, "game-content.json"), encoding="utf-8"))
new = json.load(open(os.path.join(BASE, "game-content-new.json"), encoding="utf-8"))

R = []
R.append("旧条目 %d / 新条目 %d" % (len(old), len(new)))
bad = []
for i, (a, b) in enumerate(zip(old, new)):
    for k in ("gameid", "name", "gamelevel"):
        if a.get(k) != b.get(k):
            bad.append((i, k, a.get(k), b.get(k)))
R.append("gameid/name/gamelevel 不一致数: %d" % len(bad))
if bad:
    R.append(str(bad[:10]))

empty = [b["name"] for b in new if not b["intro"] or not b["region"] or not b["tags"]]
R.append("三字段有空值的条目: %d" % len(empty))
if empty:
    R.append(str(empty[:20]))

short = [b["name"] for b in new if len(b["intro"]) < 40]
R.append("intro 短于40字: %d %s" % (len(short), short[:10]))

c = collections.Counter(b["region"] for b in new)
R.append("")
R.append("=== 地区分布 Top 30 ===")
for k, v in c.most_common(30):
    R.append("%s\t%d" % (k, v))
R.append("")
R.append("=== 出现1次及以下的地区 ===")
R.append(", ".join("%s(%d)" % (k, v) for k, v in c.items() if v <= 2))
R.append("")
R.append("地区种类数: %d" % len(c))

with open(os.path.join(BASE, "_final_check.txt"), "w", encoding="utf-8", newline="\r\n") as f:
    f.write("\n".join(R))
print("ok")
