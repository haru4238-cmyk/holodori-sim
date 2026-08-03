# -*- coding: utf-8 -*-
"""スクレイピング結果を cards.json に統合する"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def fix_stats(stats):
    """Wiki誤記対策: 合計が内訳と大きく違う場合は内訳の和を優先"""
    if not stats:
        return None
    total = int(stats.get("total") or 0)
    perf = int(stats.get("perf") or 0)
    tech = int(stats.get("tech") or 0)
    sense = int(stats.get("sense") or 0)
    parts = perf + tech + sense
    if parts <= 0:
        return None
    # 合計が内訳の半分以下、または差が500超なら内訳の和を採用
    if total <= 0 or abs(total - parts) > 500:
        total = parts
    return {"total": total, "perf": perf, "tech": tech, "sense": sense}


def main():
    scraped = []
    for i in range(4):
        path = ROOT / f"scraped_batch_{i}.json"
        if not path.exists():
            print("MISSING", path)
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        print(path.name, len(data), "ok", sum(1 for x in data if x.get("ok")))
        scraped.extend(data)

    by_id = {}
    for row in scraped:
        if not row.get("ok"):
            continue
        by_id[row["id"]] = row

    cards = json.loads((ROOT / "cards.json").read_text(encoding="utf-8"))
    updated = 0
    fixed = []
    for c in cards:
        row = by_id.get(c["id"])
        if not row:
            continue
        new_stats = fix_stats(row.get("stats"))
        old = c.get("stats")
        if new_stats:
            if old and abs((old.get("total") or 0) - new_stats["total"]) > 500:
                fixed.append((c["id"], old, new_stats))
            c["stats"] = new_stats
            updated += 1
        if row.get("connect"):
            c["connect"] = row["connect"]
        if row.get("costume_skill"):
            c["costume_skill"] = row["costume_skill"]
        if row.get("special_skill"):
            c["special_skill"] = row["special_skill"]

    missing = [c["id"] for c in cards if not c.get("stats")]
    with_stats = sum(1 for c in cards if c.get("stats"))

    (ROOT / "cards.json").write_text(
        json.dumps(cards, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )

    meta = {
        "updated": updated,
        "with_stats": with_stats,
        "total_cards": len(cards),
        "missing": missing,
        "fixed_totals": [
            {"id": i, "old": o, "new": n} for i, o, n in fixed
        ],
        "source": "Gamerch hololive-dreams (2026-08-03 scrape)",
        "bloom_notes": {
            "stage1": "アクティブスキル強化（数値ステータスへの直接加算なし）",
            "stage2": "パラメータアップ（カード固有・公開%なし → アプリでは任意%を設定可能、初期+5%）",
            "stage3": "スペシャルスキル強化",
            "stage4": "パッシブスキル強化",
            "stage5_star3": "パラメータアップ（追加・任意%）",
            "stage5_star4plus": "コネクト効果強化（ボード計算側）",
        },
    }
    (ROOT / "scrape_report.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("updated", updated, "with_stats", with_stats, "/", len(cards))
    print("missing", missing)
    print("fixed", len(fixed))


if __name__ == "__main__":
    main()
