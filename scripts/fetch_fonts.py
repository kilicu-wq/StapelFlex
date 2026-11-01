"""Download only the 'latin' subset of the fonts used by Stapel and
write a self-hosted fonts.css so the app has zero external font
dependencies (required for full offline PWA support).
"""
import re
import urllib.request
from pathlib import Path

GOOGLE_CSS_URL = (
    "https://fonts.googleapis.com/css2?"
    "family=Oswald:wght@500;600;700"
    "&family=Inter:wght@400;500;600;700"
    "&family=JetBrains+Mono:wght@500;700"
    "&display=swap"
)
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

OUT_DIR = Path("fonts")
OUT_DIR.mkdir(exist_ok=True)

req = urllib.request.Request(GOOGLE_CSS_URL, headers={"User-Agent": UA})
css = urllib.request.urlopen(req).read().decode("utf-8")

blocks = re.findall(
    r"/\*\s*latin\s*\*/\s*(@font-face\s*\{[^}]*\})", css
)

name_map = {"Oswald": "oswald", "Inter": "inter", "JetBrains Mono": "jetbrains-mono"}

local_css = []
for block in blocks:
    family = re.search(r"font-family:\s*'([^']+)'", block).group(1)
    weight = re.search(r"font-weight:\s*(\d+)", block).group(1)
    url = re.search(r"url\(([^)]+)\)", block).group(1)
    slug = name_map[family]
    filename = f"{slug}-{weight}.woff2"
    dest = OUT_DIR / filename
    urllib.request.urlretrieve(url, dest)
    local_css.append(
        "@font-face {\n"
        f"  font-family: '{family}';\n"
        "  font-style: normal;\n"
        f"  font-weight: {weight};\n"
        "  font-display: swap;\n"
        f"  src: url('../fonts/{filename}') format('woff2');\n"
        "}"
    )
    print("downloaded", dest)

(Path("css") / "fonts.css").write_text("\n".join(local_css) + "\n")
print("wrote css/fonts.css")
