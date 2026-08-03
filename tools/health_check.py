# -*- coding: utf-8 -*-
"""簡易健全性チェック（ブラウザなし）"""
import json
import hashlib
import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors = []
warns = []

d = json.loads((ROOT / "app_data.json").read_text(encoding="utf-8"))
cards = d["cards"]
ids = [c["id"] for c in cards]
if len(ids) != len(set(ids)):
    errors.append("カードID重複あり")

nostat = [c["id"] for c in cards if not c.get("stats")]
if nostat:
    errors.append(f"stats欠落: {len(nostat)}件")

bad_stats = []
for c in cards:
    s = c.get("stats") or {}
    if not s:
        continue
    parts = int(s.get("perf") or 0) + int(s.get("tech") or 0) + int(s.get("sense") or 0)
    tot = int(s.get("total") or 0)
    if abs(tot - parts) > 1:
        bad_stats.append((c["id"], tot, parts))
if bad_stats:
    warns.append(f"total≠内訳: {len(bad_stats)}件 例={bad_stats[:3]}")

names = {c["name"] for c in cards}
orphan = [m for m in (d.get("members") or []) if m not in names]
if orphan:
    warns.append(f"membersにカード無し名: {orphan}")

# スキル％取りこぼし簡易チェック
group = r"(?:ID[123]期生|[0-5]期生|Advent|Myth|Promise|ReGOSS|ReGLOSS|holoX|ゲーマーズ|ハッピータイプ|ピュアタイプ|キュートタイプ|ハッピー|ピュア|キュート)"
stat = r"(?:全パラメータ|パフォーマンス|テクニック|センス|スコアサポート(?:効果)?)"
re1 = re.compile(
    rf"(?:({group})が?)?(\d+)人(?:以上)?(?:で)?(?:({group})(\d+)人(?:以上)?の)?(全員|自身)?(?:の)?({stat})\s*が?\s*(\d+(?:\.\d+)?)\s*%(?:UP|アップ)?",
    re.I,
)
re2 = re.compile(rf"(全員|自身)の({stat})\s*が?\s*(\d+(?:\.\d+)?)\s*%(?:UP|アップ)?", re.I)
miss = []
for c in cards:
    for field in ("costume_skill", "passive_skill"):
        t = c.get(field) or ""
        if "%" not in t:
            continue
        if not re1.search(t) and not re2.search(t):
            miss.append((c["id"], field, t))
if miss:
    warns.append(f"スキル％未抽出の可能性: {len(miss)}件 例={miss[:3]}")

# CSP hash
html = (ROOT / "index.html").read_text(encoding="utf-8")
m = re.search(r'<script type="application/ld\+json">\n(.*?)\n</script>', html, re.S)
if not m:
    errors.append("JSON-LDブロック無し")
else:
    body = m.group(1).encode("utf-8")
    h = base64.b64encode(hashlib.sha256(body).digest()).decode()
    csp = re.search(r"sha256-([A-Za-z0-9+/=]+)", html)
    if not csp or csp.group(1) != h:
        errors.append(f"CSP hash不一致 expect={h} got={csp.group(1) if csp else None}")

# 必須ファイル
for rel in ["js/app.js", "js/data.js", "css/styles.css", "robots.txt", "sitemap.xml", "sw.js"]:
    if not (ROOT / rel).exists():
        errors.append(f"欠落ファイル: {rel}")

# data.js と app_data の version 一致
data_js = (ROOT / "js/data.js").read_text(encoding="utf-8")
if f'"version":"{d["version"]}"' not in data_js and f'"version": "{d["version"]}"' not in data_js:
    # compact form
    if f'"version":"{d["version"]}"' not in data_js.replace(" ", ""):
        warns.append("data.js の version が app_data と違う可能性")

print("ERRORS", len(errors))
for e in errors:
    print("E:", e)
print("WARNS", len(warns))
for w in warns:
    print("W:", w)
print("OK_CARDS", len(cards), "VERSION", d.get("version"))
