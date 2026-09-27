"""Generates Hexcairn's original launcher icons, adaptive foreground, splash images and store icons.
Art: a small cairn of stacked hex prisms (2.5D) in gem colours on a dark plum background. Pure Pillow.
Run: python3 assets/make_icon.py
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

S = 1024
BG_TOP, BG_BOT = (48, 32, 70), (14, 11, 22)
SPLASH = (18, 15, 26)   # #120F1A
TILT = 0.78
COL = {
    'red': (232, 56, 79), 'orange': (242, 140, 40), 'yellow': (245, 201, 58), 'green': (53, 196, 106),
    'teal': (31, 184, 176), 'blue': (58, 120, 242), 'purple': (154, 85, 232), 'pink': (239, 111, 179),
}
# (q, r, [colours bottom->top]) - drawn back to front
STACKS = [
    (0, -1, ['teal', 'teal', 'purple', 'purple', 'purple']),
    (-1, 0, ['red', 'red', 'red', 'red']),
    (1, -1, ['yellow', 'yellow', 'yellow']),
    (0, 0, ['green', 'blue', 'blue', 'blue', 'blue', 'blue', 'blue', 'blue']),
    (1, 0, ['pink', 'orange', 'orange']),
    (-1, 1, ['blue', 'green', 'green', 'green']),
    (0, 1, ['purple', 'red', 'red']),
]


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def shade(c, f):
    return tuple(int(v + (255 - v) * f) if f >= 0 else int(v * (1 + f)) for v in c)


def vgrad(w, h, top, bot):
    im = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(im)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(top, bot, y / max(1, h - 1)))
    return im


def background(size):
    im = vgrad(size, size, BG_TOP, BG_BOT)
    glow = Image.new('L', (size, size), 0)
    ImageDraw.Draw(glow).ellipse([size * 0.1, -size * 0.2, size * 0.9, size * 0.6], fill=100)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.08))
    im.paste(Image.new('RGB', (size, size), (130, 90, 180)), (0, 0), glow)
    return im


def hexpts(x, y, s):
    return [(x + s * math.cos(math.radians(60 * k + 30)), y + s * math.sin(math.radians(60 * k + 30)) * TILT) for k in range(6)]


def tile(d, x, y, s, t, c, top=True):
    hx, hy = s * math.sqrt(3) / 2, s * TILT
    d.polygon([(x - hx, y + hy / 2), (x, y + hy), (x, y + hy + t), (x - hx, y + hy / 2 + t)], fill=shade(c, -0.42))
    d.polygon([(x, y + hy), (x + hx, y + hy / 2), (x + hx, y + hy / 2 + t), (x, y + hy + t)], fill=shade(c, -0.28))
    d.line([(x - hx, y + hy / 2 + t), (x, y + hy + t), (x + hx, y + hy / 2 + t)], fill=shade(c, -0.55), width=max(1, int(s * 0.03)))
    d.polygon(hexpts(x, y, s), fill=c)
    if top:
        # lighter upper-left half of the top face
        pts = hexpts(x, y, s)
        d.polygon([pts[3], pts[4], pts[5], (x, y)], fill=shade(c, 0.18))
        d.polygon(hexpts(x, y - s * 0.02, s * 0.56), fill=shade(c, 0.28))
        d.line(pts + [pts[0]], fill=shade(c, 0.45), width=max(1, int(s * 0.045)))


def draw_art(canvas, scale):
    """Draw the cairn centred on an RGBA canvas; scale = art width / canvas width."""
    W = canvas.size[0]
    s = W * scale / (3 * math.sqrt(3))  # three hexes across
    t = s * 0.26
    cx, cy = W / 2, W / 2 + s * 1.05
    shadow = Image.new('L', canvas.size, 0)
    sd = ImageDraw.Draw(shadow)
    for q, r, cols in STACKS:
        x = cx + s * math.sqrt(3) * (q + r / 2)
        y = cy + s * 1.5 * r * TILT
        sd.ellipse([x - s * 0.95 + s * 0.2, y - s * 0.55 + s * 0.3, x + s * 0.95 + s * 0.2, y + s * 0.55 + s * 0.3], fill=150)
    canvas.paste(Image.new('RGBA', canvas.size, (0, 0, 0, 255)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(s * 0.18)))
    d = ImageDraw.Draw(canvas)
    for q, r, cols in STACKS:
        x = cx + s * math.sqrt(3) * (q + r / 2)
        y = cy + s * 1.5 * r * TILT
        for k, name in enumerate(cols):
            last = k == len(cols) - 1
            tile(d, x, y - (k + 1) * t, s * 0.92, t, COL[name], top=last or cols[k + 1] != name)


def rounded_mask(size, r):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], r, fill=255)
    return m


def main():
    root = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(root)
    res = os.path.join(repo, 'android/app/src/main/res')
    big = 2048
    full = background(big).convert('RGBA')
    draw_art(full, 0.64)
    full = full.convert('RGB').resize((S, S), Image.LANCZOS)
    full.save(os.path.join(root, 'icon-full.png'))
    for out in [os.path.join(root, 'play-store-icon-512.png'), os.path.join(repo, 'www/icon.png'), os.path.join(repo, 'store/icon-512.png')]:
        os.makedirs(os.path.dirname(out), exist_ok=True)
        full.resize((512, 512), Image.LANCZOS).save(out)
    fg = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw_art(fg, 0.5)
    fg = fg.resize((432, 432), Image.LANCZOS)
    sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    fsizes = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
    for dens, px in sizes.items():
        d = os.path.join(res, 'mipmap-' + dens)
        sq = full.resize((px, px), Image.LANCZOS)
        out = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        out.paste(sq, (0, 0), rounded_mask(px, int(px * 0.18)))
        out.save(os.path.join(d, 'ic_launcher.png'))
        rnd = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        cm = Image.new('L', (px, px), 0)
        ImageDraw.Draw(cm).ellipse([0, 0, px - 1, px - 1], fill=255)
        rnd.paste(sq, (0, 0), cm)
        rnd.save(os.path.join(d, 'ic_launcher_round.png'))
        fg.resize((fsizes[dens], fsizes[dens]), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_foreground.png'))
    splash_sizes = {
        'drawable': (480, 320),
        'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480), 'drawable-land-xhdpi': (1280, 720),
        'drawable-land-xxhdpi': (1600, 960), 'drawable-land-xxxhdpi': (1920, 1280),
        'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800), 'drawable-port-xhdpi': (720, 1280),
        'drawable-port-xxhdpi': (960, 1600), 'drawable-port-xxxhdpi': (1280, 1920),
    }
    logo = Image.new('RGBA', (big, big), SPLASH + (255,))
    draw_art(logo, 0.62)
    logo = logo.convert('RGB')
    for folder, (w, h) in splash_sizes.items():
        im = Image.new('RGB', (w, h), SPLASH)
        side = int(min(w, h) * 0.6)
        im.paste(logo.resize((side, side), Image.LANCZOS), ((w - side) // 2, (h - side) // 2))
        im.save(os.path.join(res, folder, 'splash.png'))
    print('icons + splash written')


if __name__ == '__main__':
    main()
