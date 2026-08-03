# -*- coding: utf-8 -*-
"""スキル取得結果を cards.json / app_data / data.js に統合"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL_KEYS = ("special_skill", "active_skill", "passive_skill", "costume_skill", "connect")


def clean(val):
    v = (val or "").strip()
    if v in ("なし", "無", "-", "—", "ー"):
        return ""
    return v


def main():
    by_id = {}
    for i in range(4):
        path = ROOT / "tools" / f"skills_batch_{i}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        print(path.name, len(data), "ok", sum(1 for x in data if x.get("ok")))
        for row in data:
            if row.get("ok"):
                by_id[row["id"]] = row

    cards = json.loads((ROOT / "cards.json").read_text(encoding="utf-8"))
    updated = 0
    for c in cards:
        row = by_id.get(c["id"])
        if not row:
            continue
        for k in SKILL_KEYS:
            v = clean(row.get(k))
            if v:
                c[k] = v
            elif k in c:
                del c[k]
        updated += 1

    (ROOT / "cards.json").write_text(
        json.dumps(cards, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print("updated", updated)
    print("coverage", {k: sum(1 for c in cards if c.get(k)) for k in SKILL_KEYS})

    sys.path.insert(0, str(ROOT / "tools"))
    import build_site
    build_site.main()


if __name__ == "__main__":
    main()
