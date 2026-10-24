# מדברים ומשחקים (Talk & Play)

A talking game for kids in Hebrew, played on a phone:

- **Dictation (הכתבה)**: the app reads 15 words, the child writes them in a notebook,
  then you check them together in the app.
- **Spelling (איות)**: the app says a week word and the child spells it out loud by letter
  name ("דלת, גימל"), or taps the letters on screen.
- **Guess the animal**: listen to clues and say (or tap) the answer.

Kids tap the red mic and speak Hebrew: "הכתבה", "איות", "חיות", "שוב", "לאט",
"הבאה", "רמז" or "הביתה".

## Changing the app

Edit `app.html` (for example the `WORDS` and `ANIMALS` lists near the top of the
script). Every change to `main` is published automatically to GitHub Pages, and
the kids' phones get the new version the next time they open the app.

## Weekly dictation words

Every week, open [`words.txt`](words.txt), click the pencil, and add the list for that
week's number in the year (1-52). Weeks run Sunday to Saturday, and the app's home
screen shows the current week number.

```
שבוע 44
מילה, מילה, מילה, ...
```

- The dictation uses **this week's** words (10 new words) plus **5 review words** from
  earlier weeks. Words the child got wrong are picked for review first.
- If this week's list is missing, the app uses the latest earlier list. Lists for future
  weeks can be added ahead of time.
- Each word gets **15 seconds**: the app says "המילה הבאה: …", repeats the word at 7.5 and
  12 seconds, then moves on. The child can pause, repeat or skip ahead.
- To have the app read a sentence too, write it after a `|`: `ספר | קראתי ספר מעניין`
- If the voice mispronounces a word, write it with niqqud (`סֵפֶר`). Niqqud is not shown
  when checking.
- Lines starting with `#` are notes and are skipped. At the start of a new school year,
  delete last year's weeks.

## The voice

Every time something changes on `main`, the publish workflow records each phrase the app
says, including every dictation word at normal and slow speed. The app plays those
recordings and uses the phone's own voice only for anything missing.

- **Google's Hebrew voice** (`he-IL-Wavenet-A`) is used when the repository secret
  `GOOGLE_TTS_KEY` holds a Google Cloud Text-to-Speech API key. To pick another Google
  voice, set the repository variable `GOOGLE_TTS_VOICE` (`he-IL-Wavenet-B`, `-C`, `-D`).
- Without a key, Microsoft's neural Hebrew voice (`he-IL-HilaNeural`) is used through
  [edge-tts](https://github.com/rany2/edge-tts).
