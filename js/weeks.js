// Weekly word lists from words.txt, and opening a dictation.
// ---------- Weekly word lists (words.txt) ----------
// Format: a line "שבוע 44" opens the list for week 44 of the year; then words, comma-separated or
// one per line, optionally "word | sentence". Lines starting with # are notes.
function parseWords(text) {
  const byNum = new Map();
  let week = null;
  const add = (raw, sentence) => {
    const spoken = raw.trim(), written = stripNiqqud(spoken).trim();
    if (written) week.words.push({ written, spoken, sentence: (sentence || "").trim() });
  };
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    if (/^שבוע/.test(stripNiqqud(line))) {
      // A later list for the same week number replaces the earlier one; a week without a number is skipped
      const m = stripNiqqud(line).match(/^שבוע\s*(\d{1,2})(?!\d)/);
      const num = m ? parseInt(m[1], 10) : 0;
      week = num >= 1 && num <= 53 ? { num, label: "שבוע " + num, words: [] } : null;
      if (week) byNum.set(num, week);
      continue;
    }
    if (!week) continue;
    if (line.includes("|")) { const i = line.indexOf("|"); add(line.slice(0, i), line.slice(i + 1)); }
    else line.split(/[,،]/).forEach(w => add(w));
  }
  return [...byNum.values()].filter(w => w.words.length);
}

// Week of the year for a Sunday-to-Saturday school week: Sunday counts with the Monday after it (ISO week)
function weekOfYear(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 1));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - jan1) / 86400000 + 1) / 7);
}
// Weeks are ordered by the school year, which starts at the end of August (week 35)
const schoolPos = n => (n - 35 + 53) % 53;
const thisWeek = weekOfYear();
$("weekNow").textContent = "שבוע " + thisWeek;

// This week's list, or the latest earlier list if this week's words weren't added yet
function currentWeek() {
  const exact = weeks.find(w => w.num === thisWeek);
  if (exact) return exact;
  return weeks.filter(w => schoolPos(w.num) < schoolPos(thisWeek)).sort((a, b) => schoolPos(b.num) - schoolPos(a.num))[0] || null;
}
const earlierWeeks = wk => weeks.filter(w => schoolPos(w.num) < schoolPos(wk.num));

let weeks = null;
async function loadWeeks() {
  try {
    const res = await fetch("words.txt", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    save("tp-words", text);
    weeks = parseWords(text);
  } catch (e) {
    const saved = load("tp-words", null); // offline: use the last list this phone saw
    weeks = saved ? parseWords(saved) : [];
  }
  $("dictTileInfo").textContent = "שבוע " + thisWeek + " · אומרים: ״הכתבה״";
  return weeks;
}
const weeksReady = loadWeeks();

// Build the dictation: all of the week's words plus review words from earlier weeks,
// taking words the child got wrong before first.
function reviewPool(wk) {
  const seen = new Set(wk.words.map(w => w.written));
  const older = [];
  for (const w of earlierWeeks(wk).flatMap(x => x.words)) {
    if (!seen.has(w.written)) { seen.add(w.written); older.push({ ...w, review: true }); }
  }
  return older;
}
function buildDictation(wk) {
  const fresh = wk.words.map(w => ({ ...w, review: false }));
  const older = reviewPool(wk);
  const missed = new Set(load("tp-missed", []));
  const review = [...shuffle(older.filter(w => missed.has(w.written))), ...shuffle(older.filter(w => !missed.has(w.written)))].slice(0, REVIEW_COUNT);
  return { key: buildKey(wk), label: wk.label, words: shuffle([...fresh, ...review]), at: 0, marks: {}, stage: "words" };
}
const buildKey = wk => wk.label + "|" + wk.words.map(w => w.written).join(",");

let dict = null, week = null;

async function openDictation() {
  hush(); show("dictIntro");
  $("dictFacts").innerHTML = ""; setFb("introFb", "טוענים את המילים…");
  $("startDictBtn").disabled = true; $("restartDictBtn").hidden = true;
  await weeksReady;
  if (current !== "dictIntro") return;
  week = currentWeek();
  if (!week) {
    $("weekTitle").textContent = "הכתבה · שבוע " + thisWeek;
    setFb("introFb", "עוד אין מילים לשבוע " + thisWeek + ". אמא או אבא מוסיפים אותן בקובץ words.txt.", "try");
    return say(P.noWords);
  }
  const reviewAvail = Math.min(REVIEW_COUNT, reviewPool(week).length);
  const total = week.words.length + reviewAvail;
  $("weekTitle").textContent = "הכתבה · " + week.label;
  const facts = [
    total + " מילים: " + week.words.length + " חדשות" + (reviewAvail ? " ו-" + reviewAvail + " לחזרה" : ""),
    "לכל מילה " + WORD_SECONDS + " שניות, והיא נשמעת 3 פעמים",
    "מכינים מחברת ועיפרון ✏️"
  ];
  if (week.num !== thisWeek) facts.unshift("עוד אין מילים לשבוע " + thisWeek + ", אז עושים את " + week.label);
  for (const t of facts) { const li = document.createElement("li"); li.textContent = t; $("dictFacts").appendChild(li); }
  setFb("introFb", "");
  const saved = load("tp-dict", null);
  const resumable = saved && saved.key === buildKey(week) && saved.stage !== "done";
  $("startDictBtn").disabled = false;
  if (resumable) {
    dict = saved;
    $("startDictBtn").textContent = saved.stage === "check" ? "ממשיכים לבדיקה" : "ממשיכים ממילה " + (saved.at + 1);
    $("restartDictBtn").hidden = false;
    say(P.resume);
  } else {
    dict = null;
    $("startDictBtn").textContent = "מתחילים!";
    say(P.dictIntro);
  }
}

function startDictation(fromScratch) {
  if (!week) return;
  if (fromScratch || !dict) dict = buildDictation(week);
  save("tp-dict", dict);
  preload(dict.words.flatMap(w => [w.spoken, "slow:" + w.spoken, w.sentence]));
  if (dict.stage === "check") return showCheck();
  showWord();
}
$("startDictBtn").onclick = () => startDictation(false);
$("restartDictBtn").onclick = () => startDictation(true);
