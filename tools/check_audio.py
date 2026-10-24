"""Listen to recorded dictation words with Gemini and check how they are pronounced.

Gemini hears each clip and reports what was said (with niqqud and in Latin letters),
how the intended word should sound, and whether the two match. Verdicts are cached
in audio/checks.json by clip file, so each clip is judged only once.
"""
import base64
import json
import os

from tts_engines import GEMINI_KEY, _post, check_model

MODEL = None  # chosen on first use: the newest Flash model the key may use
PROMPT = """This audio is a recording of Hebrew text for a first-grade dictation in Israel.
The intended text, with niqqud, is: {text}

Listen carefully and answer in JSON with these fields:
- "heard": exactly what is said, in Hebrew with full niqqud
- "latin": how it is pronounced, in Latin letters, with the stressed syllable in CAPITALS
- "intended_latin": how the intended text is pronounced in standard Israeli Hebrew, same format
- "match": true only if the recording says the intended text with the intended vowels,
  consonants and stress, and says nothing else
- "problem": empty when it matches, otherwise a short explanation in English"""


def judge(mp3, text):
    global MODEL
    MODEL = MODEL or check_model()
    data = _post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={GEMINI_KEY}",
        {"contents": [{"parts": [
            {"inlineData": {"mimeType": "audio/mp3", "data": base64.b64encode(mp3).decode()}},
            {"text": PROMPT.format(text=text)}]}],
         "generationConfig": {"responseMimeType": "application/json", "temperature": 0}})
    verdict = json.loads(data["candidates"][0]["content"]["parts"][0]["text"])
    verdict["match"] = verdict.get("match") is True
    return verdict


class Checker:
    def __init__(self, out):
        self.out, self.path = out, os.path.join(out, "checks.json")
        try:
            with open(self.path, encoding="utf-8") as f:
                self.cache = json.load(f)
        except (OSError, ValueError):
            self.cache = {}
        self.errors = []
        self.replaced = set()  # slow clips of rejected words, kept for the same reason

    def check(self, name, text):
        """Gemini's verdict on one clip, or None if Gemini could not be asked."""
        key = f"{name}|{text}"
        if key not in self.cache:
            try:
                with open(os.path.join(self.out, name), "rb") as f:
                    self.cache[key] = judge(f.read(), text)
            except Exception as e:
                self.errors.append(" ".join(str(e).split())[:300])
                return None
        return self.cache[key]

    def rejected(self):
        """Clips Gemini heard as wrong. They are kept so they are not recorded and judged again."""
        return {k.split("|", 1)[0] for k, v in self.cache.items() if not v.get("match")} | self.replaced

    def save(self, names_in_use):
        keep = {k: v for k, v in self.cache.items()
                if k.split("|", 1)[0] in names_in_use or not v.get("match")}
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(keep, f, ensure_ascii=False, indent=0)


def review(index, words, backup, record, out):
    """Check every dictation word; where the clip sounds wrong, try the backup voice.

    words: (text, key) pairs. record(engine, text, slow, tries) -> (file name, error).
    Returns (number checked, number pronounced right, report lines, clips to keep).
    """
    checker, lines, checked, right = Checker(out), [], 0, 0
    for text, key in words:
        if key not in index:
            continue
        verdict = checker.check(index[key], text)
        if verdict is None:
            continue
        if not verdict["match"] and backup:
            alt, _ = record(backup, text, False, 2)
            alt_verdict = checker.check(alt, text) if alt else None
            if alt_verdict and alt_verdict["match"]:
                index[key] = alt
                slow_alt, _ = record(backup, text, True, 2)
                if slow_alt:
                    checker.replaced.add(index.get("slow:" + text))
                    index["slow:" + text] = slow_alt
                lines.append(f"::notice::{text} sounded wrong ({verdict.get('latin')}), "
                             f"so it now uses {backup.label}: {alt_verdict.get('latin')}")
                verdict = alt_verdict
        checked += 1
        if verdict["match"]:
            right += 1
        else:
            lines.append(f"::warning::Pronunciation of {text}: heard {verdict.get('heard')} "
                         f"({verdict.get('latin')}), expected {verdict.get('intended_latin')}. "
                         f"{verdict.get('problem', '')}")
    lines.append(f"::notice::Pronunciation checked by {MODEL}")
    for err in checker.errors[:3]:
        lines.append(f"::warning::Pronunciation check could not ask Gemini: {err}")
    checker.save(set(index.values()))
    return checked, right, lines, checker.rejected()
