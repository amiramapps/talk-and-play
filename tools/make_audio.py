#!/usr/bin/env python3
"""Record every phrase the app says with a natural Hebrew voice.

Writes audio/<id>.mp3 plus audio/index.json, which maps each phrase to its file
("slow:" + word for the slow version of a dictation word, "__voice" for the voice
used). Phrases come from words.txt (dictation words and sentences) and from
js/content.js. Clips that already exist are kept, so each run only records new
phrases. The voice is chosen in tts_engines.py: the best Google voice the
GOOGLE_TTS_KEY unlocks, otherwise Microsoft's Hila voice.
Run from the repository root:  python tools/make_audio.py
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tts_engines import pick_engine  # noqa: E402

OUT = "audio"


def strip_niqqud(text):
    return re.sub(r"[֑-ׇ]", "", text)


def dictation_phrases(path="words.txt"):
    """Mirror parseWords() in js/weeks.js so the phrases match exactly."""
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
                    phrases += [(w, False, w), (w, True, "slow:" + w)]
            phrases += [(s, False, s) for s in sentences if s]
    return phrases


def app_phrases(path="js/content.js"):
    """Evaluate js/content.js with node and collect its strings."""
    with open(path, encoding="utf-8") as f:
        src = f.read()
    block = src.split("/* speech:start", 1)[1].split("*/", 1)[1].split("/* speech:end */", 1)[0]
    js = block + "\nconsole.log(JSON.stringify({ P, NUMS, PRAISE, ANIMALS, LETTER_NAMES }));"
    data = json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)
    texts = list(data["P"].values()) + data["NUMS"] + data["PRAISE"] + list(data["LETTER_NAMES"].values())
    for animal in data["ANIMALS"]:
        texts += [animal["name"], *animal["clues"]]
    return [(t.strip(), False, t.strip()) for t in texts if t.strip()]


def main():
    os.makedirs(OUT, exist_ok=True)
    engine = pick_engine()
    jobs = {}
    for text, slow, key in app_phrases() + dictation_phrases():
        name = hashlib.sha1(f"{engine.label}|{slow}|{text}".encode()).hexdigest()[:16] + ".mp3"
        jobs[key] = (text, slow, name)

    def one(item):
        key, (text, slow, name) = item
        path = os.path.join(OUT, name)
        if os.path.exists(path) and os.path.getsize(path) > 0:
            return key, name, None, False
        err = "empty recording"
        for attempt in range(4):
            try:
                data = engine.mp3(text, slow)
                if data:
                    with open(path, "wb") as f:
                        f.write(data)
                    return key, name, None, True
            except Exception as e:  # network hiccups and rate limits: wait and retry
                err = " ".join(str(e).split())[:200]
            time.sleep(3 * 2 ** attempt)
        return key, None, err, False

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(one, jobs.items()))
    index = {key: name for key, name, _, _ in results if name}
    failed = [f"{key}: {err}" for key, name, err, _ in results if not name]
    made = sum(1 for *_, new in results if new)

    # Drop clips for phrases that are no longer used
    keep = set(index.values())
    for f in os.listdir(OUT):
        if f.endswith(".mp3") and f not in keep:
            os.remove(os.path.join(OUT, f))
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({**index, "__voice": engine.label}, f, ensure_ascii=False, indent=0, sort_keys=True)

    print(f"{len(index)} of {len(jobs)} phrases have a clip ({made} recorded now, voice {engine.label}).")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"clips={len(index)} of {len(jobs)}\nvoice={engine.label}\n")
    for line in failed:
        print("::warning::Not recorded:", line)
    return 0 if index else 1


if __name__ == "__main__":
    sys.exit(main())
