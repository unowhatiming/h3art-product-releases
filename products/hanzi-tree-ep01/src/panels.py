# -*- coding: utf-8 -*-
"""Right-hand content panels, one renderer per scene kind."""
from art import (
    W, H, INK, INK2, MUTED, DIM, LINE, CARD, WHITE, AMBER, AMBER_BG, GREEN, GREEN_BG,
    PALETTE, PAL_SOFT, PAL_TINT, draw_text, text_w, clamp, ease_out_cubic, rrect,
    chip, mix,
)
from content import BRANCHES

PX = 780            # panel left edge
PW = 1010           # panel width  -> right edge 1790
PB = 915            # panel bottom


def rv(beats, t, stage, dur=0.5):
    """Reveal progress for an element that appears at the start of beat `stage`."""
    if not beats:
        return 1.0
    st = beats[min(stage, len(beats) - 1)]
    return clamp((t - st) / dur)


def rtext(base, s, x, y, size, color, bold=False, anchor="lt", p=1.0, rise=18):
    if p <= 0.02 or not s:
        return
    e = ease_out_cubic(p)
    draw_text(base, s, x, y + (1 - e) * rise, size, color, bold, anchor, alpha=e)


def accent_bar(d, col, y0=150, y1=900):
    d.rounded_rectangle((PX - 30, y0, PX - 20, y1), radius=5, fill=col)


def label(base, x, y, cn, en, color=MUTED):
    draw_text(base, cn, x, y, 25, color, True, anchor="lm")
    if en:
        draw_text(base, en, x + text_w(cn, 25, True) + 12, y, 23, DIM, False, anchor="lm")


# ------------------------------------------------------------------ BRANCH
def panel_branch(base, d, b, t, beats):
    col = PALETTE[b["color"]]
    soft = PAL_SOFT[b["color"]]
    accent_bar(d, col)

    # --- label row
    p = rv(beats, t, 0)
    e = ease_out_cubic(p)
    d.ellipse((PX + 2, 156, PX + 20, 174), fill=col)
    rtext(base, f"分支 {b['idx'] + 1:02d} / 07", PX + 32, 155, 26, MUTED, True, "lm", p)
    sep_x = PX + 32 + text_w(f"分支 {b['idx'] + 1:02d} / 07", 26, True) + 16
    rtext(base, "·", sep_x, 155, 26, DIM, False, "lm", p)
    rtext(base, f"{b['rad_cn']} {b['rad_en']}", sep_x + 22, 155, 26, col, True, "lm", p)

    # --- formula  氵 + 青 = 清
    x = PX + 2
    y = 190
    for s, size, c, bd, gap in (
        (b["rad"], 42, col, True, 14),
        ("+", 34, MUTED, False, 14),
        ("青", 42, INK, True, 14),
        ("=", 34, MUTED, False, 14),
        (b["ch"], 42, col, True, 0),
    ):
        rtext(base, s, x, y, size, c, bd, "lt", p, rise=12)
        x += text_w(s, size, bd) + gap

    # --- big character
    p0 = rv(beats, t, 0)
    rtext(base, b["ch"], PX + 6, 244, 186, INK, True, "lt", p0, rise=22)
    rtext(base, b["pinyin"], PX + 226, 300, 78, col, True, "lt", p0, rise=22)

    # --- english meaning
    p1 = rv(beats, t, 1)
    rtext(base, b["en"], PX + 226, 396, 46, INK2, False, "lt", p1, rise=16)

    # --- divider
    if p1 > 0.6:
        d.line((PX, 476, PX + PW - 20, 476), fill=LINE, width=2)

    # --- radical block
    label(base, PX + 2, 516, "偏旁", "RADICAL")
    p2 = rv(beats, t, 0)
    rtext(base, b["rad"], PX + 2, 548, 62, col, True, "lt", p2, rise=14)
    rtext(base, b["rad_cn"], PX + 96, 556, 40, INK, True, "lt", p2, rise=14)
    rtext(base, f"= {b['rad_en']}", PX + 96 + text_w(b["rad_cn"], 40, True) + 14, 562, 34, col, False, "lt", p2, rise=14)
    rtext(base, b["rad_note"], PX + 96, 606, 31, MUTED, False, "lt", p2, rise=14)

    # --- common word block
    p3 = rv(beats, t, 2)
    label(base, PX + 2, 660, "常用词", "COMMON WORD")
    rtext(base, b["word"], PX + 2, 688, 80, INK, True, "lt", p3, rise=18)
    ww = text_w(b["word"], 80, True)
    rtext(base, b["word_py"], PX + 22 + ww, 716, 33, col, False, "lm", p3, rise=18)
    rtext(base, b["word_en"], PX + 2, 780, 36, INK2, False, "lt", p3, rise=18)

    # --- note box
    p4 = rv(beats, t, 3, 0.6)
    if b["note_kind"] == "tone":
        bg, fg = AMBER_BG, AMBER
    elif b["note_kind"] == "meaning":
        bg, fg = AMBER_BG, AMBER
    else:
        bg, fg = GREEN_BG, GREEN
    box = (PX + 2, 816, PX + PW - 24, 894)
    d.rounded_rectangle(box, radius=14, fill=mix(WHITE, bg, ease_out_cubic(p4)))
    if p4 > 0.25:
        nx = PX + 24
        draw_text(base, "!", nx, 855, 30, fg, True, "lm", alpha=ease_out_cubic(p4))
        draw_text(base, b["note"], nx + 26, 855, 31, fg, True, "lm", alpha=ease_out_cubic(p4))


# ------------------------------------------------------------------ HOOK
def panel_hook(base, d, t, beats):
    accent_bar(d, INK)
    p = rv(beats, t, 0)
    label(base, PX + 2, 156, "第一集", "EPISODE 01")

    rtext(base, "青", PX + 4, 214, 250, INK, True, "lt", p, rise=26)
    rtext(base, "qīng", PX + 4, 500, 66, MUTED, False, "lt", rv(beats, t, 0, 0.8), rise=18)

    p1 = rv(beats, t, 0, 0.7)
    rtext(base, "一个汉字", PX + 330, 250, 54, INK2, False, "lt", p1, rise=18)
    p2 = rv(beats, t, 1)
    rtext(base, "长出七个常用字", PX + 330, 330, 76, INK, True, "lt", p2, rise=20)

    p3 = rv(beats, t, 1, 0.6)
    if p3 > 0.02:
        a = ease_out_cubic(p3)
        d.rounded_rectangle((PX + 330, 460, PX + 330 + 620, 460 + 96), radius=16, fill=mix(WHITE, CARD, a))
        draw_text(base, "清  晴  情  请  睛  蜻  精", PX + 358, 508, 34, MUTED, False, "lm", alpha=a)

    p4 = rv(beats, t, 1, 0.9)
    rtext(base, "6 分钟 · 只讲一个字", PX + 330, 600, 30, DIM, False, "lt", p4, rise=14)

    # bottom: the question
    p5 = rv(beats, t, 1, 1.1)
    rtext(base, "不背字。看它怎么长成一棵树。", PX + 4, 700, 44, INK2, False, "lt", p5, rise=16)


# ------------------------------------------------------------------ QING card
def panel_qing(base, d, t, beats):
    accent_bar(d, INK)
    label(base, PX + 2, 156, "母体字", "THE MOTHER CHARACTER")
    p = rv(beats, t, 0)
    rtext(base, "青", PX + 2, 200, 250, INK, True, "lt", p, rise=26)
    rtext(base, "qīng", PX + 300, 250, 80, INK, True, "lt", p, rise=22)
    p1 = rv(beats, t, 1)
    rtext(base, "blue-green / young", PX + 300, 356, 44, INK2, False, "lt", p1, rise=16)

    if p1 > 0.5:
        d.line((PX, 486, PX + PW - 20, 486), fill=LINE, width=2)

    p2 = rv(beats, t, 1, 0.7)
    rtext(base, "蓝绿色", PX + 2, 520, 56, INK, True, "lt", p2, rise=16)
    rtext(base, "blue-green · 青山 qīngshān, green mountains", PX + 190, 534, 33, MUTED, False, "lt", p2, rise=16)

    p3 = rv(beats, t, 1, 1.0)
    rtext(base, "年轻", PX + 2, 626, 56, INK, True, "lt", p3, rise=16)
    rtext(base, "young · 青年 qīngnián, youth", PX + 190, 640, 33, MUTED, False, "lt", p3, rise=16)

    p4 = rv(beats, t, 2, 0.7)
    if p4 > 0.02:
        a = ease_out_cubic(p4)
        d.rounded_rectangle((PX + 2, 760, PX + PW - 24, 838), radius=14, fill=mix(WHITE, CARD, a))
        draw_text(base, "母体字：加一个偏旁，就长出一个新字。", PX + 30, 800, 34, INK2, False, "lm", alpha=a)


# ------------------------------------------------------------------ PATTERN
def panel_pattern(base, d, t, beats):
    accent_bar(d, INK)
    label(base, PX + 2, 156, "规律", "THE PATTERN")

    rows = [
        ("偏旁 → 猜意思", "The radical tells you what the character is about.", beats[0],
         PALETTE["water"]),
        ("青 → 提示读音", "But the tone can change — sometimes the first sound too.", beats[1],
         PALETTE["heart"]),
        ("规律是地图，不是公式", "A map, not a formula.", beats[2],
         PALETTE["speech"]),
    ]
    y = 196
    for i, (cn, en, st, col) in enumerate(rows):
        p = clamp((t - st) / 0.6)
        if p > 0.02:
            a = ease_out_cubic(p)
            draw_text(base, cn, PX + 26, y + (1 - a) * 16, 58, col, True, "lt", alpha=a)
            draw_text(base, en, PX + 28, y + 74 + (1 - a) * 16, 32, INK2, False, "lt", alpha=a)
            d.ellipse((PX + 2, y + 14, PX + 20, y + 32), fill=mix(WHITE, col, a))
        y += 176

    p = rv(beats, t, 2, 0.7)
    if p > 0.02:
        a = ease_out_cubic(p)
        draw_text(base, "猜完，再用词典确认。", PX + 2, 700, 38, INK, True, "lt", alpha=a)
        draw_text(base, "Guess first, then check a dictionary.", PX + 2 + text_w("猜完，再用词典确认。", 38, True) + 20,
                  706, 28, MUTED, False, "lt", alpha=a)

    # the seven characters, completed
    p = rv(beats, t, 1, 0.8)
    if p > 0.02:
        a = ease_out_cubic(p)
        d.line((PX, 760, PX + PW - 20, 760), fill=LINE, width=2)
        slot = (PW - 20) / 7
        for i, b in enumerate(BRANCHES):
            cx = PX + slot * (i + 0.5)
            col = PALETTE[b["color"]]
            draw_text(base, b["ch"], cx, 790, 62, col, True, "ct", alpha=a)
            draw_text(base, b["pinyin"], cx, 856, 24, MUTED, False, "ct", alpha=a)


# ------------------------------------------------------------------ QUIZ
def _quiz_block(base, d, box, q_cn, ans, ans_py, ans_en, col, q_p, a_p):
    d.rounded_rectangle(box, radius=18, fill=CARD)
    x0, y0, x1, y1 = box
    if q_p > 0.02:
        a = ease_out_cubic(q_p)
        draw_text(base, q_cn, x0 + 44, y0 + 34, 76, INK, True, "lt", alpha=a)
        draw_text(base, "= ?", x0 + 44 + text_w(q_cn, 76, True) + 26, y0 + 46, 60, MUTED, False, "lt", alpha=a)
    if a_p > 0.02:
        a = ease_out_cubic(a_p)
        cy = y1 - 62
        draw_text(base, ans, x0 + 44, cy, 104, col, True, "lm", alpha=a)
        draw_text(base, ans_py, x0 + 44 + text_w(ans, 104, True) + 26, cy - 12, 46, INK, False, "lm", alpha=a)
        draw_text(base, ans_en, x0 + 44 + text_w(ans, 104, True) + 26, cy + 42, 32, MUTED, False, "lm", alpha=a)


def panel_quiz(base, d, t, beats):
    accent_bar(d, PALETTE["speech"])
    label(base, PX + 2, 156, "小测验", "QUIZ")
    d1 = BRANCHES[1]  # 晴
    d0 = BRANCHES[0]  # 清

    q1 = clamp((t - beats[0]) / 0.5)
    a1 = clamp((t - beats[2]) / 0.5) if len(beats) > 2 else 0
    q2 = clamp((t - beats[3]) / 0.5) if len(beats) > 3 else 0
    a2 = clamp((t - beats[5]) / 0.5) if len(beats) > 5 else 0

    _quiz_block(base, d, (PX + 2, 196, PX + PW - 22, 500),
                "青 + 日", d1["ch"], d1["pinyin"], d1["en"], PALETTE[d1["color"]], q1, a1)
    _quiz_block(base, d, (PX + 2, 540, PX + PW - 22, 844),
                "青 + 氵", d0["ch"], d0["pinyin"], d0["en"], PALETTE[d0["color"]], q2, a2)


# ------------------------------------------------------------------ VOTE
def panel_vote(base, d, t, beats):
    accent_bar(d, INK)
    label(base, PX + 2, 156, "下一集", "NEXT EPISODE")

    cards = [
        ("包", "bāo", "包字树", "抱 跑 泡 炮 袍 饱", PALETTE["sun"]),
        ("木", "mù", "木字树", "林 森 枝 根 柱 桌 椅", PALETTE["speech"]),
    ]
    for i, (ch, py, name, kids, col) in enumerate(cards):
        p = clamp((t - beats[0] - i * 0.25) / 0.6)
        if p <= 0.02:
            continue
        a = ease_out_cubic(p)
        x0 = PX + 2 + i * 508
        box = (x0, 196, x0 + 480, 606)
        d.rounded_rectangle(box, radius=22, fill=mix(WHITE, CARD, a), outline=mix(WHITE, LINE, a), width=3)
        draw_text(base, ch, x0 + 240, 236, 170, mix(WHITE, INK, a), True, "ct", alpha=a)
        draw_text(base, py, x0 + 240, 424, 38, mix(WHITE, MUTED, a), False, "ct", alpha=a)
        draw_text(base, name, x0 + 240, 474, 30, mix(WHITE, col, a), True, "ct", alpha=a)
        draw_text(base, kids, x0 + 240, 520, 26, mix(WHITE, MUTED, a), False, "ct", alpha=a)
        d.ellipse((x0 + 240 - 6, 566, x0 + 240 + 6, 578), fill=mix(WHITE, col, a))

    p2 = rv(beats, t, 0, 0.9)
    rtext(base, "评论区投票 · Vote in the comments", PX + 2, 660, 44, INK, True, "lt", p2, rise=16)
    p3 = rv(beats, t, 1, 0.7)
    rtext(base, "订阅「汉字树」，让下一个字长出来", PX + 2, 730, 32, INK2, False, "lt", p3, rise=16)
    rtext(base, "Subscribe — and let the next character grow", PX + 2, 782, 28, MUTED, False, "lt", p3, rise=16)


PANELS = {
    "hook": panel_hook,
    "qing": panel_qing,
    "pattern": panel_pattern,
    "quiz": panel_quiz,
    "vote": panel_vote,
}
