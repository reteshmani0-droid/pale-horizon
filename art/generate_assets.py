"""Generate every sprite/tile for Pale Horizon.

Run:  python3 art/generate_assets.py
Out:  game/assets/*.png  (+ art/contact_sheet.html to eyeball everything)
"""
from pathlib import Path

from PIL import Image, ImageDraw
import math
import random

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "game" / "assets"

T = None  # transparent

P = {
    # "aluminium and sodium": cold structural grey lit by one warm working
    # lamp, with every world owning its own hue family. Flat fills only -
    # nothing glows that is not a real light, and the safety orange is held
    # back for warnings and for the lamp itself.
    "ink": (14, 18, 38, 255),
    "ink2": (28, 32, 56, 255),
    # ship metal: brushed aluminium, one step from white to black
    "metal_d": (43, 55, 83, 255),
    "metal": (85, 113, 143, 255),
    "metal_l": (155, 196, 203, 255),
    "hull": (218, 233, 215, 255),
    "rust": (150, 84, 52, 255),
    # the working lamp
    "gold": (217, 138, 69, 255),
    "gold_d": (138, 80, 38, 255),
    "lamp": (238, 176, 104, 255),
    # organics world: humid teal canopy over red-brown soil
    "grass_d": (26, 68, 71, 255),
    "grass": (51, 133, 117, 255),
    "grass_l": (135, 221, 160, 255),
    "dirt_d": (45, 37, 62, 255),
    "dirt": (79, 53, 76, 255),
    "dirt_l": (135, 82, 94, 255),
    # stone and rock
    "stone_d": (43, 45, 69, 255),
    "stone": (91, 92, 118, 255),
    "stone_l": (160, 158, 172, 255),
    # water: deep teal, colder than the sky
    "water_d": (20, 46, 60, 255),
    "water": (35, 92, 134, 255),
    "water_l": (97, 217, 206, 255),
    # ice world
    "ice_d": (94, 130, 158, 255),
    "ice": (166, 204, 226, 255),
    "ice_l": (230, 242, 248, 255),
    # crystal
    "crys_d": (56, 84, 110, 255),
    "crys": (126, 174, 204, 255),
    "crys_l": (204, 230, 242, 255),
    "soul_d": (74, 84, 78, 255),
    # rare-earth ore
    "ore": (200, 162, 106, 255),
    "ore_d": (126, 94, 52, 255),
    # biomass
    "bio": (134, 192, 152, 255),
    "bio_d": (62, 116, 92, 255),
    "sand_d": (105, 62, 77, 255),
    "sand": (181, 120, 103, 255),
    "sand_l": (244, 198, 148, 255),
    # EVA suit: ivory shell, amber visor
    "suit_d": (116, 124, 136, 255),
    "suit": (207, 222, 210, 255),
    "suit_l": (249, 245, 220, 255),
    "visor": (86, 211, 215, 255),
    "visor_d": (42, 96, 128, 255),
    # flight suit worn inside the ship (no helmet)
    "fs_d": (56, 72, 92, 255),
    "fs": (94, 120, 146, 255),
    "fs_l": (148, 174, 196, 255),
    "skin": (210, 168, 134, 255),
    "hair": (72, 54, 46, 255),
    "fuel": (217, 138, 69, 255),
    "fuel_d": (128, 74, 36, 255),
    "pred_d": (49, 37, 77, 255),
    "pred": (104, 72, 127, 255),
    "pred_l": (182, 125, 159, 255),
    "eye": (207, 91, 69, 255),
    "soul": (157, 231, 225, 255),
}


class Img:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[T] * w for _ in range(h)]

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h and c is not T:
            self.px[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y][x]
        return T

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.put(xx, yy, c)

    def ellipse(self, cx, cy, rx, ry, c):
        for yy in range(self.h):
            for xx in range(self.w):
                dx = (xx - cx) / max(rx, 0.001)
                dy = (yy - cy) / max(ry, 0.001)
                if dx * dx + dy * dy <= 1.0:
                    self.put(xx, yy, c)

    def line(self, x0, y0, x1, y1, c):
        dx, dy = abs(x1 - x0), abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy
        while True:
            self.put(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x0 += sx
            if e2 < dx:
                err += dx
                y0 += sy

    def outline(self, c, only_sides=True):
        adds = []
        for y in range(self.h):
            for x in range(self.w):
                if self.get(x, y) is not T:
                    continue
                nb = [self.get(x + 1, y), self.get(x - 1, y)]
                if not only_sides:
                    nb += [self.get(x, y + 1), self.get(x, y - 1)]
                if any(v is not T for v in nb):
                    adds.append((x, y, c))
        for x, y, col in adds:
            self.put(x, y, col)

    def speckle(self, c, seed, count):
        rnd = seed
        for _ in range(count):
            rnd = (rnd * 1103515245 + 12345) & 0x7FFFFFFF
            x = rnd % self.w
            rnd = (rnd * 1103515245 + 12345) & 0x7FFFFFFF
            y = rnd % self.h
            if self.get(x, y) is not T:
                self.put(x, y, c)

    def mirror(self):
        out = Img(self.w, self.h)
        for y in range(self.h):
            for x in range(self.w):
                out.px[y][x] = self.px[y][self.w - 1 - x]
        return out

    def to_image(self):
        img = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        img.putdata(
            [
                (0, 0, 0, 0) if self.px[y][x] is None else self.px[y][x]
                for y in range(self.h)
                for x in range(self.w)
            ]
        )
        return img

    def save(self, name):
        image = self.to_image()
        # Selective cold rim light, not noisy full-sprite recoloring. Keep the
        # authored palette and binary transparency of the small pixel clusters.
        if name.startswith(('spr_', 'p_', 'pB_', 'pC_', 'c_', 'cB_', 'cC_', 'm_', 'd_')):
            px = image.load()
            original = image.copy().load()
            for y in range(1, self.h - 1):
                for x in range(1, self.w - 1):
                    c = original[x, y]
                    if c[3] and c != P['ink'] and not original[x, y - 1][3] and (x + y) % 3:
                        px[x, y] = tuple(min(255, round(c[k] * .75 + P['ice_l'][k] * .25)) for k in range(3)) + (255,)
        image.save(OUT / f"{name}.png")


# --------------------------------------------------------------------- tiles --
def tile_grass():
    i = tile_dirt()
    i.rect(0, 0, 16, 3, P['grass'])
    for x, w, h in [(0, 4, 5), (5, 3, 6), (9, 5, 4), (14, 2, 7)]:
        i.rect(x, 1, w, h, P['grass_d'])
        i.rect(x, 0, w, 2, P['grass_l'])
        i.rect(x + 1, 2, max(1, w - 1), 2, P['grass'])
    i.line(6, 6, 7, 11, P['dirt_l'])
    i.line(7, 11, 11, 13, P['dirt_d'])
    return i


def tile_dirt():
    i = Img(16, 16)
    i.rect(0, 0, 16, 16, P['dirt'])
    for x, y, w, h in [(0, 2, 6, 3), (9, 1, 7, 4), (4, 8, 8, 3), (0, 13, 5, 3), (13, 10, 3, 6)]:
        i.rect(x, y, w, h, P['dirt_d'])
        i.rect(x, y, max(1, w - 2), 1, P['dirt_l'])
    i.rect(2, 6, 3, 1, P['dirt_l'])
    i.rect(11, 14, 2, 1, P['dirt_l'])
    return i


def tile_stone():
    i = Img(16, 16)
    i.rect(0, 0, 16, 16, P["stone"])
    i.rect(0, 0, 16, 1, P["stone_l"])
    i.rect(0, 8, 16, 1, P["stone_d"])
    i.rect(0, 15, 16, 1, P["stone_d"])
    i.rect(7, 0, 1, 8, P["stone_d"])
    i.rect(3, 8, 1, 8, P["stone_d"])
    i.rect(12, 8, 1, 8, P["stone_d"])
    i.speckle(P["stone_d"], 21, 12)
    return i


def tile_metal():
    i = Img(16, 16)
    i.rect(0, 0, 16, 16, P['metal_d'])
    i.rect(1, 2, 14, 12, P['metal'])
    i.rect(1, 2, 14, 1, P['metal_l'])
    i.rect(1, 3, 1, 9, P['metal_l'])
    i.rect(2, 13, 13, 2, P['ink2'])
    for x in (3, 12):
        i.rect(x, 5, 2, 1, P['hull'])
        i.rect(x, 6, 2, 1, P['metal_d'])
    i.line(4, 10, 9, 10, P['metal_d'])
    i.line(9, 10, 11, 8, P['metal_d'])
    return i


def tile_platform():
    i = Img(16, 6)
    i.rect(0, 0, 16, 2, P["metal_l"])
    i.rect(0, 2, 16, 3, P["metal"])
    i.rect(0, 5, 16, 1, P["metal_d"])
    for x in range(0, 16, 5):
        i.rect(x, 3, 2, 2, P["metal_d"])
    return i


def tile_grass_platform():
    i = Img(16, 6)
    i.rect(0, 0, 16, 2, P["grass_l"])
    i.rect(0, 2, 16, 2, P["grass"])
    i.rect(0, 4, 16, 2, P["dirt"])
    return i


def tile_water(top=True):
    i = Img(16, 16)
    i.rect(0, 0, 16, 16, P["water"])
    i.rect(0, 0, 16, 2, P["water_l"] if top else P["water"])
    if top:
        for x in range(0, 16, 4):
            i.rect(x, 2, 2, 1, P["water_l"])
    for y in range(6, 16, 4):
        i.rect(2, y, 5, 1, P["water_l"])
        i.rect(9, y + 2, 4, 1, P["water_d"])
    return i


def tile_crystal():
    i = Img(16, 16)
    i.rect(0, 0, 16, 16, P['crys_d'])
    i.rect(0, 0, 16, 3, P['ice_l'])
    i.rect(0, 3, 16, 4, P['ice'])
    i.line(0, 7, 8, 13, P['crys'])
    i.line(8, 13, 15, 8, P['crys'])
    i.line(2, 7, 7, 11, P['crys_l'])
    i.line(9, 4, 11, 8, P['crys_d'])
    i.line(11, 8, 8, 14, P['crys_d'])
    i.rect(1, 15, 6, 1, P['crys'])
    return i


def tile_ancient():
    i = Img(16, 16)
    i.rect(0, 0, 16, 16, P['sand_d'])
    for x, y, w in [(0, 1, 9), (10, 1, 6), (-2, 9, 7), (6, 9, 10)]:
        i.rect(x, y, w, 6, P['sand'])
        i.rect(x, y, w, 1, P['sand_l'])
        i.rect(x, y + 1, 1, 4, P['sand_l'])
        i.rect(x + 2, y + 5, max(1, w - 3), 1, P['rust'])
    i.rect(4, 3, 2, 1, P['sand_d'])
    i.rect(11, 11, 3, 1, P['sand_d'])
    return i


def tile_ancient_rune():
    i = tile_ancient()
    i.line(5, 3, 5, 12, P["soul_d"])
    i.line(5, 3, 10, 6, P["soul_d"])
    i.line(10, 6, 5, 9, P["soul_d"])
    i.rect(10, 10, 2, 2, P["soul"] if False else P["soul_d"])
    return i


def tile_vent():
    i = Img(16, 16)
    i.rect(0, 0, 16, 16, P["ink2"])
    for y in range(2, 15, 3):
        i.rect(1, y, 14, 2, P["metal_d"])
        i.rect(1, y, 14, 1, P["metal"])
    i.rect(0, 0, 1, 16, P["metal_d"])
    i.rect(15, 0, 1, 16, P["metal_d"])
    return i


def tile_grass_tuft():
    i = Img(16, 12)
    for x in range(1, 16, 2):
        h = 4 + (x * 7) % 6
        i.rect(x, 12 - h, 2, h, P["grass_d"])
        i.put(x, 12 - h, P["grass_l"])
    i.rect(0, 10, 16, 2, P["grass_d"])
    return i


def tile_plate(on=False):
    i = Img(16, 6)
    i.rect(0, 0, 16, 2, P["stone_d"])
    c = P["fuel"] if on else P["stone_l"]
    i.rect(2, 0, 12, 1, c)
    if on:
        i.rect(1, 1, 14, 1, P["fuel_d"])
    return i


def sprite_block():
    i = Img(16, 16)
    i.rect(1, 1, 14, 14, P["stone"])
    i.rect(1, 1, 14, 2, P["stone_l"])
    i.rect(1, 13, 14, 2, P["stone_d"])
    i.rect(6, 5, 4, 6, P["soul_d"])
    i.rect(7, 6, 2, 4, P["sand_l"])
    i.outline(P["ink"])
    return i


def sprite_door(open_=False):
    i = Img(16, 32)
    if open_:
        i.rect(0, 0, 4, 32, P["meta_d" if False else "metal_d"])
        i.rect(12, 0, 4, 32, P["metal_d"])
        return i
    i.rect(0, 0, 16, 32, P["metal"])
    i.rect(0, 0, 16, 1, P["metal_l"])
    for y in range(0, 32, 8):
        i.rect(1, y + 1, 14, 1, P["metal_d"])
    i.rect(7, 0, 2, 32, P["metal_d"])
    i.rect(2, 14, 3, 3, P["gold"])
    i.rect(11, 14, 3, 3, P["gold"])
    i.outline(P["ink"], only_sides=False)
    return i


def sprite_beacon(on=False):
    i = Img(16, 24)
    i.rect(4, 2, 8, 20, P["metal"])
    i.rect(4, 2, 8, 2, P["metal_l"])
    i.rect(5, 6, 6, 6, P["gold"] if on else P["stone_d"])
    if on:
        i.rect(6, 7, 4, 4, P["suit_l"])
    i.line(4, 4, 1, 0, P["metal_l"])
    i.line(11, 4, 14, 0, P["metal_l"])
    i.rect(3, 21, 10, 3, P["metal_d"])
    i.outline(P["ink"])
    return i


def sprite_rock():
    i = Img(14, 9)
    i.ellipse(6, 6, 6, 5, P["stone"])
    i.rect(0, 7, 13, 2, P["stone_d"])
    i.rect(2, 1, 4, 2, P["stone_l"])
    i.outline(P["ink"])
    return i


def sprite_plant():
    i = Img(10, 12)
    i.rect(4, 6, 2, 6, P["grass_d"])
    for dx, dy in ((-3, -5), (3, -4), (-1, -7)):
        i.line(5, 8, 5 + dx, 8 + dy, P["grass"])
        i.put(5 + dx, 8 + dy, P["grass_l"])
    return i


def sprite_crystal_deco():
    i = Img(12, 18)
    i.line(6, 17, 6, 3, P["crys"])
    i.line(6, 3, 3, 9, P["crys_l"])
    i.line(6, 5, 9, 11, P["crys_l"])
    i.line(6, 10, 4, 16, P["crys_d"])
    i.line(6, 12, 8, 17, P["crys_d"])
    return i


# ------------------------------------------------------------------ critters --
SUIT_VARIANTS = {
    # "" is the issue ivory-and-amber EVA shell; B and C are the two alternates
    # a pilot can choose in Options. Same silhouette, same visor shape, so the
    # animation reads identically whichever one is picked.
    "": {"mid": "suit", "dark": "suit_d", "light": "suit_l", "visor": "visor", "visor_d": "visor_d"},
    "B": {"mid": "fs", "dark": "fs_d", "light": "fs_l", "visor": "crys", "visor_d": "crys_d"},
    "C": {"mid": "sand", "dark": "sand_d", "light": "sand_l", "visor": "grass_l", "visor_d": "grass_d"},
}


def astronaut(kind, suited=True, variant=""):
    """26x32 frames: idle0/1, walk0-3, jump, sneak.

    Sixteen more rows of sprite than the first pass: shoulder pads, arms, a chest
    unit you can read, knee pads and separate boots, so the pilot still holds up
    at the game's zoom. `suited` is the EVA shell with helmet and life support;
    aboard the ship it is the flight suit and a bare head. `variant` swaps the
    shell colours - the three choices offered in Options.
    """
    i = Img(26, 32)
    c = SUIT_VARIANTS.get(variant, SUIT_VARIANTS[""])
    body_top, leg_lift = 14, 0
    if kind == "idle1":
        body_top = 15
    if kind == "sneak":
        body_top = 19
    torso, torso_d, torso_l = P[c["mid"]], P[c["dark"]], P[c["light"]]
    visor, visor_d = P[c["visor"]], P[c["visor_d"]]

    # life support (EVA) or a tool roll (flight suit)
    if suited:
        i.rect(3, body_top - 3, 6, 13, torso_d)
        i.rect(3, body_top - 3, 6, 3, P["stone_d"])
        i.rect(4, body_top + 8, 4, 3, P["metal_d"])
    else:
        i.rect(4, body_top + 1, 5, 8, torso_d)

    # legs: the walk cycle lifts one foot, the jump frame tucks both, sneaking
    # drops the whole body onto bent knees
    if kind.startswith("walk"):
        leg_lift = [0, 2, 0, 1][int(kind[-1])]
    if kind == "jump":
        i.rect(7, 22, 5, 6, torso)
        i.rect(14, 23, 5, 5, torso_d)
        i.rect(6, 27, 6, 2, P["ink2"])
        i.rect(14, 27, 6, 2, P["ink2"])
    elif kind == "sneak":
        i.rect(5, 25, 7, 5, torso)
        i.rect(14, 25, 7, 5, torso_d)
        i.rect(4, 29, 8, 2, P["ink2"])
        i.rect(14, 29, 8, 2, P["ink2"])
    else:
        i.rect(8, 24 + leg_lift, 5, 7 - leg_lift, torso)
        i.rect(14, 24, 5, 7, torso_d)
        i.rect(8, 26 + leg_lift, 5, 2, torso_d)
        i.rect(14, 26, 5, 2, torso_l)
        i.rect(7, 30, 6, 2, P["ink2"])
        i.rect(14, 31, 6, 1, P["ink2"])

    # torso: chest plate, shoulder pads, belt
    i.rect(7, body_top, 13, 11, torso)
    i.rect(7, body_top, 13, 3, torso_l)
    i.rect(6, body_top + 1, 2, 5, torso_d)
    i.rect(19, body_top + 1, 2, 5, torso_d)
    i.rect(9, body_top + 4, 9, 5, torso_d)
    i.rect(10, body_top + 5, 3, 2, P["gold"])
    i.rect(14, body_top + 5, 2, 1, visor)
    i.rect(7, body_top + 9, 13, 2, P["ink2"])
    # arms
    i.rect(4, body_top + 3, 3, 7, torso_d)
    i.rect(20, body_top + 3, 3, 7, torso_d)
    i.rect(4, body_top + 9, 3, 2, P["ink2"])
    i.rect(20, body_top + 9, 3, 2, P["ink2"])

    if suited:
        # helmet: wide visor, rim highlight, side vents
        i.ellipse(13, body_top - 4, 7, 7, torso)
        i.ellipse(14, body_top - 4, 6, 5, visor)
        i.ellipse(16, body_top - 5, 3, 3, visor_d)
        i.rect(9, body_top - 9, 6, 2, torso_l)
        i.rect(6, body_top - 2, 3, 3, torso_d)
        i.rect(18, body_top - 2, 2, 3, torso_d)
    else:
        # bare head, short hair, suit collar
        i.rect(9, body_top - 2, 9, 2, torso_l)
        i.ellipse(13, body_top - 5, 6, 6, P["skin"])
        i.ellipse(13, body_top - 8, 6, 4, P["hair"])
        i.rect(8, body_top - 7, 2, 3, P["hair"])
        i.rect(15, body_top - 4, 2, 1, P["ink2"])
        i.rect(11, body_top - 6, 2, 1, P["ink2"])
    # New silhouette details: asymmetric shoulder lamp, chest harness, copper
    # boot straps, reflective glass and a hanging survival scarf.
    i.rect(3, body_top - 2, 3, 2, P['lamp'])
    i.rect(8, body_top + 3, 2, 6, P['metal_d'])
    i.rect(17, body_top + 3, 2, 6, P['metal_d'])
    i.rect(10, body_top + 4, 6, 2, P['hull'])
    i.rect(11, body_top + 7, 3, 1, P['visor'])
    i.rect(6, body_top - 1, 5, 2, P['rust'])
    i.rect(4, body_top + 1, 3, 4, P['gold'])
    if suited:
        i.rect(10, body_top - 7, 8, 1, P['suit_l'])
        i.rect(17, body_top - 6, 2, 3, P['crys_l'])
        i.rect(8, body_top - 5, 1, 3, P['visor_d'])
    i.rect(8, 29, 4, 1, P['gold'])
    i.rect(15, 29, 4, 1, P['gold_d'])
    i.outline(P["ink"])
    return i


def grabber_plant(open_=False):
    """24x22: the vent pitcher. Sits flush with the ground while it waits and
    opens into a maw of tendrils when it takes a step at you."""
    i = Img(24, 22)
    i.ellipse(12, 19, 10, 6, P["grass_d"])
    i.ellipse(12, 18, 8, 4, P["grass"])
    i.ellipse(12, 12, 6, 7, P["grass_d"])
    i.ellipse(12, 11, 4, 5, P["bio_d"])
    if open_:
        i.ellipse(12, 8, 8, 5, P["grass"])
        i.ellipse(12, 8, 5, 3, P["bio"])
        i.ellipse(12, 8, 3, 2, P["ink"])
        for dx in (-9, -5, 5, 9):
            i.line(12, 6, 12 + dx, 1, P["grass_l"])
            i.put(12 + dx, 1, P["bio"])
        i.rect(9, 7, 2, 2, P["sand_l"])
        i.rect(14, 7, 2, 2, P["sand_l"])
    else:
        i.ellipse(12, 7, 7, 4, P["grass_d"])
        i.ellipse(12, 7, 5, 2, P["grass"])
        i.line(7, 7, 17, 7, P["ink"])
        i.rect(10, 5, 1, 4, P["grass_l"])
        i.rect(14, 5, 1, 4, P["grass_l"])
    i.outline(P["ink"])
    return i


def escape_pod(open_=False):
    """34x30: the escape pod. It is what travels between worlds now - the
    lander itself never leaves the first planet again."""
    i = Img(34, 30)
    i.ellipse(17, 24, 15, 6, P["metal_d"])
    i.ellipse(17, 23, 13, 4, P["metal"])
    i.ellipse(17, 14, 11, 11, P["hull"])
    i.ellipse(17, 15, 9, 9, P["metal_l"])
    i.rect(9, 12, 16, 3, P["metal"])
    if open_:
        i.rect(11, 10, 12, 12, P["ink"])
        i.rect(12, 11, 10, 10, P["metal_d"])
    else:
        i.rect(11, 10, 12, 12, P["metal_d"])
        i.rect(12, 11, 10, 10, P["metal"])
        i.ellipse(17, 16, 4, 4, P["visor"])
        i.ellipse(17, 16, 2, 2, P["visor_d"])
    i.rect(2, 16, 4, 8, P["metal_d"])
    i.rect(28, 16, 4, 8, P["metal_d"])
    i.rect(15, 26, 4, 4, P["metal_d"])
    i.rect(16, 28, 2, 2, P["lamp"])
    i.line(17, 3, 17, 0, P["metal_l"])
    i.rect(17, 5, 3, 3, P["gold"])
    i.line(6, 19, 9, 7, P['metal_l'])
    i.line(25, 7, 28, 19, P['metal_d'])
    i.rect(5, 22, 4, 2, P['gold'])
    i.rect(25, 22, 4, 2, P['gold'])
    i.rect(13, 12, 7, 1, P['crys_l'])
    i.rect(14, 20, 6, 1, P['metal_l'])
    i.outline(P["ink"])
    return i


def lab_bench():
    """40x32: the research bench. Screens show the tech tree, the clamps hold
    the build while it is printed."""
    i = Img(40, 32)
    i.rect(2, 10, 36, 18, P["metal_d"])
    i.rect(4, 12, 32, 14, P["metal"])
    i.rect(4, 2, 32, 9, P["metal_l"])
    i.rect(6, 4, 12, 5, P["ink"])
    i.rect(7, 5, 10, 3, P["metal_d"])
    i.rect(8, 6, 3, 1, P["gold"])
    i.rect(13, 6, 3, 1, P["crys"])
    i.rect(20, 4, 6, 5, P["ink"])
    i.rect(21, 5, 4, 3, P["bio"])
    i.rect(28, 4, 6, 5, P["ink"])
    i.rect(29, 5, 4, 3, P["gold_d"])
    i.rect(3, 18, 34, 3, P["hull"])
    i.rect(6, 21, 5, 5, P["metal_d"])
    i.rect(12, 20, 8, 3, P["hull"])
    i.rect(13, 21, 6, 1, P["gold"])
    i.rect(23, 20, 4, 4, P["rust"])
    i.rect(29, 20, 5, 4, P["metal_l"])
    i.rect(30, 21, 3, 2, P["crys_l"])
    i.rect(2, 28, 36, 4, P["metal_d"])
    i.outline(P["ink"])
    return i


def creeper(kind):
    """24x18: the ground creeper. A vine that feels footsteps through the soil and
    crawls at them; what it reaches, it folds under the roots. Never stands up, so
    the silhouette reads as a plant and not as an animal."""
    i = Img(24, 18)
    # four crawl frames: the foliage fans and the trap bobs, so movement reads
    sway = [0, 1, 2, 1][int(kind[-1])] if kind.startswith("walk") else 2
    snapped = kind == "alert"
    gy = 15                              # ground line under the plant
    # the soil it has turned over, with roots running back into it
    i.ellipse(10, gy + 2, 12, 3, P["dirt_d"])
    i.ellipse(9, gy + 1, 9, 2, P["dirt"])
    for dx in (-11, -8, -5, -2, 1):
        i.line(10 + dx, gy, 10 + dx - 3, 17, P["grass_d"])
    # a fan of leaf stalks behind the trap: unmistakably foliage
    for bx, spread in ((4, -2), (7, -1), (10, 1)):
        top = 3 + abs(spread) + sway // 2
        i.line(bx, gy - 1, bx + spread, top, P["grass_d"])
        i.line(bx, gy - 2, bx + spread, top + 1, P["grass"])
        i.rect(bx + spread - 1, top, 3, 2, P["grass_l"])
        i.put(bx + spread + 2, top + 1, P["grass"])
    # the trap: two lips around a dark throat, shut or open
    gape = 2 if snapped else 0
    i.ellipse(17, gy - 6 - gape, 5, 2, P["grass"])          # upper lip
    i.line(13, gy - 6 - gape, 21, gy - 6 - gape, P["sand_l"])
    i.ellipse(17, gy - 3 + gape, 5, 2, P["grass_d"])        # lower lip
    i.rect(14, gy - 6, 7, 3 + gape * 2, P["ink"])           # throat
    if snapped:
        i.rect(15, gy - 6, 5, 2 + gape * 2, P["bio_d"])
        i.rect(16, gy - 5, 3, gape * 2, P["bio"])
        for tx in (15, 18, 21):
            i.line(tx, gy - 6 - gape, tx, gy - 7 - gape, P["sand_l"])
            i.put(tx, gy - 8 - gape, P["hull"])
    else:
        i.line(14, gy - 5, 20, gy - 5, P["dirt_d"])         # the shut seam
        i.put(17, gy - 8, P["grass_l"])
        i.put(20, gy - 8, P["grass_l"])
    i.outline(P["ink"])
    return i


def bird(kind):
    """20x12: a ridge bird. Rides the thermals over the canopy, hunts by sight, and
    folds its wings when it has you, so the airborne threat is an animal and not a
    machine."""
    i = Img(20, 12)
    swoop = kind == "alert"
    high = kind == "fly0"
    # body on the right, tail streaming left, head and beak out front
    i.ellipse(9, 6, 5, 2, P["dirt_d"])
    i.ellipse(9, 6, 4, 1, P["dirt_l"])
    i.ellipse(14, 5, 3, 2, P["dirt_l"])
    i.line(4, 6, 1, 7, P["dirt_d"])
    i.put(1, 7, P["ink2"])
    i.line(16, 4, 19, 5, P["gold"])
    i.line(16, 5, 19, 5, P["gold"])
    i.put(19, 5, P["gold_d"])
    i.put(14, 4, P["eye"] if swoop else P["ink2"])
    # wings as clear diagonals: a V on the upstroke, an inverted V on the return,
    # swept flat back when it folds and comes at you
    if swoop:
        for dx in range(0, 6):
            i.put(7 - dx, 5 - dx // 2, P["dirt"])
            i.put(12 + dx, 5 - dx // 2, P["dirt_d"])
        i.line(1, 4, 6, 5, P["dirt"])
        i.line(14, 2, 17, 3, P["dirt_d"])
    elif high:
        for dx in range(0, 6):
            i.put(8 - dx, 5 - dx, P["dirt"])
            i.put(11 + dx, 5 - dx, P["dirt_d"])
    else:
        for dx in range(0, 6):
            i.put(8 - dx, 7 + dx, P["dirt"])
            i.put(11 + dx, 7 + dx, P["dirt_d"])
    i.outline(P["ink"])
    return i


def moria_body():
    i = Img(36, 44)
    # cloak
    i.ellipse(18, 30, 14, 13, P["pred_d"])
    i.ellipse(18, 28, 11, 11, P["pred"])
    for k in range(3):
        i.rect(6 + k * 9, 36, 4, 7, P["ink2"])
    # chest cavity glow (missing soul)
    i.ellipse(18, 20, 5, 6, P["ink"])
    i.ellipse(18, 20, 3, 4, P["soul_d"])
    # head
    i.ellipse(18, 9, 7, 7, P["pred"])
    i.ellipse(18, 8, 5, 5, P["pred_l"])
    i.rect(14, 8, 3, 2, P["eye"])
    i.rect(20, 8, 3, 2, P["eye"])
    # crown/antennae
    i.line(12, 3, 8, 0, P["pred_l"])
    i.line(24, 3, 28, 0, P["pred_l"])
    i.outline(P["ink"])
    return i


def soul_orb():
    i = Img(14, 16)
    i.ellipse(7, 8, 6, 7, P["soul_d"])
    i.ellipse(7, 8, 4, 5, P["soul"])
    i.ellipse(5, 6, 2, 2, P["suit_l"])
    i.rect(6, 0, 2, 3, P["soul"])
    return i


def shard():
    i = Img(12, 14)
    i.line(6, 13, 6, 1, P["soul"])
    i.line(6, 1, 2, 8, P["soul_d"])
    i.line(6, 3, 10, 9, P["soul_d"])
    i.line(6, 12, 3, 7, P["suit_l"])
    return i


def fuel_cell():
    i = Img(12, 16)
    i.rect(2, 1, 8, 14, P["metal"])
    i.rect(3, 2, 6, 12, P["fuel_d"])
    i.rect(4, 4, 4, 8, P["fuel"])
    i.rect(4, 3, 4, 1, P["suit_l"])
    i.rect(2, 0, 8, 2, P["metal_l"])
    i.rect(4, 14, 4, 2, P["metal_d"])
    i.outline(P["ink"])
    return i


def pod_part():
    i = Img(14, 14)
    i.ellipse(7, 7, 6, 6, P["gold_d"])
    i.ellipse(7, 7, 4, 4, P["gold"])
    for a in range(0, 14, 3):
        i.rect(a, 6, 2, 2, P["gold_d"])
    i.rect(6, 6, 2, 2, P["ink"])
    return i


def ship(big=True):
    """192x96 expedition carrier HORIZON-04, shared intact/wreck geometry.
    A full-size, three-engine science vessel, not an enlarged escape pod.
    """
    i = Img(192, 96)
    # Long stepped keel, command prow, dorsal observatory and radiator wings.
    for x, y, w, h, color in [(24,35,139,40,'metal_d'), (36,28,119,43,'metal'),
                              (48,22,92,11,'hull'), (59,15,68,12,'metal_d'),
                              (67,12,54,10,'hull'), (13,41,25,30,'metal_d')]:
        i.rect(x,y,w,h,P[color])
    i.ellipse(151,47,32,25,P['metal_d'])
    i.ellipse(152,44,27,22,P['hull'])
    i.ellipse(161,40,20,13,P['visor_d'])
    i.ellipse(165,38,15,9,P['visor'])
    i.line(155,32,172,33,P['crys_l'])
    i.line(156,32,157,45,P['metal_d'])
    i.line(166,32,168,46,P['metal_d'])
    # Dorsal glass gallery and antenna array.
    i.rect(71,15,46,5,P['visor_d'])
    for x in range(73,116,9):
        i.rect(x,15,6,3,P['visor'])
        i.rect(x,15,6,1,P['crys_l'])
    i.line(88,11,84,3,P['metal_l']); i.line(112,11,118,2,P['metal_l'])
    i.rect(81,2,7,2,P['lamp']); i.rect(116,1,5,2,P['crys_l'])
    # Radiators: visible segmented fins rather than a flat oval hull.
    for x in range(31,67,8):
        i.line(x,32,x-7,15,P['metal_d'])
        i.line(x+1,32,x-6,15,P['metal_l'])
        i.rect(x-9,14,7,3,P['hull'])
    # Three large engine nacelles.
    for y in (33,48,63):
        i.rect(4,y,28,12,P['ink2'])
        i.rect(10,y+1,24,9,P['metal'])
        i.rect(12,y+1,18,2,P['hull'])
        i.rect(3,y+3,10,7,P['metal_d'])
        i.rect(2,y+4,4,5,P['gold'])
        i.rect(2,y+5,2,3,P['lamp'])
        for x in (16,22,28): i.rect(x,y+4,2,4,P['metal_d'])
    # Pressure-shell panels, lit portholes, bolts, service panels and bay.
    for x in range(40,143,18):
        i.rect(x,34,16,23,P['hull'])
        i.rect(x+1,35,2,20,P['metal_l'])
        i.rect(x+4,38,9,6,P['ink2'])
        i.rect(x+5,39,7,3,P['visor'])
        i.rect(x+5,39,7,1,P['crys_l'])
        i.rect(x+5,49,5,2,P['metal'])
        i.rect(x+12,51,2,2,P['metal_d'])
        i.rect(x+1,34,1,1,P['suit_l'])
    i.rect(37,57,116,3,P['gold'])
    i.rect(41,61,105,10,P['metal_d'])
    for x in range(43,145,8): i.rect(x,63,4,1,P['metal_l'])
    i.rect(109,49,23,22,P['ink2'])
    i.rect(112,51,17,18,P['metal'])
    i.rect(115,54,11,12,P['visor_d'])
    i.rect(116,55,9,1,P['crys_l'])
    i.rect(137,58,19,5,P['hull'])
    # Landing legs keep the silhouette identical between parked/flying states.
    if big:
        i.line(48,72,38,91,P['metal_d']); i.line(49,72,40,91,P['metal_l'])
        i.rect(31,91,21,3,P['metal'])
        i.line(146,69,157,88,P['metal_d']); i.line(147,69,159,88,P['metal_l'])
        i.rect(149,88,22,3,P['hull'])
        i.rect(87,33,4,28,P['rust'])
        i.line(68,35,78,49,P['ink']); i.line(78,49,72,57,P['ink'])
        i.rect(113,53,16,16,P['ink'])
        i.rect(114,67,14,2,P['lamp'])
        i.rect(80,73,54,3,P['ink2'])
    else:
        i.rect(43,73,14,4,P['metal_l']); i.rect(143,69,14,4,P['metal_l'])
    i.outline(P['ink'], only_sides=False)
    return i


def material_seam():
    """24x20: a rock face for the extractor, with veins tinted at runtime."""
    i = Img(24, 20)
    i.ellipse(12, 12, 11, 8, P["stone_d"])
    i.ellipse(11, 10, 8, 6, P["stone"])
    i.line(5, 6, 9, 14, P["metal_l"])
    i.line(9, 14, 18, 8, P["metal_l"])
    i.rect(5, 8, 3, 2, P["ink"])
    i.rect(12, 11, 4, 2, P["ink"])
    i.outline(P["ink"])
    return i


def asteroid(size):
    i = Img(size, size)
    c = size // 2
    i.ellipse(c, c, c - 1, c - 1, P["stone"])
    i.ellipse(c - 1, c - 1, c - 3, c - 3, P["stone_l"])
    rnd = size * 977
    for _ in range(size):
        rnd = (rnd * 1103515245 + 12345) & 0x7FFFFFFF
        x = rnd % size
        rnd = (rnd * 1103515245 + 12345) & 0x7FFFFFFF
        y = rnd % size
        if i.get(x, y) is not T:
            i.put(x, y, P["stone_d"])
    i.outline(P["ink"], only_sides=False)
    return i


def ui_icons():
    # alert
    a = Img(8, 12)
    a.rect(3, 0, 2, 7, P["eye"])
    a.rect(3, 9, 2, 2, P["eye"])
    a.outline(P["ink"])
    a.save("ui_alert")
    # fuel icon
    f = fuel_cell()
    f.save("ui_fuel")
    s = shard()
    s.save("ui_shard")
    p = pod_part()
    p.save("ui_part")
    biomass().save("ui_biomass")
    rare_earth().save("ui_ore")
    cryo_crystal().save("ui_cryo")
    ration_pack().save("ui_ration")
    alloy_plate().save("ui_plate")
    coolant_flask().save("ui_coolant")


# ------------------------------------------------------- ship fittings --
def cryo_pod():
    """40x44: the pod the pilot wakes in, front glass cracked."""
    i = Img(40, 44)
    i.rect(4, 4, 32, 38, P["metal_d"])
    i.rect(6, 6, 28, 34, P["metal"])
    i.rect(9, 10, 22, 24, P["ink"])
    i.rect(10, 11, 20, 22, P["visor_d"])
    i.rect(12, 13, 8, 18, P["visor"])
    i.rect(23, 14, 6, 16, P["suit_d"])
    # the crack that ended the sleep
    i.line(20, 11, 14, 24, P["suit_l"])
    i.line(14, 24, 21, 30, P["suit_l"])
    i.line(21, 30, 17, 34, P["suit_l"])
    i.rect(6, 36, 28, 4, P["metal_l"])
    i.rect(4, 0, 32, 4, P["metal_l"])
    i.rect(0, 8, 5, 10, P["metal_d"])
    i.rect(35, 8, 5, 10, P["metal_d"])
    i.rect(16, 38, 8, 3, P["gold"])
    i.rect(19, 41, 2, 2, P["lamp"])
    i.outline(P["ink"])
    return i


def nav_console():
    """32x30: the star-chart desk. Three worlds plotted, one marker."""
    i = Img(32, 30)
    i.rect(2, 10, 28, 20, P["metal_d"])
    i.rect(4, 12, 24, 16, P["metal"])
    i.rect(4, 4, 24, 8, P["metal_l"])
    i.rect(6, 5, 20, 6, P["ink"])
    i.rect(7, 6, 18, 4, P["metal_d"])
    i.rect(9, 7, 3, 2, P["gold"])
    i.rect(15, 6, 2, 2, P["crys"])
    i.rect(20, 8, 3, 2, P["water_l"])
    i.rect(12, 8, 1, 1, P["suit_l"])
    i.line(12, 8, 15, 7, P["visor_d"])
    i.line(12, 8, 21, 9, P["visor_d"])
    i.rect(6, 16, 20, 3, P["metal_d"])
    i.rect(7, 17, 18, 1, P["stone_d"])
    for bx in range(8, 24, 4):
        i.rect(bx, 22, 2, 2, P["gold_d"])
    i.rect(24, 20, 4, 5, P["rust"])
    i.rect(2, 28, 28, 2, P["metal_d"])
    i.outline(P["ink"])
    return i


def save_terminal():
    """20x30: the flight recorder. Write the log, keep the run."""
    i = Img(20, 30)
    i.rect(2, 2, 16, 24, P["metal_d"])
    i.rect(4, 4, 12, 20, P["metal"])
    i.rect(5, 6, 10, 8, P["ink"])
    i.rect(6, 7, 8, 6, P["metal_d"])
    i.rect(7, 8, 6, 1, P["gold"])
    i.rect(7, 10, 4, 1, P["crys"])
    i.rect(7, 12, 5, 1, P["crys"])
    i.rect(5, 16, 10, 2, P["metal_l"])
    i.rect(6, 19, 3, 2, P["gold_d"])
    i.rect(11, 19, 3, 2, P["rust"])
    i.rect(0, 26, 20, 4, P["metal_d"])
    i.outline(P["ink"])
    return i


def cryo_tank():
    """28x44: coolant tank. The gauge is the fill level."""
    i = Img(28, 44)
    i.rect(4, 6, 20, 32, P["metal_d"])
    i.rect(6, 8, 16, 28, P["metal"])
    i.rect(8, 10, 12, 24, P["ink2"])
    i.rect(9, 30, 10, 3, P["ice"])
    i.rect(9, 25, 10, 5, P["ice_d"])
    i.rect(9, 10, 10, 15, P["metal_d"])
    i.ellipse(14, 6, 10, 5, P["metal_l"])
    i.rect(12, 0, 4, 4, P["metal_d"])
    i.rect(22, 12, 6, 2, P["metal_d"])
    i.rect(0, 20, 5, 2, P["metal_d"])
    i.rect(4, 38, 20, 4, P["metal_d"])
    i.rect(11, 40, 6, 2, P["gold"])
    i.outline(P["ink"])
    return i


def galley():
    """32x30: bio-reactor galley. Purified rations keep the trip survivable."""
    i = Img(32, 30)
    i.rect(2, 6, 28, 22, P["metal_d"])
    i.rect(4, 8, 24, 18, P["metal"])
    i.ellipse(16, 17, 8, 6, P["ink2"])
    i.ellipse(16, 17, 5, 4, P["bio_d"])
    i.ellipse(16, 16, 3, 2, P["bio"])
    i.rect(10, 0, 12, 6, P["metal_l"])
    i.rect(12, 2, 8, 4, P["ink"])
    i.rect(13, 3, 6, 2, P["bio_d"])
    for vy in (10, 14, 18, 22):
        i.rect(22, vy, 5, 1, P["ink2"])
    i.rect(6, 24, 4, 2, P["gold"])
    i.outline(P["ink"])
    return i


def fabricator():
    """32x32: repair rig. Alloy plate goes in, hull comes back."""
    i = Img(32, 32)
    i.rect(2, 8, 28, 22, P["metal_d"])
    i.rect(4, 10, 24, 18, P["metal"])
    i.rect(6, 2, 4, 8, P["metal_l"])
    i.rect(10, 2, 16, 4, P["metal_l"])
    i.rect(22, 4, 4, 10, P["metal"])
    i.rect(23, 13, 3, 3, P["rust"])
    i.rect(25, 12, 4, 2, P["lamp"])
    i.rect(6, 20, 18, 4, P["ink2"])
    i.rect(9, 19, 12, 2, P["hull"])
    i.rect(12, 21, 6, 1, P["metal_d"])
    i.rect(26, 17, 1, 1, P["lamp"])
    i.rect(28, 19, 1, 1, P["gold"])
    i.rect(4, 28, 24, 3, P["metal_d"])
    i.outline(P["ink"])
    return i


def supply_crate():
    """26x18: the supply bay, drawn as a lidded crate with a manifest card."""
    i = Img(26, 18)
    i.rect(0, 5, 26, 13, P["metal_d"])
    i.rect(1, 6, 24, 11, P["metal"])
    i.rect(1, 1, 24, 5, P["metal_l"])
    i.rect(3, 3, 20, 2, P["metal_d"])
    i.rect(4, 8, 8, 6, P["hull"])
    i.rect(5, 9, 6, 1, P["gold"])
    i.rect(5, 11, 4, 1, P["stone_l"])
    i.rect(14, 8, 3, 3, P["gold_d"])
    i.rect(19, 8, 4, 6, P["metal_d"])
    i.outline(P["ink"])
    return i


# ------------------------------------------------------------------ field gear --
def processor(kind):
    """32x34: the field processor. One chassis, three intended jobs -
    purify (organics), smelt (rare earth), melt (cryo)."""
    light, dark = {
        "purify": (P["bio"], P["bio_d"]),
        "smelt": (P["gold"], P["gold_d"]),
        "melt": (P["ice"], P["ice_d"]),
    }[kind]
    i = Img(32, 36)
    # hopper on top, open and lit so it reads as a machine, not a shadow
    i.rect(7, 0, 18, 9, P["hull"])
    i.rect(9, 2, 14, 6, P["metal_d"])
    i.rect(10, 3, 12, 4, dark)
    i.rect(7, 8, 18, 1, P["metal_l"])
    # chassis: bright shell, dark seams, so it stands out against any canopy
    i.rect(3, 9, 26, 23, P["metal_l"])
    i.rect(5, 11, 22, 19, P["metal"])
    i.rect(5, 11, 22, 2, P["hull"])
    for sx in (13, 19):
        i.rect(sx, 11, 1, 19, P["metal_d"])
    # sight glass with the working charge
    i.ellipse(16, 21, 7, 6, P["ink"])
    i.ellipse(16, 21, 5, 4, dark)
    i.ellipse(16, 20, 3, 2, light)
    i.rect(6, 14, 3, 8, P["hull"])
    i.rect(23, 14, 3, 8, P["hull"])
    i.rect(24, 13, 2, 10, P["stone_d"])
    # gauge and the switch you throw to run it
    i.rect(9, 26, 5, 3, P["hull"])
    i.rect(10, 27, 3, 1, light)
    i.rect(20, 25, 4, 4, P["gold_d"])
    i.rect(3, 32, 26, 4, P["metal_d"])
    i.outline(P["ink"])
    return i


def biomass():
    """12x14: nutrient pods cut off the vent growths."""
    i = Img(12, 14)
    i.line(6, 13, 6, 6, P["bio_d"])
    i.ellipse(4, 6, 3, 3, P["bio"])
    i.ellipse(8, 4, 3, 3, P["bio"])
    i.ellipse(6, 9, 3, 3, P["bio_d"])
    i.rect(3, 5, 1, 1, P["grass_l"])
    i.rect(7, 3, 1, 1, P["grass_l"])
    i.outline(P["ink"])
    return i


def rare_earth():
    """14x14: ore with bright metal veins."""
    i = Img(14, 14)
    i.ellipse(7, 8, 6, 5, P["stone_d"])
    i.ellipse(7, 7, 5, 4, P["stone"])
    i.rect(3, 7, 3, 2, P["ore"])
    i.rect(7, 5, 3, 2, P["ore"])
    i.rect(6, 9, 4, 2, P["ore_d"])
    i.rect(9, 8, 2, 1, P["ore"])
    i.outline(P["ink"])
    return i


def cryo_crystal():
    """14x18: a shard cut out of the glacier."""
    i = Img(14, 18)
    i.line(7, 1, 2, 12, P["ice_d"])
    i.line(7, 1, 12, 11, P["ice"])
    i.line(2, 12, 12, 11, P["ice_l"])
    i.line(2, 12, 6, 17, P["ice_d"])
    i.line(12, 11, 8, 17, P["ice"])
    i.line(6, 17, 8, 17, P["ice_l"])
    i.ellipse(7, 8, 2, 4, P["ice_l"])
    i.outline(P["ink"])
    return i


def ration_pack():
    """12x14: sealed, purified ration."""
    i = Img(12, 14)
    i.rect(1, 2, 10, 11, P["metal_l"])
    i.rect(2, 3, 8, 9, P["bio_d"])
    i.rect(3, 4, 6, 3, P["bio"])
    i.rect(3, 8, 6, 1, P["metal_d"])
    i.rect(4, 0, 4, 3, P["metal"])
    i.outline(P["ink"])
    return i


def alloy_plate():
    """14x14: smelted rare-earth plate."""
    i = Img(14, 14)
    i.ellipse(7, 7, 6, 6, P["metal_d"])
    i.ellipse(7, 7, 5, 5, P["ore_d"])
    i.ellipse(7, 6, 3, 3, P["ore"])
    i.rect(6, 2, 2, 1, P["metal_l"])
    for a in range(0, 14, 4):
        i.rect(a, 6, 1, 2, P["metal_d"])
    i.outline(P["ink"])
    return i


def coolant_flask():
    """12x16: melted cryo, ready for the pod."""
    i = Img(12, 16)
    i.rect(2, 3, 8, 12, P["metal_d"])
    i.rect(3, 5, 6, 9, P["ice"])
    i.rect(3, 11, 6, 3, P["ice_l"])
    i.rect(4, 1, 4, 3, P["metal"])
    i.rect(3, 4, 6, 1, P["ink2"])
    i.outline(P["ink"])
    return i


# ------------------------------------------------------------------ bubbles --
def speech_bubble(w=56, h=22):
    i = Img(w, h)
    i.rect(1, 1, w - 2, h - 6, P["suit_l"])
    i.rect(1, 1, w - 2, 2, P["suit"])
    i.line(10, h - 6, 8, h - 1, P["suit_l"])
    i.line(11, h - 6, 12, h - 1, P["suit"])
    i.outline(P["ink"], only_sides=False)
    return i


def background_layers(theme):
    """Author at a real 320x184/512x184 pixel grid; never blur or antialias.
    Each theme has an opaque dithered sky and two seamless transparent layers.
    """
    colors = {
        'jungle': ('#101c36', '#234353', '#416b68', '#203c4a', '#285457', '#398574', '#8ddba4'),
        'ruins': ('#252039', '#694152', '#c78373', '#583e53', '#805361', '#b67a70', '#f1c990'),
        'ice': ('#101d3d', '#334e74', '#648da2', '#293b63', '#486187', '#81b1c3', '#d1e7db'),
        'space': ('#10152d', '#24284c', '#353e60', '#2a2b52', '#313753', '#485674', '#91d9db'),
        'metal': ('#17243b', '#243950', '#304b60', '#1a2c43', '#365165', '#6d91a0', '#9ee7d5'),
    }
    top, mid, bottom, farcol, nearcol, light, accent = colors[theme]
    def rgb(c): return tuple(bytes.fromhex(c[1:]))
    sky = Image.new('RGBA', (320, 184)); d = ImageDraw.Draw(sky)
    # Eight solid colour bands and sparse ordered dithering at their boundaries.
    a, b = rgb(top), rgb(bottom)
    for y in range(184):
        q = (y // 23) / 7
        c = tuple(round(a[k] + (b[k] - a[k]) * q) for k in range(3))
        d.line((0, y, 319, y), fill=c + (255,))
        if y % 23 in (0, 1, 2) and y > 0:
            prev = tuple(round(a[k] + (b[k] - a[k]) * (q - 1/7)) for k in range(3))
            for x in range(y % 2, 320, 4): d.point((x, y), fill=prev + (255,))
    rng = random.Random(204 + len(theme))
    if theme != 'metal':
        for n in range(60):
            x, y = rng.randrange(320), rng.randrange(90)
            d.point((x, y), fill=accent)
            if n % 19 == 0: d.line((x-1,y,x+1,y),fill=light)
    if theme in ('jungle', 'ruins', 'ice'):
        x, y, r = {'jungle': (246, 42, 25), 'ruins': (232, 45, 29), 'ice': (72, 38, 20)}[theme]
        d.ellipse((x-r,y-r,x+r,y+r),fill=accent)
        d.ellipse((x-r+6,y-r+3,x+r+8,y+r+7),fill=mid)
        for n in range(9):
            xx, yy = x-r+4+n*5, y-r+12+n%3*5
            d.rectangle((xx,yy,xx+3,yy+1),fill=light)
    if theme == 'ice':
        for band in range(3):
            points=[(x, 29 + band*10 + int(math.sin(x/35 + band)*10)) for x in range(0,320,4)]
            d.line(points, fill=['#497b8b','#639eac','#86c2b7'][band],width=3)
    if theme == 'space':
        for n in range(90):
            x=rng.randrange(320); y=50+int(math.sin(x/65)*19)+rng.randrange(26)
            d.rectangle((x,y,x+2,y+1),fill=rng.choice(['#30395a','#39486c','#415576']))
    sky.save(OUT / f'bg_{theme}_sky.png')
    for layer in ('far','near'):
        im=Image.new('RGBA',(512,184),(0,0,0,0)); d=ImageDraw.Draw(im)
        c=farcol if layer=='far' else nearcol
        base=174 if layer=='far' else 189
        if theme=='jungle':
            for n in range(9):
                x=n*64-16; h=70+rng.randrange(70)
                d.polygon([(x+18,base),(x+20,base-h),(x+27,base-h-9),(x+30,base),(x+40,base)],fill=c)
                for j in range(4):
                    yy=base-h+12+j*14
                    d.polygon([(x-24,yy+9),(x-12,yy),(x+13,yy-7),(x+28,yy-4),(x+51,yy+3),(x+62,yy+14),(x+24,yy+17)],fill=c)
                    if layer=='near':
                        d.line((x-12,yy,x+13,yy-7,x+28,yy-4),fill=light,width=1)
                        for k in range(3): d.rectangle((x+k*12,yy+8,x+k*12+5,yy+9),fill=farcol)
                if layer=='near':
                    d.line((x+23,base-h+35,x+21,base-9),fill=farcol,width=3)
                    for j in range(4): d.rectangle((x+34+j*2,base-h+32+j*8,x+35+j*2,base-h+35+j*8),fill=accent)
        elif theme=='ruins':
            for n in range(8):
                x=n*68-10; h=50+rng.randrange(75)
                d.rectangle((x,base-h,x+26,base),fill=c)
                d.rectangle((x-4,base-h-5,x+30,base-h+1),fill=c)
                d.polygon([(x-4,base-h-5),(x+10,base-h-16),(x+30,base-h-5)],fill=c)
                d.rectangle((x+7,base-h+10,x+19,base-h+35),fill=farcol if layer=='near' else top)
                if layer=='near':
                    d.line((x,base-h+2,x,base-10),fill=light,width=2)
                    for yy in range(base-h+42,base,12): d.line((x,yy,x+26,yy),fill=farcol)
                if n%2==0:
                    d.polygon([(x+26,base-35),(x+32,base-75),(x+46,base-88),(x+57,base-75),(x+63,base-35),(x+56,base-35),(x+51,base-69),(x+42,base-74),(x+36,base-69),(x+33,base-35)],fill=c)
        elif theme=='ice':
            for n in range(6):
                x=n*100-30; h=60+rng.randrange(75)
                d.polygon([(x,184),(x+37,base-h),(x+53,base-h-13),(x+110,184)],fill=c)
                d.polygon([(x+37,base-h),(x+53,base-h-13),(x+68,base-h+12),(x+52,base-h+5),(x+44,base-h+17)],fill=light)
                if layer=='near': d.polygon([(x+53,base-h-10),(x+59,base-h+22),(x+72,base-h+46),(x+81,181),(x+110,184)],fill=farcol)
        elif theme=='metal':
            for x in range(0,512,64):
                d.rectangle((x+1,18,x+62,170),fill=c)
                d.line((x+1,18,x+61,18),fill=light)
                d.line((x+2,20,x+2,169),fill=farcol,width=3)
                if layer=='far':
                    d.rectangle((x+10,38,x+51,104),fill=top)
                    d.rectangle((x+13,41,x+48,100),fill=mid)
                    d.line((x+14,42,x+47,42),fill=accent)
                    for yy in range(58,100,17): d.line((x+13,yy,x+48,yy),fill=farcol)
                else:
                    # Pipe frames, wiring and lamp clusters; transparent centres.
                    d.rectangle((x+5,24,x+58,164),fill=(0,0,0,0))
                    d.rectangle((x+8,25,x+28,28),fill=accent)
                    d.rectangle((x+8,29,x+28,30),fill=farcol)
                    d.line((x+56,44,x+56,120,x+44,131,x+44,154),fill=light,width=2)
                    for j in range(4): d.rectangle((x+12+j*8,155,x+15+j*8,157),fill=light)
        else:
            # Open space keeps silhouettes sparse: a distant moon and an orbital ring.
            if layer=='far':
                d.ellipse((330,86,477,233),fill=c)
                d.ellipse((351,87,477,208),fill=light)
                d.ellipse((362,88,482,203),fill=c)
                d.line((300,172,497,126),fill=accent,width=2)
        im.save(OUT / f'bg_{theme}_{layer}.png')


def transmission():
    i=Img(18,24)
    i.rect(3,8,12,14,P['metal_d'])
    i.rect(4,9,10,11,P['metal'])
    i.rect(5,10,8,5,P['ink'])
    i.rect(6,11,6,2,P['visor'])
    i.rect(7,18,4,1,P['lamp'])
    i.line(6,7,4,1,P['metal_l'])
    i.line(11,7,14,2,P['metal_l'])
    i.rect(2,21,14,2,P['hull'])
    i.outline(P['ink'])
    return i


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    tiles = {
        "tile_grass": tile_grass(),
        "tile_grass_left": tile_grass(),
        "tile_dirt": tile_dirt(),
        "tile_stone": tile_stone(),
        "tile_metal": tile_metal(),
        "tile_platform": tile_platform(),
        "tile_grass_platform": tile_grass_platform(),
        "tile_water": tile_water(True),
        "tile_water_deep": tile_water(False),
        "tile_crystal": tile_crystal(),
        "tile_ancient": tile_ancient(),
        "tile_ancient_rune": tile_ancient_rune(),
        "tile_vent": tile_vent(),
        "tile_grass_tuft": tile_grass_tuft(),
        "tile_plate": tile_plate(False),
        "tile_plate_on": tile_plate(True),
        "spr_rock": sprite_rock(),
        "spr_plant": sprite_plant(),
        "spr_crystal": sprite_crystal_deco(),
    }
    for name, img in tiles.items():
        img.save(name)

    # six pilot sets: EVA and flight suit, in the three shell colours Options
    # offers. Set prefixes are p / pB / pC and c / cB / cC.
    FRAMES = ["idle0", "idle1", "walk0", "walk1", "walk2", "walk3", "jump", "sneak"]
    player = {}
    for variant in ("", "B", "C"):
        for frame in FRAMES:
            player[f"p{variant}_{frame}"] = astronaut(frame, suited=True, variant=variant)
            player[f"c{variant}_{frame}"] = astronaut(frame, suited=False, variant=variant)
    for name, img in player.items():
        img.save(name)

    sprites = {
        # the pilot sets own the c_ prefix, so the creeper is cr_
        "cr_walk0": creeper("walk0"),
        "cr_walk1": creeper("walk1"),
        "cr_walk2": creeper("walk2"),
        "cr_walk3": creeper("walk3"),
        "cr_snap": creeper("alert"),
        "b_fly0": bird("fly0"),
        "b_fly1": bird("fly1"),
        "b_swoop": bird("alert"),
        "spr_moria": moria_body(),
        "spr_orb": soul_orb(),
        "spr_shard": shard(),
        "spr_fuel": fuel_cell(),
        "spr_part": pod_part(),
        "spr_block": sprite_block(),
        "spr_door": sprite_door(False),
        "spr_beacon": sprite_beacon(False),
        "spr_beacon_on": sprite_beacon(True),
        "spr_ship": ship(True),
        "spr_ship_fly": ship(False),
        "spr_seam": material_seam(),
        "spr_transmission": transmission(),
        "spr_cryo_pod": cryo_pod(),
        "spr_nav_console": nav_console(),
        "spr_terminal": save_terminal(),
        "spr_cryo_tank": cryo_tank(),
        "spr_galley": galley(),
        "spr_fabricator": fabricator(),
        "spr_crate": supply_crate(),
        "spr_lab": lab_bench(),
        "spr_pod": escape_pod(False),
        "spr_pod_open": escape_pod(True),
        "spr_plant_guard": grabber_plant(False),
        "spr_plant_guard_open": grabber_plant(True),
        "spr_proc_purify": processor("purify"),
        "spr_proc_smelt": processor("smelt"),
        "spr_proc_melt": processor("melt"),
        "spr_biomass": biomass(),
        "spr_ore": rare_earth(),
        "spr_cryo": cryo_crystal(),
        "spr_ration": ration_pack(),
        "spr_plate": alloy_plate(),
        "spr_coolant": coolant_flask(),
        "spr_ast_s": asteroid(16),
        "spr_ast_m": asteroid(24),
        "spr_ast_l": asteroid(34),
        "spr_bubble": speech_bubble(),
    }
    for name, img in sprites.items():
        img.save(name)
    ui_icons()
    for theme in ('jungle','ruins','ice','metal','space'):
        background_layers(theme)

    # contact sheet for review
    files = sorted(p for p in OUT.glob("*.png") if not p.stem.startswith('bg_'))
    scale = 4
    pad = 10
    cols = 6
    cell_w = 180
    cell_h = 180
    import math

    rows = math.ceil(len(files) / cols)
    sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), (24, 22, 34))
    from PIL import ImageDraw

    draw = ImageDraw.Draw(sheet)
    for idx, path in enumerate(files):
        img = Image.open(path).convert("RGBA")
        fit = min(scale, (cell_w - pad * 2) / img.width, (cell_h - pad * 2 - 18) / img.height)
        img = img.resize((round(img.width * fit), round(img.height * fit)), Image.Resampling.NEAREST)
        x = (idx % cols) * cell_w + pad
        y = (idx // cols) * cell_h + pad
        sheet.paste(img, (x, y), img)
        draw.text((x, y + img.height + 4), path.stem, fill=(200, 210, 230))
    sheet.save(ROOT / "art" / "contact_sheet.png")
    print(f"wrote {len(files)} assets to {OUT}")


if __name__ == "__main__":
    main()
