# -*- coding: utf-8 -*-
"""Episode renderer: builds frames with Pillow and pipes them into ffmpeg."""
import argparse
import math
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from PIL import Image

import art
from art import (W, H, FPS, INK, WHITE, draw_tree, tree_states, draw_header,
                 draw_progress, draw_subtitle, base_frame, clamp, PALETTE)
import content
import timeline as TL
from panels import PANELS, panel_branch

OUT = os.path.abspath(os.path.join(HERE, "..", "out"))
TTS_JSON = os.path.join(HERE, "..", "build", "tts.json")


def get_timeline(pace=0.72):
    tts = TL.load_tts(TTS_JSON)
    return TL.build(content.SCENES, tts, pace=pace)


def draw_frame(tl, t):
    base, d = base_frame()
    draw_header(base, d)

    si, sc = TL.find_scene(tl, t)
    t_local = t - sc["start"]
    kind = sc["kind"]

    if kind == "branch":
        b = content.BRANCHES[sc["branch"]]
        growth = clamp(t_local / 1.15)
        states, act, prog = tree_states(b["idx"], growth)
        done = b["idx"] + (1 if growth >= 1 else 0)
        pulse = (0.5 - 0.5 * math.cos(t_local * 2 * math.pi * 0.75)) if growth >= 1 else 0.0
    elif kind in ("pattern", "quiz", "vote"):
        states, prog, pulse, done = ["done"] * 7, 1.0, 0.0, 7
    else:
        states, prog, pulse, done = ["pending"] * 7, 0.0, 0.0, 0

    draw_tree(base, d, content.BRANCHES, states, active_prog=prog, pulse=pulse)
    draw_progress(base, d, done)

    if kind == "branch":
        panel_branch(base, d, content.BRANCHES[sc["branch"]], t_local, sc["beat_starts"])
    else:
        PANELS[kind](base, d, t_local, sc["beat_starts"])

    cn, en, alpha = TL.sub_text(sc, t_local)
    draw_subtitle(base, d, cn, en, alpha)

    # fade in from white at the very start, fade out at the very end
    if t < 0.55:
        base = Image.blend(Image.new("RGB", (W, H), WHITE), base, t / 0.55)
    if t > tl["total"] - 0.7:
        k = (t - (tl["total"] - 0.7)) / 0.7
        base = Image.blend(base, Image.new("RGB", (W, H), WHITE), clamp(k))
    return base


def render_stills(tl, times, outdir):
    os.makedirs(outdir, exist_ok=True)
    for t in times:
        im = draw_frame(tl, t)
        p = os.path.join(outdir, f"still_{t:07.2f}.png".replace(".", "_", 1))
        im.save(p)
        print("still", t, p)


def render_video(tl, out, fps=FPS, crf=18, preset="medium", t0=0.0, t1=None):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    t1 = tl["total"] if t1 is None else min(t1, tl["total"])
    n0, n1 = int(round(t0 * fps)), int(round(t1 * fps))
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
           "-an", "-c:v", "libx264", "-preset", preset, "-crf", str(crf),
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE)
    t_start = time.time()
    total = n1 - n0
    try:
        for f in range(n0, n1):
            im = draw_frame(tl, f / fps)
            proc.stdin.write(im.tobytes())
            if (f - n0) % 300 == 0:
                el = time.time() - t_start
                done = f - n0 + 1
                eta = el / max(done, 1) * (total - done)
                print(f"  frame {done}/{total}  {el:6.1f}s elapsed  eta {eta:6.1f}s", flush=True)
        proc.stdin.close()
    except BrokenPipeError:
        print("ffmpeg closed the pipe early", file=sys.stderr)
    rc = proc.wait()
    if proc.stderr:
        err = proc.stderr.read().decode("utf-8", "ignore").strip()
        if err:
            print(err, file=sys.stderr)
    print(f"done rc={rc} in {time.time() - t_start:.1f}s -> {out}", flush=True)
    return rc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--still", nargs="*", type=float, help="render PNG stills at these times")
    ap.add_argument("--still-dir", default=os.path.join(OUT, "preview"))
    ap.add_argument("--video", default=None)
    ap.add_argument("--srt", default=None)
    ap.add_argument("--fps", type=int, default=FPS)
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--preset", default="medium")
    ap.add_argument("--t0", type=float, default=0.0)
    ap.add_argument("--t1", type=float, default=None)
    ap.add_argument("--pace", type=float, default=0.72)
    ap.add_argument("--info", action="store_true")
    args = ap.parse_args()

    tl = get_timeline(pace=args.pace)
    if args.info:
        print(f"total {tl['total']:.2f}s = {int(tl['total'] // 60)}:{tl['total'] % 60:04.1f}")
        for sc in tl["scenes"]:
            print(f"  {sc['id']:8s} {sc['kind']:8s} start {sc['start']:7.2f}  dur {sc['dur']:6.2f}")
        return
    if args.still:
        render_stills(tl, args.still, args.still_dir)
    if args.srt:
        n = TL.write_srt(tl, args.srt)
        print("srt entries:", n, "->", args.srt)
    if args.video:
        render_video(tl, args.video, fps=args.fps, crf=args.crf, preset=args.preset,
                     t0=args.t0, t1=args.t1)


if __name__ == "__main__":
    main()
