# -*- coding: utf-8 -*-
import re
import hashlib
import base64
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "index.html"
text = path.read_text(encoding="utf-8")
m = re.search(
    r'<script type="application/ld\+json">\r?\n(.*?)\r?\n</script>',
    text,
    re.S,
)
if not m:
    raise SystemExit("JSON-LD not found")
body = m.group(1).encode("utf-8")
h = base64.b64encode(hashlib.sha256(body).digest()).decode()
new_csp = f"sha256-{h}"
text2, n = re.subn(r"sha256-[A-Za-z0-9+/=]+", new_csp, text, count=1)
if n != 1:
    raise SystemExit(f"CSP replace failed n={n}")
path.write_text(text2, encoding="utf-8")
print("updated", new_csp)

for name in ("netlify.toml", "vercel.json"):
    p = root / name
    t = p.read_text(encoding="utf-8")
    t2, n = re.subn(r"sha256-[A-Za-z0-9+/=]+", new_csp, t)
    p.write_text(t2, encoding="utf-8")
    print(name, "replaced", n)
