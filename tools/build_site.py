# -*- coding: utf-8 -*-
"""サイト用データを生成する（cards.json → app_data.json）"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# 楽曲サンプル（攻略サイトの効率曲・練習曲を参考にした推奨フォーカス。スコア計算は概算）
SONGS = [
  {"id":"s001","name":"Shiny Smily Story (2022 ver.)","focusStat":"total","focusType":"","member":"","note":"初心者向け・代表曲","tags":["練習","オリジナル"]},
  {"id":"s002","name":"あすいろClearSky","focusStat":"total","focusType":"","member":"","note":"初心者向け","tags":["練習","オリジナル"]},
  {"id":"s003","name":"奏（かなで）","focusStat":"sense","focusType":"ピュア","member":"音乃瀬奏","note":"カバー・練習向け","tags":["練習","カバー"]},
  {"id":"s004","name":"再会","focusStat":"tech","focusType":"","member":"","note":"カバー・練習向け","tags":["練習","カバー"]},
  {"id":"s005","name":"失礼しますが、RIP♡","focusStat":"perf","focusType":"ピュア","member":"森カリオペ","note":"短尺・効率寄り","tags":["効率"]},
  {"id":"s006","name":"PSYCHO","focusStat":"tech","focusType":"ピュア","member":"ハコス・ベールズ","note":"短尺・効率寄り","tags":["効率"]},
  {"id":"s007","name":"美少女無罪♡パイレーツ","focusStat":"sense","focusType":"ハッピー","member":"宝鐘マリン","note":"短尺","tags":["効率"]},
  {"id":"s008","name":"Howling","focusStat":"cute","focusType":"キュート","member":"大神ミオ","note":"短尺","tags":["効率"]},
  {"id":"s009","name":"全力ジャンピング！","focusStat":"perf","focusType":"ハッピー","member":"不知火フレア","note":"短尺","tags":["効率"]},
  {"id":"s010","name":"宵の余、良い！","focusStat":"sense","focusType":"ピュア","member":"百鬼あやめ","note":"短尺","tags":["効率"]},
  {"id":"s011","name":"唱","focusStat":"tech","focusType":"ハッピー","member":"戌神ころね","note":"短尺","tags":["効率"]},
  {"id":"s012","name":"Daydream","focusStat":"tech","focusType":"キュート","member":"オーロ・クロニー","note":"短尺","tags":["効率"]},
  {"id":"s013","name":"スタースタースタート","focusStat":"sense","focusType":"キュート","member":"ときのそら","note":"ソロ曲","tags":["ソロ"]},
  {"id":"s014","name":"鬼ノ宴","focusStat":"perf","focusType":"ハッピー","member":"ロボ子さん","note":"ソロ曲","tags":["ソロ"]},
  {"id":"s015","name":"Capture the Moment","focusStat":"total","focusType":"","member":"","note":"オリジナル","tags":["オリジナル"]},
  {"id":"s016","name":"Color Rise Harmony","focusStat":"total","focusType":"","member":"","note":"オリジナル","tags":["オリジナル"]},
  {"id":"s017","name":"Our Bright Parade","focusStat":"total","focusType":"","member":"","note":"オリジナル","tags":["オリジナル"]},
  {"id":"s018","name":"Prism Melody","focusStat":"sense","focusType":"","member":"","note":"オリジナル","tags":["オリジナル"]},
]


from update_holomem_order import HOLOMEM_ORDER


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


def build_holomem_order(members):
    known = set(HOLOMEM_ORDER)
    extra = sorted([m for m in members if m not in known], key=lambda x: x)
    return [m for m in HOLOMEM_ORDER if m in set(members)] + extra


def main():
    cards = [clean_card(c) for c in json.loads((ROOT / "cards.json").read_text(encoding="utf-8"))]
    (ROOT / "cards.json").write_text(json.dumps(cards, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    member_set = {c["name"] for c in cards}
    members = build_holomem_order(member_set)

    # Howling focusStat typo fix - should be sense or total not "cute"
    for s in SONGS:
        if s["focusStat"] not in ("total", "perf", "tech", "sense"):
            s["focusStat"] = "total"

    app_data = {
        "version": "3.4.0",
        "updated": "2026-08-04",
        "source": "Gamerch ホロドリ攻略Wiki（カード）/ ボードはユーザー登録共有 / 編成はスキルシナジー概算",
        "cards": cards,
        "members": members,
        "holomemOrder": members,
        "sortOptions": {
            "register": ["rarity", "holomem", "perf", "tech", "sense"],
            "owned": ["level", "rarity", "holomem", "perf", "tech", "sense"],
            "labels": {
                "level": "レベル",
                "rarity": "レアリティ",
                "holomem": "ホロメン順",
                "perf": "パフォーマンス",
                "tech": "テクニック",
                "sense": "センス",
            },
        },
        "songs": SONGS,
        "bloom": {
            "stages": [
                {"stage": 1, "effect": "アクティブスキル強化", "stat": False},
                {"stage": 2, "effect": "パラメータアップ（カード固有）", "stat": True},
                {"stage": 3, "effect": "スペシャルスキル強化", "stat": False},
                {"stage": 4, "effect": "パッシブスキル強化", "stat": False},
                {"stage": 5, "effect": "★3はパラメータ追加 / ★4以上はコネクト強化", "stat": "star3_only"},
            ],
            "defaultBonusPctAt2": 5,
            "defaultBonusPctAt5Star3": 5,
            "note": "開花のパラメータ上昇量はカードごとに異なり、攻略Wikiに一律%の公開がないため初期値は概算です。設定タブで変更できます。",
        },
        "boardGuide": {
            "任意": "ボードはやらなくてもOK。正確な全マス図データが未公開のため、推測図は出しません。",
            "みんな登録": "実機を見て赤/青/緑/黄の効果%や配置メモを登録。「ボード共有JSON」で友達とマージできます（サーバ送信なし）。",
            "unlock": "実機では初期地点から隣接マスへ順に解放。先の区画はドリームランクで開く。リセット可（ゲーム内はホロゴールド）。",
            "red": "リーダー時のみ発動。主力リーダーは赤を優先。",
            "blue": "メンバー時に発動。よく使うメンバーは青を優先。",
            "green": "未編成でも常時。全員パラメータUPなど。緑は全ホロメン合算で編成に反映。",
            "yellow": "未編成でも常時。ソロ楽曲スコア等。編成パラメータ計算には入れない。",
            "connect": "★4以上を1枚設置。同じカードは他ボードに置けない。範囲図は推測で出さない（カード文言のみ表示）。",
        },
        "security": {
            "storage": "localStorage only",
            "network": "same-origin static assets only (optional font CDN disabled by default)",
            "importLimitBytes": 1500000,
        },
    }
    (ROOT / "app_data.json").write_text(json.dumps(app_data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    # file:// でも動くよう JS 埋め込みも生成
    (ROOT / "js" / "data.js").write_text(
        "window.__APP_DATA__ = "
        + json.dumps(app_data, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print("wrote app_data.json", len(cards), "cards", len(SONGS), "songs")
    print("wrote js/data.js")


if __name__ == "__main__":
    main()
