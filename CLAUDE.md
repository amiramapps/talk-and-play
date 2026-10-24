# מדברים ומשחקים (Talk & Play): instructions

These are the owner's instructions for this project. Follow them in every change.
When the owner gives a new instruction, add it here in the same change.

## Rules

1. **No file may be longer than 300 lines.** This applies to every file in the
   repository: code, styles, markup, scripts, workflows and text files, this one
   included. Before finishing any change, check with
   `git ls-files | xargs wc -l | sort -n`. If a file would go over 300 lines,
   split it by responsibility (for example a new file under `js/`) instead of
   cramming it. The publish run also reports the longest file in a step named
   "Longest file: N lines". That step never blocks publishing, so the parents'
   word updates always go out.
2. **Everything the child sees or hears is in Hebrew**: on-screen text, the voice
   and voice recognition (`he-IL`), with a right-to-left layout.
3. **Speak to the child in a gender-neutral way**, using the impersonal present
   plural ("לוחצים", "אומרים", "מנסים שוב") or "בואו נ...". Avoid forms that are
   only masculine or only feminine.
4. **The kids' phones must update automatically.** The app is published from the
   `main` branch to GitHub Pages (https://amiramapps.github.io/talk-and-play/) by
   `.github/workflows/deploy.yml`. Never require anything to be done on the phones.
5. **Parents add words in `words.txt` on GitHub**, not inside the app, so every
   phone gets the same lists.
6. **Test before publishing.** Run the app in headless Chromium and exercise the
   changed flow. Use a fake clock for timing and a simulated mic for voice. After
   pushing, confirm that the publish run succeeded and that the
   "Voice clips: N of N" step shows every phrase recorded.

## The app

A phone web app for young children, opened from the home-screen icon. The home
screen has exactly three options, in this order:

1. **הכתבה** (dictation)
2. **איות** (spelling out loud)
3. **מנחשים חיות** (guess the animal)

Kids can tap, or tap the red mic and speak. When the mic is unavailable,
everything must still work by tapping.

### Weekly word lists (`words.txt`)

- Each week starts with a line `שבוע N`, where N is the week number of the year
  (1-52, and 53 in years that have one). The week's words follow on **one
  comma-separated line**, so a whole school year stays well under 300 lines.
  The app also accepts one word per line, but keep the file in the one-line form.
- Weeks run **Sunday to Saturday**. The current week number is shown to parents at
  the bottom of the home screen.
- The parent adds **10 new words** every week.
- A word may be followed by a sentence after `|`: `ספר | קראתי ספר מעניין`.
- Words are stored **with niqqud** so the voice pronounces them correctly. The
  niqqud is never shown when checking: the child's spelling is the word without
  niqqud. When adding niqqud, put it on the exact letters the child writes (ktiv
  male, e.g. `חִילָּזוֹן` for חילזון).
- If this week's list is missing, the app uses the latest earlier list and says so.
  Future weeks can be added ahead of time and are used only when their week arrives.
- The school year is counted from the end of August (week 35). At the start of a
  new school year, last year's weeks are deleted.

### Choosing the 15 words

Every dictation and spelling round has **15 words**: the **10 words of the current
week** plus **5 review words picked at random from previous weeks**. Words the child
got wrong before are preferred as review words. The 15 are shuffled.

### הכתבה (dictation)

- The child writes **on paper**. The app only reads the words.
- Each word gets **15 seconds**:
  - at 0 s it says **"המילה הבאה: …"** ("המילה הראשונה: …" for the first word),
    followed by the sentence if there is one;
  - it repeats the word at **7.5 s** and again at **12 s**;
  - at 15 s it moves on to the next word by itself.
- The child can pause ("רגע"), resume ("ממשיכים"), repeat ("שוב"), hear it slowly
  ("לאט"), skip ahead ("הבאה") or go back ("הקודמת"). The clock stops while paused,
  while the mic is listening, and while the app is in the background. The screen
  stays on during the dictation.
- At the end, parent and child check together. The app lists the 15 words (review
  words tagged "חזרה") and they mark each one ✓ or ✗. Each correct word earns a ⭐.
  Words marked ✗ are remembered for review.
- A dictation in progress can be resumed.

### איות (spelling out loud)

- The same 15 words. The app says "איך מאייתים: …" and listens by itself.
- The child says the letter **names** ("דלת, גימל"). Each recognized letter fills
  a box, and spelling may come in several breaths.
- Right: a ⭐ and the next word. Wrong: the wrong letters are marked and the child
  tries once more. After the second miss, the app spells the word letter by
  letter and moves on.
- Final letters count as their regular form when checking, since the mic can't
  tell "מם" from "מם סופית". The correct form is always shown.
- An on-screen letter pad (including final letters) covers misheard letters, and
  opens by itself when the mic is unavailable.
- When the mic gets letter names wrong on real phones, add the spellings it
  produces to `NAME_TO_LETTER` in `js/spelling.js`.

### מנחשים חיות (guess the animal)

The animal describes itself in clues ("אני עושה: מוּוּוּ!"). A wrong guess gets the
next clue; after the last clue, three picture choices appear.

## The voice

- Phone voices read Hebrew badly, so **every phrase the app says is pre-recorded**
  in the publish workflow (`tools/make_audio.py`), with recordings cached between
  runs. Dictation words are also recorded at a slow speed.
- **The owner asked for Google's best voice, Gemini if possible.** With the
  repository secret `GOOGLE_TTS_KEY`, `tools/tts_engines.py` tries the voices best
  first and records with the first one the key unlocks: Gemini (`gemini-2.5-pro-tts`,
  then `gemini-2.5-flash-tts`) in Google Cloud Text-to-Speech, a Gemini TTS model
  through the Gemini API, Chirp 3 HD, then WaveNet. Without a key, or if Google
  refuses them all, it uses Microsoft's `he-IL-HilaNeural` through edge-tts. Each
  refused voice is reported as a warning in the publish run, and the "Voice clips"
  step name shows the voice used. The repository variable `GOOGLE_TTS_VOICE` forces
  one Google Cloud voice by name.
- **Sound on iPhones:** browsers allow sound only after a tap, and iPhones count
  the finger lifting (`touchend`, `click`), not touching down. `js/core.js` switches
  the sound on for all of these and plays a silent sound inside the tap. The home
  screen shows parents which voice actually played ("קול: הקלטה (...)" or "קול: הקול
  של הטלפון").
- The phone's own Hebrew voice is only a fallback for a phrase without a recording.
- **Every phrase the app speaks must live in `js/content.js`** (`P`, `NUMS`,
  `PRAISE`, `LETTER_NAMES`, `ANIMALS`) so it gets recorded. Build sentences from
  those parts, e.g. `say([P.nextWord, word.spoken])`. Never put spoken text directly
  in other files.
- Keys live only in GitHub secrets, never in the repository or in the app.

## Code map

| File | What it does |
|---|---|
| `app.html` | The screens (markup only). `build.sh` wraps it into `index.html` |
| `styles.css` | Colors (light and dark), layout, fonts |
| `js/content.js` | Everything the app says |
| `js/core.js` | Helpers, saved progress, stars, voice playback, mic |
| `js/commands.js` | Voice commands and switching screens |
| `js/weeks.js` | Reading `words.txt`, week numbers, opening a dictation |
| `js/dictation.js` | Dictation timing and checking |
| `js/spelling.js` | Spelling by letter names, letter pad |
| `js/animals.js` | Guess the animal |
| `tools/make_audio.py` | Records the voice clips (runs in the publish workflow) |
| `tools/tts_engines.py` | The voices it can record with, best first |

The scripts are plain files that share one global scope and load in the order
listed at the bottom of `app.html`. Code that runs while the page loads may only
call things defined in files loaded before it.

## Progress kept on each phone

Stars, the dictation or spelling round in progress, and the list of words the
child got wrong are saved in the phone's browser storage. They are per phone and
are never sent anywhere.
