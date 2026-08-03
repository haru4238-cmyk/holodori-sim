# -*- coding: utf-8 -*-
"""ゲーム内のホロメン順に近い並び（期生・所属の公式寄り）"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

# ホロドリ／ホロライブの一般的なメンバー並び（卒業生は未収録想定で省略）
HOLOMEM_ORDER = [
    # 0期生
    "ときのそら", "ロボ子さん", "AZKi", "さくらみこ", "星街すいせい",
    # 1期生
    "アキ・ローゼンタール", "赤井はあと", "白上フブキ", "夏色まつり",
    # 2期生
    "百鬼あやめ", "癒月ちょこ", "大空スバル",
    # ゲーマーズ
    "大神ミオ", "猫又おかゆ", "戌神ころね",
    # 3期生
    "兎田ぺこら", "不知火フレア", "白銀ノエル", "宝鐘マリン",
    # 4期生
    "角巻わため", "常闇トワ", "姫森ルーナ",
    # 5期生
    "雪花ラミィ", "桃鈴ねね", "獅白ぼたん", "尾丸ポルカ",
    # holoX
    "ラプラス・ダークネス", "鷹嶺ルイ", "博衣こより", "風真いろは",
    # ReGLOSS
    "音乃瀬奏", "一条莉々華", "儒烏風亭らでん", "轟はじめ",
    # Myth
    "森カリオペ", "小鳥遊キアラ", "一伊那尓栖",
    # Promise
    "IRyS", "オーロ・クロニー", "ハコス・ベールズ",
    # Advent
    "シオリ・ノヴェラ", "古石ビジュー", "ネリッサ・レイヴンクロフト",
    "フワワ・アビスガード", "モココ・アビスガード",
    # ID 1
    "アユンダ・リス", "ムーナ・ホシノヴァ", "アイラニ・イオフィフティーン",
    # ID 2
    "クレイジー・オリー", "アーニャ・メルフィッサ", "パヴォリア・レイネ",
    # ID 3
    "ベスティア・ゼータ", "カエラ・コヴァルスキア", "こぼ・かなえる",
]


def main():
    data = json.loads((ROOT / "app_data.json").read_text(encoding="utf-8"))
    members = data.get("members") or []
    # データにあるのに順リストに無い人は末尾へ（五十音）
    known = set(HOLOMEM_ORDER)
    extra = sorted([m for m in members if m not in known], key=lambda x: x)
    order = [m for m in HOLOMEM_ORDER if m in set(members)] + extra
    data["holomemOrder"] = order
    data["sortOptions"] = {
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
    }
    (ROOT / "app_data.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    (ROOT / "js" / "data.js").write_text(
        "window.__APP_DATA__ = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print("holomemOrder", len(order), "extra", extra)


if __name__ == "__main__":
    main()
