# -*- coding: utf-8 -*-
"""cards.json を整理し、index_template.html に埋め込んで index.html を生成する"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def clean_card(c):
    out = dict(c)
    for key in ("connect", "costume_skill", "special_skill"):
        val = (out.get(key) or "").strip()
        if val in ("なし", "無", "-", "—"):
            val = ""
        if val:
            out[key] = val
        elif key in out:
            del out[key]
    return out


def main():
    cards = [clean_card(c) for c in json.loads((ROOT / "cards.json").read_text(encoding="utf-8"))]
    (ROOT / "cards.json").write_text(
        json.dumps(cards, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )

    members = sorted({c["name"] for c in cards}, key=lambda x: x)
    app_data = {
        "version": "2.0.0",
        "updated": "2026-08-03",
        "source": "Gamerch ホロドリ攻略Wiki",
        "cards": cards,
        "members": members,
        "bloom": {
            "stages": [
                {"stage": 1, "effect": "アクティブスキル強化", "stat": False},
                {"stage": 2, "effect": "パラメータアップ（カード固有）", "stat": True},
                {"stage": 3, "effect": "スペシャルスキル強化", "stat": False},
                {"stage": 4, "effect": "パッシブスキル強化", "stat": False},
                {
                    "stage": 5,
                    "effect": "★3はパラメータ追加 / ★4以上はコネクト強化",
                    "stat": "star3_only",
                },
            ],
            "defaultBonusPctAt2": 5,
            "defaultBonusPctAt5Star3": 5,
            "note": "開花のパラメータ上昇量はカードごとに異なり、攻略Wikiに一律%の公開がないため初期値は概算です。設定タブで変更できます。",
        },
        "boardGuide": {
            "red": "リーダー編成時のみ発動。主力リーダーの赤マスを優先。",
            "blue": "メンバー編成時に発動。よく使うメンバーの青マスを優先。",
            "green": "未編成でも常時。全員パラメータUPなど。全ホロメンで優先解放推奨。",
            "yellow": "未編成でも常時。楽曲ボーナスやホロワーク系。",
            "connect": "中央にカード配置で周囲マス効果を増幅。",
        },
    }
    (ROOT / "app_data.json").write_text(
        json.dumps(app_data, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )

    tpl_path = ROOT / "index_template.html"
    if not tpl_path.exists():
        raise SystemExit("index_template.html がありません")
    tpl = tpl_path.read_text(encoding="utf-8")
    if "__APP_DATA_JSON__" not in tpl:
        raise SystemExit("テンプレートに __APP_DATA_JSON__ がありません")
    embedded = json.dumps(app_data, ensure_ascii=False, separators=(",", ":"))
    out = tpl.replace("__APP_DATA_JSON__", embedded)
    (ROOT / "index.html").write_text(out, encoding="utf-8")
    print("cards", len(cards), "members", len(members))
    print("wrote cards.json, app_data.json, index.html", len(out), "bytes")


if __name__ == "__main__":
    main()
