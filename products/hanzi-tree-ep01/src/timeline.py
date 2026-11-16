# -*- coding: utf-8 -*-
"""Timeline: beat durations (from real TTS audio when available), scene layout, SRT."""
import json
import os
import re

PUNCT = set("，。、；：？！「」“”‘’（）…—·,.!?;:'\"()")


def _tokens_cn(s):
    return [c for c in s if c not in PUNCT and not c.isspace()]


def _tokens_en(s):
    return [w for w in re.split(r"\s+", s.strip()) if w]


def est_cn(s):
    n = len(_tokens_cn(s))
    return 0.55 + n / 5.1 if n else 0.0


def est_en(s):
    n = len(_tokens_en(s))
    return 0.5 + n / 3.1 if n else 0.0


def load_tts(path):
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build(scenes, tts=None, pace=0.72, tail=1.8):
    """Return timeline dict with absolute timings."""
    tts = tts or {}
    out = {"scenes": [], "audio_events": [], "pop_events": [], "total": 0.0}
    cursor = 0.0

    for sc in scenes:
        n = len(sc["beats"])
        durs, gaps = [], []
        for bi, beat in enumerate(sc["beats"]):
            key_cn = f"{sc['id']}:{bi}:cn"
            key_en = f"{sc['id']}:{bi}:en"
            cn_d = tts.get(key_cn, est_cn(beat.get("cn", "")))
            en_d = tts.get(key_en, est_en(beat.get("en", "")))
            speech = cn_d + en_d
            pause = float(beat.get("pause", 0.0))
            durs.append(speech + pause if speech > 0 else max(pause, 0.4))
            gaps.append(0.0)

        speech_total = sum(durs)
        dur = max(sc["planned"] * pace, speech_total + tail)

        # spread leftover time evenly as breathing room between sentences
        surplus = dur - tail - speech_total
        if surplus > 0 and n:
            for i in range(n):
                gaps[i] = surplus / n

        beat_starts, wins = [], []
        t = 0.0
        for i in range(n):
            beat_starts.append(t)
            wins.append((t, t + durs[i] + gaps[i]))
            t += durs[i] + gaps[i]
        # if the visual hold needs to be longer than the beats, stretch the last window
        if t < dur:
            wins[-1] = (wins[-1][0], dur)

        # audio placement (speech starts at the beat start)
        for bi, beat in enumerate(sc["beats"]):
            key_cn = f"{sc['id']}:{bi}:cn"
            key_en = f"{sc['id']}:{bi}:en"
            t0 = cursor + beat_starts[bi]
            if key_cn in tts:
                out["audio_events"].append((t0, key_cn))
            if key_en in tts:
                out["audio_events"].append(
                    (t0 + tts.get(key_cn, est_cn(beat.get("cn", ""))) + 0.12, key_en))

        entry = dict(id=sc["id"], kind=sc["kind"], branch=sc.get("branch"),
                     start=cursor, dur=dur, beat_starts=beat_starts,
                     wins=wins, beats=sc["beats"])
        out["scenes"].append(entry)

        if sc["kind"] == "branch":
            out["pop_events"].append(cursor + 1.05)
        if sc["kind"] in ("qing", "hook"):
            pass
        cursor += dur

    out["total"] = cursor
    out["pop_events"].append(cursor - 0.4)
    return out


def find_scene(tl, t):
    for i, sc in enumerate(tl["scenes"]):
        if t < sc["start"] + sc["dur"]:
            return i, sc
    sc = tl["scenes"][-1]
    return len(tl["scenes"]) - 1, sc


def sub_text(sc, t_local):
    """Current subtitle pair + fade alpha."""
    best = None
    for i, (a, b) in enumerate(sc["wins"]):
        if a <= t_local < b:
            best = i
            break
    if best is None:
        best = len(sc["wins"]) - 1 if t_local >= sc["wins"][-1][1] else 0
    beat = sc["beats"][best]
    a, b = sc["wins"][best]
    fade_in = min(1.0, (t_local - a) / 0.22) if t_local >= a else 0.0
    fade_out = min(1.0, (b - t_local) / 0.18) if b > a else 1.0
    alpha = max(0.0, min(fade_in, fade_out))
    return beat.get("cn", ""), beat.get("en", ""), alpha


def srt_time(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(tl, path):
    lines = []
    idx = 1
    for sc in tl["scenes"]:
        for i, beat in enumerate(sc["beats"]):
            cn, en = beat.get("cn", ""), beat.get("en", "")
            if not cn and not en:
                continue
            a, b = sc["wins"][i]
            start, end = sc["start"] + a, sc["start"] + b
            lines.append(str(idx))
            lines.append(f"{srt_time(start)} --> {srt_time(end)}")
            if cn:
                lines.append(cn)
            if en:
                lines.append(en)
            lines.append("")
            idx += 1
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return idx - 1
