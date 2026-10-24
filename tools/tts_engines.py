"""Text-to-speech engines for make_audio.py, best first.

Each engine records one phrase as mp3 bytes. pick_engines() tries a short test phrase
with each engine in order and returns the first one that works, plus the next working
one as a backup for phrases the first can't record (for example over a daily limit).
Keys: GOOGLE_TTS_KEY (Google Cloud Text-to-Speech) and GEMINI_API_KEY (a Gemini key
from Google AI Studio). Without keys, or if Google refuses every voice, Microsoft's
Hila voice (edge-tts, no key needed) is used. GOOGLE_TTS_VOICE forces one Google
Cloud voice by name, e.g. he-IL-Wavenet-C.
"""
import base64
import json
import os
import re
import subprocess
import tempfile
import urllib.error
import urllib.request

KEY = os.environ.get("GOOGLE_TTS_KEY", "").strip()
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "").strip() or KEY
FORCED_VOICE = os.environ.get("GOOGLE_TTS_VOICE", "").strip()
EDGE_VOICE = os.environ.get("TTS_VOICE", "").strip() or "he-IL-HilaNeural"

# How the Gemini voices are asked to read (they take instructions, not a speed number)
STYLE = {
    False: "Read the following Hebrew text aloud for a young child in first grade, exactly as "
           "written, in clear standard Israeli Hebrew, warmly and a little slowly. Follow the niqqud.",
    True: "Read the following Hebrew word aloud for a young child in first grade, exactly as "
          "written, very slowly and clearly, syllable by syllable. Follow the niqqud.",
}


def _post(url, payload, timeout=90):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:  # keep Google's reason, e.g. "language not supported"
        raise RuntimeError(f"{e.code}: {e.read().decode(errors='replace')[:400]}") from None


class CloudTTS:
    """Google Cloud Text-to-Speech: WaveNet and Chirp 3 HD voices, or a Gemini voice with model."""

    def __init__(self, voice, model=None):
        self.voice, self.model = voice, model
        self.label = f"{model}/{voice}" if model else voice

    def mp3(self, text, slow):
        voice = {"languageCode": "he-IL", "name": self.voice}
        source = {"text": text}
        config = {"audioEncoding": "MP3"}
        if self.model:
            voice["modelName"] = self.model
            source["prompt"] = STYLE[slow]
        else:
            config["speakingRate"] = 0.7 if slow else 0.95
        data = _post("https://texttospeech.googleapis.com/v1/text:synthesize?key=" + KEY,
                     {"input": source, "voice": voice, "audioConfig": config})
        return base64.b64decode(data["audioContent"])


class GeminiAPI:
    """A Gemini text-to-speech model through the Gemini API (24 kHz PCM, converted to mp3)."""

    def __init__(self, voice, model):
        self.voice, self.model = voice, model
        self.label = f"{model}/{voice}/text-only"  # a new name, so clips from the old request are re-recorded

    def mp3(self, text, slow):
        data = _post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={GEMINI_KEY}",
            # Only the Hebrew text: the model reads any instructions out loud along with it
            {"contents": [{"parts": [{"text": text}]}],
             "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {
                 "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": self.voice}}}}})
        pcm = base64.b64decode(data["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
        try:
            import lameenc  # pip package with its own mp3 encoder, so no ffmpeg is needed
        except ImportError:
            return subprocess.run(
                ["ffmpeg", "-loglevel", "error", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0",
                 "-b:a", "64k", "-f", "mp3", "pipe:1"], input=pcm, capture_output=True, check=True).stdout
        enc = lameenc.Encoder()
        enc.set_bit_rate(64)
        enc.set_in_sample_rate(24000)
        enc.set_channels(1)
        enc.set_quality(2)
        return enc.encode(pcm) + enc.flush()


class Edge:
    """Microsoft's neural Hebrew voice through edge-tts (unofficial, no key)."""

    def __init__(self, voice):
        self.voice = self.label = voice

    def mp3(self, text, slow):
        import asyncio
        import edge_tts
        with tempfile.NamedTemporaryFile(suffix=".mp3") as f:
            rate = "-35%" if slow else "-5%"
            asyncio.run(edge_tts.Communicate(text, self.voice, rate=rate).save(f.name))
            return open(f.name, "rb").read()


_models = None


def gemini_models():
    """The Gemini API models this key may use (names change as Google releases new ones)."""
    global _models
    if _models is None:
        _models = []
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key={GEMINI_KEY}"
            with urllib.request.urlopen(url, timeout=30) as res:
                _models = [m["name"].split("/", 1)[1] for m in json.load(res).get("models", [])
                           if "generateContent" in m.get("supportedGenerationMethods", [])]
        except Exception as e:
            print(f"::warning::Could not list Gemini models: {' '.join(str(e).split())[:300]}")
    return _models


def _newest_first(names):
    version = lambda n: tuple(int(x) for x in re.findall(r"\d+", n.split("-", 1)[-1])[:2])
    return sorted(names, key=lambda n: (version(n), "pro" in n, "preview" not in n), reverse=True)


def tts_models():
    return _newest_first([m for m in gemini_models() if "tts" in m])[:3]


def check_model():
    """The newest regular Flash model, used to listen to the recordings."""
    forced = os.environ.get("GEMINI_CHECK_MODEL", "").strip()
    skip = ("tts", "image", "live", "lite", "audio", "embedding", "thinking")
    found = _newest_first([m for m in gemini_models() if "flash" in m and not any(w in m for w in skip)])
    return forced or (found[0] if found else "gemini-3.8-flash")


def candidates():
    found = []
    if KEY and not FORCED_VOICE:
        found += [CloudTTS("Kore", model="gemini-2.5-pro-tts"), CloudTTS("Kore", model="gemini-2.5-flash-tts")]
    if GEMINI_KEY and not FORCED_VOICE:
        models = tts_models()
        print(f"::notice::Gemini voice models available: {', '.join(models) or 'none'}")
        found += [GeminiAPI("Kore", m) for m in models]
    if KEY:
        found += [CloudTTS(FORCED_VOICE)] if FORCED_VOICE else [CloudTTS("he-IL-Chirp3-HD-Kore"), CloudTTS("he-IL-Wavenet-A")]
    return found + [Edge(EDGE_VOICE)]


def pick_engines(most=4):
    """The best working voice and up to three more as alternates (backup and pronunciation
    fixes); each refusal is reported as a warning."""
    working = []
    for engine in candidates():
        try:
            if len(engine.mp3("שָׁלוֹם, בּוֹאוּ נְשַׂחֵק.", False)) > 1000:
                working.append(engine)
                if len(working) == most:
                    break
                continue
            raise RuntimeError("the recording came back empty")
        except Exception as e:
            reason = " ".join(str(e).split())  # one line: a warning ends at the first line break
            print(f"::warning::Voice {engine.label} is not available: {reason[:600]}")
    if not working:
        raise SystemExit("No voice could record anything.")
    return working[0], working[1:]
