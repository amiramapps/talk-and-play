# מדברים ומשחקים (Talk & Play)

A talking game for kids in Hebrew, played on a phone:

- **Dictation (הכתבה)**: the app reads 15 words, the child writes them in a notebook,
  then you check them together in the app.
- **Guess the animal**: listen to clues and say (or tap) the answer.

Kids tap the red mic and speak Hebrew: "הכתבה", "חיות", "שוב", "לאט",
"הבאה", "רמז" or "הביתה".

## Changing the app

Edit `app.html` (for example the `WORDS` and `ANIMALS` lists near the top of the
script). Every change to `main` is published automatically to GitHub Pages, and
the kids' phones get the new version the next time they open the app.

## Weekly dictation words

Every week, open [`words.txt`](words.txt), click the pencil, and add a new week at the
end of the file:

```
שבוע 3
מילה, מילה, מילה, ...
```

- The dictation uses the **last week** in the file (10 new words) plus **5 review words**
  from earlier weeks. Words the child got wrong are picked for review first.
- To have the app read a sentence too, write it after a `|`: `ספר | קראתי ספר מעניין`
- If the voice mispronounces a word, write it with niqqud (`סֵפֶר`). Niqqud is not shown
  when checking.
- Lines starting with `#` are notes and are skipped.
