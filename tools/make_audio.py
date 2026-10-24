#!/usr/bin/env python3
"""Record every phrase the app says with a natural Hebrew voice.

Writes audio/<id>.mp3 plus audio/index.json, which maps each phrase to its file
("slow:" + word for the slow version of a dictation word). Phrases come from
words.txt (dictation words and sentences) and from the speech block in app.html.
Clips that already exist are kept, so each run only records new phrases.

The voice is Microsoft's neural Hebrew voice, reached through edge-tts.
Run from the repository root:  python tools/make_audio.py
"""
import asyncio
import hashlib
import json
import os
import re
import subprocess
import sys

VOICE = os.environ.get("TTS_VOICE", "he-IL-HilaNeural")
RATE, SLOW_RATE = "-5%", "-35%"
OUT = "audio"


def strip_niqqud(text):
    return re.sub(r"[֑-ׇ]", "", text)


def dictation_phrases(path="words.txt"):
    """Mirror parseWords() in app.html so the phrases match exactly."""
    phrases = []
    in_week = False
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if strip_niqqud(line).startswith("שבוע"):
                m = re.match(r"^שבוע\s*(\d{1,2})(?!\d)", strip_niqqud(line))
                in_week = bool(m) and 1 <= int(m.group(1)) <= 53
                continue
            if not in_week:
                continue
            if "|" in line:
                word, sentence = line.split("|", 1)
                words, sentences = [word.strip()], [sentence.strip()]
            else:
                words, sentences = [w.strip() for w in re.split(r"[,،]", line)], []
            for w in words:
                if strip_niqqud(w).strip():
                    phrases += [(w, RATE, w), (w, SLOW_RATE, "slow:" + w)]
            phrases += [(s, RATE, s) for s in sentences if s]
    return phrases


def app_phrases(path="app.html"):
    """Evaluate the speech block of app.html with node and collect its strings."""
    with open(path, encoding="utf-8") as f:
        src = f.read()
    block = src.split("/* speech:start", 1)[1].split("*/", 1)[1].split("/* speech:end */", 1)[0]
    js = block + "\nconsole.log(JSON.stringify({ P, NUMS, PRAISE, ANIMALS, LETTER_NAMES }));"
    data = json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)
    texts = list(data["P"].values()) + data["NUMS"] + data["PRAISE"] + list(data["LETTER_NAMES"].values())
    for animal in data["ANIMALS"]:
        texts += [animal["name"], *animal["clues"]]
    return [(t.strip(), RATE, t.strip()) for t in texts if t.strip()]


async def record(text, rate, path):
    import edge_tts
    await edge_tts.Communicate(text, VOICE, rate=rate).save(path)


async def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = {}
    for text, rate, key in app_phrases() + dictation_phrases():
        name = hashlib.sha1(f"{VOICE}|{rate}|{text}".encode()).hexdigest()[:16] + ".mp3"
        jobs[key] = (text, rate, name)

    index, failed, made = {}, [], 0
    limit = asyncio.Semaphore(4)

    async def one(key, text, rate, name):
        nonlocal made
        path = os.path.join(OUT, name)
        if os.path.exists(path) and os.path.getsize(path) > 0:
            index[key] = name
            return
        async with limit:
            for attempt in range(3):
                try:
                    await record(text, rate, path)
                    if os.path.getsize(path) > 0:
                        index[key] = name
                        made += 1
                        return
                except Exception as e:  # network hiccups: retry, then leave it to the phone's voice
                    err = e
                await asyncio.sleep(2 * (attempt + 1))
            failed.append(f"{key}: {err if 'err' in locals() else 'empty file'}")
            if os.path.exists(path):
                os.remove(path)

    await asyncio.gather(*(one(k, *v) for k, v in jobs.items()))

    # Drop clips for phrases that are no longer used
    keep = set(index.values())
    for f in os.listdir(OUT):
        if f.endswith(".mp3") and f not in keep:
            os.remove(os.path.join(OUT, f))
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=0, sort_keys=True)

    print(f"{len(index)} of {len(jobs)} phrases have a clip ({made} recorded now, voice {VOICE}).")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"clips={len(index)} of {len(jobs)}\n")
    for line in failed:
        print("  not recorded:", line)
    return 0 if index else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
