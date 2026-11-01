"""Generate PWA icons for Stapel Flex from a simple plate-stack glyph."""
from PIL import Image, ImageDraw, ImageFont

BG = (23, 24, 26, 255)       # --bg
ACCENT = (199, 125, 160, 255)  # --accent (Flex)
TEXT = (240, 236, 228, 255)  # --text

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def draw_plates(size, margin_ratio, bg=BG, transparent_bg=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0) if transparent_bg else bg)
    d = ImageDraw.Draw(img)

    margin = int(size * margin_ratio)
    inner = size - 2 * margin

    bar_h = max(2, int(size * 0.05))
    bar_y = size // 2 - bar_h // 2
    d.rounded_rectangle(
        [margin, bar_y, size - margin, bar_y + bar_h],
        radius=bar_h // 2,
        fill=TEXT,
    )

    plate_w = int(inner * 0.16)
    plate_h = int(inner * 0.62)
    gap = int(inner * 0.045)

    positions = [-1.5, -0.5, 0.5, 1.5]
    cx = size / 2
    cy = size / 2
    for i, p in enumerate(positions):
        x_center = cx + p * (plate_w + gap)
        x0 = x_center - plate_w / 2
        x1 = x_center + plate_w / 2
        y0 = cy - plate_h / 2
        y1 = cy + plate_h / 2
        radius = plate_w * 0.35
        d.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=ACCENT)

    return img


def save_icon(size, path, maskable=False):
    margin_ratio = 0.22 if maskable else 0.14
    img = draw_plates(size, margin_ratio)
    img.save(path, "PNG")


def save_favicon(path):
    img = draw_plates(64, 0.12)
    img.save(path, "PNG")


if __name__ == "__main__":
    save_icon(192, "icons/icon-192.png")
    save_icon(512, "icons/icon-512.png")
    save_icon(192, "icons/icon-maskable-192.png", maskable=True)
    save_icon(512, "icons/icon-maskable-512.png", maskable=True)
    save_icon(180, "icons/apple-touch-icon.png")
    save_favicon("icons/favicon.png")
    print("done")
