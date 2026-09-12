# -*- coding: utf-8 -*-
"""校验 _patch_*.json 是否符合规范。"""
import json, glob, os, re, sys

BASE = os.path.dirname(os.path.abspath(__file__))

def load(p):
    with open(p, "r", encoding="utf-8-sig") as f:
        return json.load(f)

def batch_names(path):
    names = []
    with open(path, "r", encoding="utf-8-sig") as f:
        for ln in f:
            ln = ln.rstrip("\n").rstrip("\r")
            if not ln.strip():
                continue
            parts = ln.split("|")
            if len(parts) >= 2:
                names.append(parts[1])
    return names

BAD_OPEN = ["这是一款", "本作是", "该作是", "本作", "该作", "《"]

report = []
total = 0
for pf in sorted(glob.glob(os.path.join(BASE, "_patch_*.json"))):
    tag = os.path.basename(pf)
    try:
        items = load(pf)
    except Exception as e:
        report.append(f"{tag} :: JSON 解析失败 {e}")
        continue
    num = re.search(r"_patch_(\d+)", tag).group(1)
    bf = os.path.join(BASE, f"_batch_{num}.txt")
    bnames = batch_names(bf)
    pnames = [it.get("name") for it in items]
    total += len(items)
    miss = [n for n in bnames if n not in pnames]
    extra = [n for n in pnames if n not in bnames]
    problems = []
    for it in items:
        n = it.get("name", "?")
        if set(it.keys()) != {"name", "intro", "region", "tags"}:
            problems.append(f"{n}:键异常{list(it.keys())}")
        intro = it.get("intro", "")
        if not intro:
            problems.append(f"{n}:intro空")
        else:
            if len(intro) < 40 or len(intro) > 200:
                problems.append(f"{n}:intro长度{len(intro)}")
            for b in BAD_OPEN:
                if intro.startswith(b):
                    problems.append(f"{n}:开头违规({b})")
        rg = it.get("region", "")
        if not rg:
            problems.append(f"{n}:region空")
        tg = it.get("tags", "")
        cnt = tg.count("#")
        if cnt < 5:
            problems.append(f"{n}:tags仅{cnt}个")
        if it.get("name", "") in tg:
            problems.append(f"{n}:tags含游戏名")
    report.append(f"{tag}: 条目{len(items)} / 批次{len(bnames)} / 缺{len(miss)} / 多{len(extra)} / 问题{len(problems)}")
    if miss: report.append("   缺:" + str(miss[:10]))
    if extra: report.append("   多:" + str(extra[:10]))
    if problems: report.append("   样本:" + " ; ".join(problems[:8]))

report.append("TOTAL PATCHED: %d / 1283" % total)
with open(os.path.join(BASE, "_validate.txt"), "w", encoding="utf-8", newline="\r\n") as f:
    f.write("\n".join(report))
print("ok")
