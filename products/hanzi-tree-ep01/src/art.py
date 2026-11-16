# -*- coding: utf-8 -*-
"""Drawing toolkit: fonts, cached text, shapes, easing, the hanzi tree map, chrome."""
import math
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
FPS = 30


def _pick(cands, fallback):
    for p in cands:
        if p and os.path.exists(os.path.expandvars(p)):
            return os.path.expandvars(p)
    return fallback


# Noto Sans SC / Source Han Sans preferred (commercial-safe); Microsoft YaHei is the
# installed fallback on this machine.  Override with HZ_FONT / HZ_FONT_BD.
FONT_FILE = _pick([
    os.environ.get("HZ_FONT"),
    r"C:\Windows\Fonts\NotoSansSC-Regular.otf",
    r"%LOCALAPPDATA%\Microsoft\Windows\Fonts\NotoSansSC-Regular.otf",
    r"C:\Windows\Fonts\SourceHanSansSC-Regular.otf",
], r"C:\Windows\Fonts\msyh.ttc")
FONT_FILE_BD = _pick([
    os.environ.get("HZ_FONT_BD"),
    r"C:\Windows\Fonts\NotoSansSC-Bold.otf",
    r"%LOCALAPPDATA%\Microsoft\Windows\Fonts\NotoSansSC-Bold.otf",
    r"C:\Windows\Fonts\SourceHanSansSC-Bold.otf",
], r"C:\Windows\Fonts\msyhbd.ttc")

WHITE = (255, 255, 255)
INK = (26, 35, 50)
INK2 = (70, 82, 102)
MUTED = (140, 150, 168)
DIM = (198, 205, 216)
LINE = (228, 233, 241)
CARD = (248, 250, 253)
AMBER = (196, 124, 26)
AMBER_BG = (255, 247, 230)
GREEN = (52, 148, 106)
GREEN_BG = (237, 249, 242)

PALETTE = {
    "water": (73, 158, 214),
    "sun": (232, 168, 42),
    "heart": (223, 88, 84),
    "speech": (60, 163, 118),
    "eye": (140, 104, 208),
    "insect": (234, 128, 52),
    "rice": (163, 122, 86),
}


def mix(c1, c2, t):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(3))


PAL_SOFT = {k: mix(v, WHITE, 0.88) for k, v in PALETTE.items()}
PAL_TINT = {k: mix(v, WHITE, 0.72) for k, v in PALETTE.items()}

# ---------------------------------------------------------------- fonts
_fonts = {}


def font(size, bold=False):
    key = (size, bold)
    f = _fonts.get(key)
    if f is None:
        f = ImageFont.truetype(FONT_FILE_BD if bold else FONT_FILE, size)
        _fonts[key] = f
    return f


_tcache = {}


def text_img(s, size, color, bold=False):
    """Cached RGBA tile of a rendered string."""
    key = (s, size, color, bold)
    im = _tcache.get(key)
    if im is None:
        f = font(size, bold)
        bb = f.getbbox(s)
        w = max(1, int(math.ceil(f.getlength(s))) + 6)
        h = max(1, bb[3] - bb[1] + 6)
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((2 - bb[0], 2 - bb[1]), s, font=f, fill=color + (255,))
        if len(_tcache) > 4000:
            _tcache.clear()
        _tcache[key] = im
    return im


def text_w(s, size, bold=False):
    return font(size, bold).getlength(s)


def draw_text(base, s, x, y, size, color, bold=False, anchor="lt", alpha=1.0):
    """anchor: l/c/r + t/m/b  (e.g. 'cm' = center-middle, 'lm', 'rm', 'lt', 'ct')"""
    if not s:
        return
    img = text_img(s, size, color, bold)
    w, h = img.size
    ax = {"l": 0.0, "c": 0.5, "r": 1.0}[anchor[0]]
    ay = {"t": 0.0, "m": 0.5, "b": 1.0}[anchor[1]]
    px = int(round(x - w * ax))
    py = int(round(y - h * ay))
    if alpha >= 0.999:
        base.paste(img, (px, py), img)
    else:
        a = img.split()[3].point(lambda v: int(v * alpha))
        base.paste(img, (px, py), a)


def rrect(d, box, r, fill=None, outline=None, width=2):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def chip(base, d, x, y, s, size, fg, bg, pad_x=18, pad_y=10, bold=True, radius=None):
    """Draw a rounded pill sized to the text, return (width, height)."""
    tw = text_w(s, size, bold)
    h = int(size * 1.5) + pad_y
    r = radius if radius is not None else h // 2
    d.rounded_rectangle((x, y, x + tw + pad_x * 2, y + h), radius=r, fill=bg)
    draw_text(base, s, x + pad_x, y + h / 2 + 1, size, fg, bold, anchor="lm")
    return int(tw + pad_x * 2), h


# ---------------------------------------------------------------- easing
def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def ease_out_cubic(t):
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_out_quint(t):
    t = clamp(t)
    return 1 - (1 - t) ** 5


def ease_in_out(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def ease_out_back(t, s=1.9):
    t = clamp(t)
    return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2


# ---------------------------------------------------------------- curves
def qbez(p0, p1, p2, n=48):
    pts = []
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        pts.append((x, y))
    return pts


def partial_path(pts, frac):
    if frac >= 1:
        return pts
    if frac <= 0:
        return []
    seg = []
    total = 0.0
    for i in range(1, len(pts)):
        total += math.dist(pts[i - 1], pts[i])
    target = total * frac
    acc = 0.0
    seg.append(pts[0])
    for i in range(1, len(pts)):
        d = math.dist(pts[i - 1], pts[i])
        if acc + d >= target:
            k = (target - acc) / d if d else 0
            seg.append((pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k,
                        pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k))
            break
        acc += d
        seg.append(pts[i])
    return seg


def dashed(d, pts, color, width=3, dash=16, gap=13):
    """Draw a dashed polyline along an already-sampled path."""
    on = True
    left = dash
    prev = pts[0]
    for p in pts[1:]:
        seg = math.dist(prev, p)
        cur = prev
        while seg > 0:
            step = min(left, seg)
            k = step / seg
            nxt = (cur[0] + (p[0] - cur[0]) * k, cur[1] + (p[1] - cur[1]) * k)
            if on:
                d.line([cur, nxt], fill=color, width=width)
            cur = nxt
            seg -= step
            left -= step
            if left <= 1e-6:
                on = not on
                left = dash if on else gap
        prev = p


# ---------------------------------------------------------------- tree map (left column)
HUB = (326, 540)
HUB_R = 112
NODE_R = 44
MAP_R = 330
NODE_ANGLES = [-70 + i * (140 / 6) for i in range(7)]


def node_pos(i):
    a = math.radians(NODE_ANGLES[i])
    return (HUB[0] + MAP_R * math.cos(a), HUB[1] + MAP_R * math.sin(a))


def branch_path(i):
    p2 = node_pos(i)
    a = math.radians(NODE_ANGLES[i])
    ux, uy = math.cos(a), math.sin(a)
    p0 = (HUB[0] + ux * HUB_R, HUB[1] + uy * HUB_R)
    q = (p2[0] - ux * (NODE_R + 4), p2[1] - uy * (NODE_R + 4))
    mid = ((p0[0] + q[0]) / 2, (p0[1] + q[1]) / 2)
    perp = (-uy, ux)
    bend = 26 if i % 2 == 0 else -18
    ctrl = (mid[0] + perp[0] * bend, mid[1] + perp[1] * bend)
    return qbez(p0, ctrl, q, 40)


def draw_tree(base, d, branches, states, active_prog=1.0, pulse=0.0, show_hub_label=True):
    """states: list of 'pending' | 'active' | 'done' per branch index."""
    # branches first (behind nodes)
    for b in branches:
        i = b["idx"]
        col = PALETTE[b["color"]]
        pts = branch_path(i)
        st = states[i]
        if st == "pending":
            dashed(d, pts, DIM, width=3, dash=14, gap=12)
        elif st == "active":
            seg = partial_path(pts, active_prog)
            if len(seg) > 1:
                d.line(seg, fill=col, width=6, joint="curve")
                if active_prog < 1:
                    tip = seg[-1]
                    d.ellipse((tip[0] - 7, tip[1] - 7, tip[0] + 7, tip[1] + 7), fill=col)
        else:
            d.line(pts, fill=col, width=6, joint="curve")

    # nodes
    for b in branches:
        i = b["idx"]
        col = PALETTE[b["color"]]
        cx, cy = node_pos(i)
        st = states[i]
        if st == "pending":
            d.ellipse((cx - NODE_R, cy - NODE_R, cx + NODE_R, cy + NODE_R),
                      fill=WHITE, outline=DIM, width=3)
            draw_text(base, b["ch"], cx, cy + 2, 44, (206, 212, 222), True, anchor="cm")
        elif st == "active":
            scale = 0.55 + 0.45 * ease_out_back(active_prog)
            r = NODE_R * scale
            if pulse > 0:
                rr = NODE_R + 7 + 9 * pulse
                d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=PAL_TINT[b["color"]], width=4)
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=PAL_SOFT[b["color"]], outline=col, width=4)
            draw_text(base, b["ch"], cx, cy + 2, int(44 * scale), col, True, anchor="cm")
        else:
            d.ellipse((cx - NODE_R, cy - NODE_R, cx + NODE_R, cy + NODE_R),
                      fill=col, outline=WHITE, width=3)
            draw_text(base, b["ch"], cx, cy + 2, 44, WHITE, True, anchor="cm")

    # hub
    d.ellipse((HUB[0] - HUB_R, HUB[1] - HUB_R, HUB[0] + HUB_R, HUB[1] + HUB_R),
              fill=(246, 249, 253), outline=INK, width=4)
    draw_text(base, "青", HUB[0], HUB[1] - 4, 132, INK, True, anchor="cm")
    if show_hub_label:
        draw_text(base, "qīng", HUB[0], HUB[1] + HUB_R + 34, 30, MUTED, False, anchor="cm")


def tree_states(active_idx, active_prog):
    """Which branches are lit for a given point in the episode."""
    if active_idx is None:
        return ["pending"] * 7, None, 1.0
    states = []
    for i in range(7):
        if i < active_idx:
            states.append("done")
        elif i == active_idx:
            states.append("active")
        else:
            states.append("pending")
    prog = 1.0 if active_prog >= 1 else ease_out_quint(active_prog)
    return states, active_idx, prog


# ---------------------------------------------------------------- chrome
def draw_header(base, d, episode="EP.01", char="青"):
    draw_text(base, "汉字树", 100, 52, 34, INK, True, anchor="lm")
    draw_text(base, "Hanzi Tree", 100 + text_w("汉字树", 34, True) + 18, 54, 28, MUTED, False, anchor="lm")
    lbl = f"{episode} · {char}"
    draw_text(base, lbl, W - 100, 53, 28, MUTED, False, anchor="rm")
    d.line((100, 96, W - 100, 96), fill=LINE, width=2)


def draw_progress(base, d, done, total=7):
    """Tiny 7-dot progress trail under the header, right aligned."""
    x1 = W - 100
    for k in range(total):
        x = x1 - (total - 1 - k) * 22
        if k < done:
            d.ellipse((x - 6, 116 - 6, x + 6, 116 + 6), fill=INK)
        else:
            d.ellipse((x - 6, 116 - 6, x + 6, 116 + 6), fill=(236, 240, 246))


SUB_CN_Y = 930
SUB_EN_Y = 986


def draw_subtitle(base, d, cn, en, alpha=1.0, cn_color=INK, en_color=INK2):
    if alpha <= 0.01:
        return
    if cn:
        draw_text(base, cn, W // 2, SUB_CN_Y, 40, cn_color, True, anchor="ct", alpha=alpha)
    if en:
        draw_text(base, en, W // 2, SUB_EN_Y, 31, en_color, False, anchor="ct", alpha=alpha)


def base_frame():
    im = Image.new("RGB", (W, H), WHITE)
    return im, ImageDraw.Draw(im)
