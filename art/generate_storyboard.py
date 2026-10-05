"""Build the documentation-portfolio storyboard from the game's real pixel art.

Run: python3 art/generate_storyboard.py
Out: docs/portfolio/storyboard.png  (6 panels + captions)
     docs/portfolio/title_art.png    (title page image)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "game" / "assets"
OUT = ROOT / "docs" / "portfolio"
PW, PH = 160, 96  # panel size in pixels


def load(name):
    return Image.open(A / f"{name}.png").convert("RGBA")


def blit(dst, name, x, y, scale=1, flip=False):
    img = load(name)
    if flip:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    if scale != 1:
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    dst.alpha_composite(img, (x, y))


def ground_panel(bg_top, bg_bottom, tile="tile_grass", row=10):
    p = Image.new("RGBA", (PW, PH), bg_top)
    d = ImageDraw.Draw(p)
    for y in range(PH):
        t = y / PH
        c = tuple(int(bg_top[i] + (bg_bottom[i] - bg_top[i]) * t) for i in range(3)) + (255,)
        d.line([(0, y), (PW, y)], fill=c)
    row_px = row * 8
    for x in range(0, PW, 8):
        p.alpha_composite(load(tile).resize((8, 8), Image.NEAREST), (x, row_px))
        p.alpha_composite(load("tile_dirt").resize((8, 8), Image.NEAREST), (x, row_px + 8))
    return p


def stars(bg=(10, 12, 30)):
    p = Image.new("RGBA", (PW, PH), bg + (255,))
    d = ImageDraw.Draw(p)
    for i in range(40):
        x = (i * 53) % PW
        y = (i * 71) % (PH // 2)
        d.point((x, y), fill=(255, 255, 255, 200))
    return p


def panel1():
    p = stars()
    blit(p, "spr_ship", 40, 40, 1)
    blit(p, "p_idle0", 20, 60, 1)
    return p


def panel2():
    p = Image.new("RGBA", (PW, PH), (12, 14, 26, 255))
    d = ImageDraw.Draw(p)
    d.rectangle([0, 0, PW, PH], fill=(14, 16, 30, 255))
    blit(p, "spr_ship", 60, 30, 1)
    blit(p, "d_hover1", 20, 40, 1)
    blit(p, "p_idle0", 46, 58, 1)
    for x in range(0, PW, 8):
        p.alpha_composite(load("tile_metal").resize((8, 8), Image.NEAREST), (x, 76))
    return p


def panel3():
    p = ground_panel((14, 34, 44), (26, 74, 90))
    blit(p, "tile_grass_tuft", 30, 72, 1)
    blit(p, "p_sneak", 38, 60, 1)
    blit(p, "m_walk1", 96, 66, 1)
    d = ImageDraw.Draw(p, "RGBA")
    d.polygon([(100, 70), (150, 52), (150, 88)], fill=(242, 198, 94, 40))
    return p


def panel4():
    p = ground_panel((22, 16, 40), (40, 28, 60), tile="tile_ancient")
    blit(p, "spr_block", 40, 72, 1)
    blit(p, "tile_plate_on", 62, 74, 1)
    blit(p, "spr_orb", 100, 62, 1)
    blit(p, "spr_moria", 124, 48, 1)
    return p


def panel5():
    p = ground_panel((13, 21, 36), (28, 44, 70), tile="tile_crystal")
    blit(p, "spr_crystal", 20, 60, 1)
    blit(p, "p_idle0", 44, 60, 1)
    blit(p, "tile_platform", 60, 74, 1)
    blit(p, "tile_plate_on", 92, 74, 1)
    blit(p, "d_alert", 100, 40, 1)
    return p


def panel6():
    p = stars((6, 8, 20))
    blit(p, "spr_ship", 44, 34, 1)
    d = ImageDraw.Draw(p, "RGBA")
    d.polygon([(0, PH), (PW, PH), (PW, 70), (0, 78)], fill=(9, 12, 26, 220))
    blit(p, "p_idle0", 24, 62, 1)
    blit(p, "d_hover1", 60, 60, 1)
    return p


CAPTIONS = [
    ("1. CRASH", "Cryo-sleep breaks. The hull is down on Exxos, 142 million light-years from Earth."),
    ("2. CRYO BAY", "Wake up with Cyu. NAV CONSOLE picks a world; the REPAIR BAY rebuilds the cryo pod."),
    ("3. STEALTH WORLD", "Predators hunt by sight and sound. Sneak, hide in tall grass, take the fuel cells."),
    ("4. WORLD OF REGRETS", "Moria split his soul from his body. Push rune blocks onto plates, carry his soul home."),
    ("5. THE HOLLOW SIGNAL", "World 3 storms. Carry embers to relays to raise bridges; dodge searchlight drones."),
    ("6. THE CHOICE", "Nine stolen fuel cells and one AI confession: give them back, or fly home."),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    panels = [panel1(), panel2(), panel3(), panel4(), panel5(), panel6()]
    scale = 2
    pad = 14
    caption_h = 34
    cols, rows = 2, 3
    cell_w = PW * scale + pad
    cell_h = PH * scale + caption_h + pad
    sheet = Image.new("RGB", (cols * cell_w + pad, rows * cell_h + pad), (18, 17, 28))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for i, (p, (head, body)) in enumerate(zip(panels, CAPTIONS)):
        big = p.convert("RGBA").resize((PW * scale, PH * scale), Image.NEAREST)
        x = pad + (i % cols) * cell_w
        y = pad + (i // cols) * cell_h
        sheet.paste(big, (x, y), big)
        draw.text((x, y + PH * scale + 4), head, fill=(110, 216, 240), font=font)
        draw.text((x, y + PH * scale + 16), body[:74], fill=(214, 222, 240), font=font)
        draw.rectangle([x - 1, y - 1, x + PW * scale, y + PH * scale], outline=(60, 58, 92))

    draw.text((pad, 2), "Pale Horizon - storyboard (generated from in-game pixel art)",
              fill=(242, 198, 94), font=font)
    sheet.save(OUT / "storyboard.png")

    # title page art
    t = stars((6, 8, 20)).resize((480, 288), Image.NEAREST)
    blit(t, "spr_ship", 150, 90, 2)
    blit(t, "p_idle0", 70, 190, 2)
    blit(t, "d_hover1", 240, 190, 2)
    t.convert("RGB").save(OUT / "title_art.png")
    print("wrote", OUT / "storyboard.png", "and", OUT / "title_art.png")


if __name__ == "__main__":
    main()
