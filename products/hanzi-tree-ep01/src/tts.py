# -*- coding: utf-8 -*-
"""Narration with edge-tts (needs internet).

Writes build/voice/<scene>__<beat>__<cn|en>.wav and build/tts.json (durations).
Then re-render the video, and run audio.py --mux to get the narrated cut:

    python src/tts.py
    python src/render.py --video out/ep01_silent.mp4 --srt out/ep01.srt
    python src/audio.py --mux out/ep01_silent.mp4 --final out/ep01_qing.mp4

If edge-tts is missing:  python -m pip install --user edge-tts
"""
import argparse
import asyncio
import json
import os
import subprocess
import sys
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import content

BUILD = os.path.abspath(os.path.join(HERE, "..", "build"))
VOICE = os.path.join(BUILD, "voice")
CN_VOICE = "zh-CN-XiaoxiaoNeural"
EN_VOICE = "en-US-AriaNeural"


def to_wav(mp3, wav):
    r = subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", mp3,
         "-ac", "1", "-ar", "48000", wav], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)


def wav_duration(path):
    with wave.open(path, "rb") as w:
        return w.getnframes() / w.getframerate()


async def synth(text, voice, out_mp3, rate="+8%"):
    import edge_tts
    kw = {"rate": rate} if voice == CN_VOICE else {}
    comm = edge_tts.Communicate(text, voice, **kw)
    await comm.save(out_mp3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cn-voice", default=CN_VOICE)
    ap.add_argument("--en-voice", default=EN_VOICE)
    ap.add_argument("--only", default=None, help="only this scene id")
    args = ap.parse_args()

    try:
        import edge_tts  # noqa: F401
    except ImportError:
        print("edge-tts not installed:  python -m pip install --user edge-tts")
        return 1

    os.makedirs(VOICE, exist_ok=True)
    dur_path = os.path.join(BUILD, "tts.json")
    durs = {}
    if os.path.exists(dur_path):
        with open(dur_path, "r", encoding="utf-8") as f:
            durs = json.load(f)

    for sc in content.SCENES:
        if args.only and sc["id"] != args.only:
            continue
        for bi, beat in enumerate(sc["beats"]):
            for lang, text, voice in (("cn", beat.get("cn", ""), args.cn_voice),
                                      ("en", beat.get("en", ""), args.en_voice)):
                if not text.strip():
                    continue
                key = f"{sc['id']}__{bi}__{lang}"
                wav = os.path.join(VOICE, key + ".wav")
                mp3 = os.path.join(VOICE, key + ".mp3")
                if os.path.exists(wav):
                    durs[f"{sc['id']}:{bi}:{lang}"] = round(wav_duration(wav), 3)
                    continue
                print("tts", key)
                asyncio.run(synth(text, voice, mp3))
                to_wav(mp3, wav)
                os.remove(mp3)
                durs[f"{sc['id']}:{bi}:{lang}"] = round(wav_duration(wav), 3)

    with open(dur_path, "w", encoding="utf-8") as f:
        json.dump(durs, f, ensure_ascii=False, indent=1)
    total = sum(durs.values())
    print(f"done: {len(durs)} clips, speech {total:.1f}s -> {dur_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
