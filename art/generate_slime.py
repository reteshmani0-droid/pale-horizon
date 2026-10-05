"""Procedural pixel art generator — draws a 16x16 slime sprite.

Run:  python3 art/generate_slime.py
Out:  art/slime.png (native 16x16), art/slime_preview.png (8x, nearest-neighbor)
"""
from pathlib import Path

from PIL import Image

SIZE = 16
SCALE = 8

OUTLINE = (26, 62, 41, 255)
BODY = (94, 196, 79, 255)
SHADOW = (56, 148, 66, 255)
HIGHLIGHT = (191, 250, 174, 255)
EYE = (24, 34, 28, 255)
MOUTH = (34, 84, 52, 255)


def build() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = img.load()

    # Dome body: ellipse slice, flattened at the bottom row.
    cx, cy, rx, ry = 7.5, 14.0, 7.0, 10.0
    body = set()
    for y in range(4, SIZE):
        t = (y - cy) / ry
        if abs(t) > 1:
            continue
        half = rx * (1 - t * t) ** 0.5
        for x in range(SIZE):
            if abs(x - cx) <= half + 0.35:
                body.add((x, y))

    # Shadow band near the bottom, highlight blob top-left.
    shadow = {p for p in body if p[1] >= 13}
    highlight = {(x, y) for x, y in body if 4 <= x <= 6 and 6 <= y <= 7}

    for p in body:
        px[p] = SHADOW if p in shadow else BODY
    for p in highlight:
        px[p] = HIGHLIGHT

    # Outline wherever a body pixel touches empty space (4-neighbors).
    for x, y in body:
        if any((x + dx, y + dy) not in body
               for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            px[x, y] = OUTLINE

    # Eyes and mouth.
    for x, y in ((5, 10), (6, 10), (9, 10), (10, 10)):
        px[x, y] = EYE
    for x in (7, 8):
        px[x, 12] = MOUTH

    return img


def main() -> None:
    out = Path(__file__).parent
    sprite = build()
    sprite.save(out / "slime.png")
    sprite.resize((SIZE * SCALE, SIZE * SCALE), Image.NEAREST).save(
        out / "slime_preview.png"
    )
    print(f"wrote {out / 'slime.png'} and {out / 'slime_preview.png'}")


if __name__ == "__main__":
    main()
