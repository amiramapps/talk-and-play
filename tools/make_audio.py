#!/usr/bin/env python3
"""Record every phrase the app says with a natural Hebrew voice.

Writes audio/<id>.mp3 plus audio/index.json, which maps each phrase to its file
("slow:" + word for the slow version of a dictation word). Phrases come from
words.txt (dictation words and sentences) and from js/content.js.
Clips that already exist are kept, so each run only records new phrases.

Voice: with a GOOGLE_TTS_KEY (Google Cloud Text-to-Speech API key) the clips are
recorded with Google's Hebrew WaveNet voice (GOOGLE_TTS_VOICE, default
he-IL-Wavenet-A). Without a key, or if Google refuses the key, Microsoft's neural
Hebrew voice is used through edge-tts (TTS_VOICE, default he-IL-HilaNeural).
Run from the repository root:  python tools/make_audio.py
"""
import asyncio
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

GOOGLE_KEY = os.environ.get("GOOGLE_TTS_KEY", "").strip()
GOOGLE_VOICE = os.environ.get("GOOGLE_TTS_VOICE", "").strip() or "he-IL-Wavenet-A"
EDGE_VOICE = os.environ.get("TTS_VOICE", "").strip() or "he-IL-HilaNeural"
RATE, SLOW_RATE = "-5%", "-35%"
GOOGLE_SPEED = {RATE: 0.95, SLOW_RATE: 0.7}
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
                    phrases += [(w, RATE, w), (w, SLOW_RATE, "slow:" + w)]
            phrases += [(s, RATE, s) for s in sentences if s]
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
    return [(t.strip(), RATE, t.strip()) for t in texts if t.strip()]


def google_mp3(text, rate):
    body = json.dumps({
        "input": {"text": text},
        "voice": {"languageCode": "he-IL", "name": GOOGLE_VOICE},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": GOOGLE_SPEED[rate]},
    }).encode()
    req = urllib.request.Request(
        "https://texttospeech.googleapis.com/v1/text:synthesize?key=" + GOOGLE_KEY,
        data=body, headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return base64.b64decode(json.load(res)["audioContent"])
    except urllib.error.HTTPError as e:  # show Google's reason, e.g. the API is not enabled
        raise RuntimeError(f"Google said {e.code}: {e.read().decode(errors='replace')[:300]}") from None


async def record(engine, text, rate, path):
    if engine == "google":
        data = await asyncio.to_thread(google_mp3, text, rate)
        with open(path, "wb") as f:
            f.write(data)
    else:
        import edge_tts
        await edge_tts.Communicate(text, EDGE_VOICE, rate=rate).save(path)


def pick_engine():
    """Google when a working key is set, otherwise edge-tts."""
    if not GOOGLE_KEY:
        return "edge", EDGE_VOICE
    try:
        google_mp3("שלום", RATE)
        return "google", GOOGLE_VOICE
    except Exception as e:
        print(f"::warning::Google Text-to-Speech refused the key, using {EDGE_VOICE} instead. {e}")
        return "edge", EDGE_VOICE


async def main():
    os.makedirs(OUT, exist_ok=True)
    engine, voice = pick_engine()
    jobs = {}
    for text, rate, key in app_phrases() + dictation_phrases():
        name = hashlib.sha1(f"{voice}|{rate}|{text}".encode()).hexdigest()[:16] + ".mp3"
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
                    await record(engine, text, rate, path)
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

    print(f"{len(index)} of {len(jobs)} phrases have a clip ({made} recorded now, voice {voice}).")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"clips={len(index)} of {len(jobs)}\nvoice={voice}\n")
    for line in failed:
        print("  not recorded:", line)
    return 0 if index else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
