"""Text-to-speech engines for make_audio.py, best first.

Each engine records one phrase as mp3 bytes. pick_engine() tries a short test phrase
with each engine in order and returns the first one that works with the key in
GOOGLE_TTS_KEY. Without a key, or if Google refuses every voice, Microsoft's Hila
voice (edge-tts, no key needed) is used. GOOGLE_TTS_VOICE forces one Google Cloud
voice by name, e.g. he-IL-Wavenet-C.
"""
import base64
import json
import os
import subprocess
import tempfile
import urllib.error
import urllib.request

KEY = os.environ.get("GOOGLE_TTS_KEY", "").strip()
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
        self.label = f"{model}/{voice}"

    def mp3(self, text, slow):
        data = _post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={KEY}",
            {"contents": [{"parts": [{"text": STYLE[slow] + "\n\n" + text}]}],
             "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {
                 "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": self.voice}}}}})
        pcm = base64.b64decode(data["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
        return subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0",
             "-b:a", "64k", "-f", "mp3", "pipe:1"], input=pcm, capture_output=True, check=True).stdout


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


def candidates():
    if not KEY:
        return [Edge(EDGE_VOICE)]
    if FORCED_VOICE:
        return [CloudTTS(FORCED_VOICE), Edge(EDGE_VOICE)]
    return [
        CloudTTS("Kore", model="gemini-2.5-pro-tts"),
        CloudTTS("Kore", model="gemini-2.5-flash-tts"),
        GeminiAPI("Kore", model="gemini-2.5-flash-preview-tts"),
        CloudTTS("he-IL-Chirp3-HD-Kore"),
        CloudTTS("he-IL-Wavenet-A"),
        Edge(EDGE_VOICE),
    ]


def pick_engine():
    """The first engine that records a test phrase; each refusal is reported as a warning."""
    for engine in candidates():
        try:
            if len(engine.mp3("שָׁלוֹם, בּוֹאוּ נְשַׂחֵק.", False)) > 1000:
                return engine
            raise RuntimeError("the recording came back empty")
        except Exception as e:
            print(f"::warning::Voice {engine.label} is not available: {str(e)[:300]}")
    raise SystemExit("No voice could record anything.")
