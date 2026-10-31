// Spelling: the child says each word's letters by name.
// ---------- Spelling (איות) ----------
// The child hears a week word and says its letters by name; each recognized letter fills a box.
// Letter names the way speech recognition tends to write them
const NAME_TO_LETTER = {};
for (const [letter, names] of Object.entries({
  "א": ["אלף","אלפ","אלאף"], "ב": ["בית","ביית","בת"], "ג": ["גימל","גמל","גימעל"],
  "ד": ["דלת","דלט","דאלת"], "ה": ["הא","הה","האא"], "ו": ["וו","ואו","וואו","ואב","וב"],
  "ז": ["זין","זיין","זאין"], "ח": ["חית","חת","חיט"], "ט": ["טית","טת","טיט"],
  "י": ["יוד","יוט","יאוד","יודה"], "כ": ["כף","כאף","כפ"], "ל": ["למד","לאמד","למת","לאמת"],
  "מ": ["מם","מים","מאם"], "נ": ["נון","נונ","נן"], "ס": ["סמך","סמח","סמכ","סאמך"],
  "ע": ["עין","עיין","עאין"], "פ": ["פא","פה","פי"], "צ": ["צדי","צדיק","צאדי","צדיי"],
  "ק": ["קוף","קופ","כוף"], "ר": ["ריש","רייש","רש"], "ש": ["שין","שיין","שן","סין"],
  "ת": ["תו","תאו","תיו","תאב","טאו"]
})) for (const n of names) NAME_TO_LETTER[n] = letter;
const TO_FINAL = { "כ": "ך", "מ": "ם", "נ": "ן", "פ": "ף", "צ": "ץ" };
const FROM_FINAL = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
// Final letters count as their regular form when checking, since "מם" and "מם סופית" sound alike to the mic
const baseLetters = s => [...s].map(c => FROM_FINAL[c] || c).join("");
const isLetter = c => /^[א-ת]$/.test(c);
const targetOf = w => [...w.written.replace(/[^\u05D0-\u05EA]/g, "")]; // letters only: no spaces or the " of סכו"ם

function parseLetters(text) {
  const out = [];
  for (const tok of text.split(" ")) {
    if (/^סופי(ת|ות)?$/.test(tok)) {
      const last = out[out.length - 1];
      if (TO_FINAL[last]) out[out.length - 1] = TO_FINAL[last];
    } else if (NAME_TO_LETTER[tok]) out.push(NAME_TO_LETTER[tok]);
    else if (tok.length === 1 && isLetter(tok)) out.push(tok);
  }
  return out;
}
// Of the recognizer's guesses, take the one that continues the word correctly the furthest
function bestLetters(alts) {
  const target = baseLetters(targetOf(spell.words[spell.at]).join(""));
  let best = [], bestScore = -1;
  for (const a of alts) {
    const ls = parseLetters(a);
    if (!ls.length) continue;
    const next = baseLetters(attempt.join("") + ls.join(""));
    let score = 0;
    while (score < next.length && next[score] === target[score]) score++;
    if (score > bestScore) { bestScore = score; best = ls; }
  }
  return best;
}

let spell = null, spellWeek = null, attempt = [], tries = 0, spellLocked = false, advanceTimer = null;

async function openSpelling() {
  hush(); show("spellIntro");
  $("spellFacts").innerHTML = ""; setFb("spellIntroFb", "טוענים את המילים…");
  $("startSpellBtn").disabled = true; $("restartSpellBtn").hidden = true;
  await weeksReady;
  if (current !== "spellIntro") return;
  spellWeek = currentWeek();
  if (!spellWeek) {
    $("spellTitle").textContent = "איות · שבוע " + thisWeek;
    setFb("spellIntroFb", "עוד אין מילים לשבוע " + thisWeek + ". אמא או אבא מוסיפים אותן בקובץ words.txt.", "try");
    return say(P.noWords);
  }
  const reviewAvail = Math.min(REVIEW_COUNT, reviewPool(spellWeek).length);
  $("spellTitle").textContent = "איות · " + spellWeek.label;
  const facts = [
    (spellWeek.words.length + reviewAvail) + " מילים: " + spellWeek.words.length + " חדשות" + (reviewAvail ? " ו-" + reviewAvail + " לחזרה" : ""),
    "שומעים מילה, ואומרים את האותיות שלה אחת אחרי השנייה",
    "למשל: דג ← ״דלת, גימל״",
    voiceBlocked ? "המיקרופון לא זמין כאן, אז לוחצים על האותיות במסך" : "אפשר גם ללחוץ על האותיות במסך"
  ];
  if (spellWeek.num !== thisWeek) facts.unshift("עוד אין מילים לשבוע " + thisWeek + ", אז עושים את " + spellWeek.label);
  for (const t of facts) { const li = document.createElement("li"); li.textContent = t; $("spellFacts").appendChild(li); }
  setFb("spellIntroFb", "");
  const saved = load("tp-spell", null);
  const resumable = saved && saved.key === buildKey(spellWeek) && saved.stage !== "done";
  $("startSpellBtn").disabled = false;
  if (resumable) {
    spell = saved;
    $("startSpellBtn").textContent = "ממשיכים ממילה " + (saved.at + 1);
    $("restartSpellBtn").hidden = false;
    say(P.spellResume);
  } else {
    spell = null;
    $("startSpellBtn").textContent = "מתחילים!";
    say(P.spellIntro);
  }
}

function startSpelling(fromScratch) {
  if (!spellWeek) return;
  if (fromScratch || !spell) spell = buildDictation(spellWeek);
  save("tp-spell", spell);
  preload([P.howSpell, P.spelledRight, P.spellTryAgain, P.thisIsHow, ...Object.values(LETTER_NAMES), ...spell.words.flatMap(w => [w.spoken, w.sentence])]);
  showSpellWord();
}
$("startSpellBtn").onclick = () => startSpelling(false);
$("restartSpellBtn").onclick = () => startSpelling(true);

function showSpellWord() {
  show("spellWord");
  const n = spell.words.length;
  attempt = []; tries = 0; spellLocked = false;
  $("spellNum").textContent = (spell.at + 1) + " / " + n;
  $("spellBar").style.width = (spell.at / n * 100) + "%";
  $("spellNextBtn").textContent = "דלג ←";
  if (voiceBlocked) $("pad").hidden = false;
  setFb("spellFb", "");
  renderAttempt();
  if (!voiceBlocked) setStatus("אומרים את האותיות, אחת אחרי השנייה");
  promptWord();
}

function promptWord() {
  const w = spell.words[spell.at];
  say([P.howSpell, w.spoken, w.sentence]).then(done => { if (done) autoListen(); });
}
function autoListen() {
  if (current === "spellWord" && !spellLocked && !voiceBlocked) listenOnce(true);
}

// Boxes for the word's letters; marks colours each box ("ok", "miss" or "reveal")
function renderAttempt(marks) {
  const target = targetOf(spell.words[spell.at]);
  const box = $("spellTiles"); box.innerHTML = "";
  for (let i = 0; i < Math.max(target.length, attempt.length); i++) {
    const t = document.createElement("span");
    t.textContent = attempt[i] || "";
    if (attempt[i]) t.classList.add("filled");
    if (marks && marks[i]) t.classList.add(marks[i]);
    box.appendChild(t);
  }
}

function addLetters(ls) {
  if (spellLocked || !ls.length) return;
  attempt.push(...ls);
  renderAttempt();
  if (attempt.length >= targetOf(spell.words[spell.at]).length) return checkAttempt();
  setTimeout(autoListen, 150);
}

function checkAttempt() {
  const w = spell.words[spell.at], target = targetOf(w);
  spellLocked = true;
  if (baseLetters(attempt.join("")) === baseLetters(target.join(""))) {
    attempt = [...target]; // show the word with its real final letters
    renderAttempt(target.map(() => "ok"));
    spell.marks[spell.at] = tries === 0 ? "ok" : "ok2"; save("tp-spell", spell);
    addStars(1);
    setFb("spellFb", "נכון! " + w.written + " ⭐", "good");
    $("spellNextBtn").textContent = "הבאה ←";
    return say([P.spelledRight, pick(PRAISE)]).then(scheduleAdvance);
  }
  tries++;
  renderAttempt(attempt.map((c, i) => baseLetters(c) === baseLetters(target[i] || "") ? "ok" : "miss"));
  if (tries < 2) {
    setFb("spellFb", "לא בדיוק. מנסים שוב!", "try");
    return say(P.spellTryAgain).then(done => {
      if (current !== "spellWord") return;
      attempt = []; spellLocked = false; renderAttempt();
      if (done) autoListen();
    });
  }
  // Second miss: show and spell the word, then move on
  spell.marks[spell.at] = "miss"; save("tp-spell", spell);
  attempt = [...target];
  renderAttempt(target.map(() => "reveal"));
  setFb("spellFb", "ככה מאייתים: " + w.written, "try");
  $("spellNextBtn").textContent = "הבאה ←";
  say([P.thisIsHow, ...target.map(c => LETTER_NAMES[c] || c), w.spoken]).then(scheduleAdvance);
}

function scheduleAdvance(done) {
  clearTimeout(advanceTimer);
  if (done !== false) advanceTimer = setTimeout(() => { if (current === "spellWord") spellNext(); }, 1800);
}

function spellNext() {
  clearTimeout(advanceTimer);
  if (!(spell.at in spell.marks)) spell.marks[spell.at] = "miss"; // a skipped word comes back for review
  if (spell.at + 1 >= spell.words.length) return finishSpelling();
  spell.at++; save("tp-spell", spell);
  showSpellWord();
}

function finishSpelling() {
  spell.stage = "done"; save("tp-spell", spell);
  spell.words.forEach((w, i) => recordResult(w.written, { ok: "right", ok2: "almost" }[spell.marks[i]] || "wrong"));
  show("spellDone");
  const list = $("spellResults"); list.innerHTML = "";
  let right = 0;
  spell.words.forEach((w, i) => {
    const ok = spell.marks[i] === "ok" || spell.marks[i] === "ok2";
    if (ok) right++;
    const li = document.createElement("li"); li.className = ok ? "ok" : "miss";
    const n = document.createElement("span"); n.className = "n"; n.textContent = i + 1;
    const word = document.createElement("span"); word.className = "w"; word.textContent = w.written;
    if (w.review) { const t = document.createElement("span"); t.className = "tag"; t.textContent = "חזרה"; word.append(" ", t); }
    const hear = document.createElement("button"); hear.className = "mini"; hear.textContent = "🔊"; hear.setAttribute("aria-label", "לשמוע את " + w.written);
    hear.onclick = () => say(w.spoken);
    const res = document.createElement("span"); res.className = "mini result " + (ok ? "yes" : "no"); res.textContent = ok ? "✓" : "✗";
    res.setAttribute("aria-label", ok ? "נכון" : "טעות");
    li.append(n, word, hear, res);
    list.appendChild(li);
  });
  const total = spell.words.length, num = n => NUMS[n] || String(n);
  $("spellScore").textContent = right + " נכונות מתוך " + total;
  if (!voiceBlocked) setStatus("לוחצים על 🔊 כדי לשמוע מילה שוב");
  say([P.spellDone, num(right), P.outOf, num(total), pick(PRAISE)]);
}

function handleSpell(alts) {
  if (spellLocked) return;
  const ls = bestLetters(alts);
  if (ls.length) return addLetters(ls);
  if (saysPhrase(alts, ["מחק", "מחיקה", "מההתחלה", "טעיתי"])) {
    attempt = []; renderAttempt();
    return say(P.cleared).then(done => { if (done) autoListen(); });
  }
  if (saysPhrase(alts, AGAIN)) return promptWord();
  if (saysPhrase(alts, NEXT)) return spellNext();
  if (saysPhrase(alts, ["סיימתי", "בדיקה", "תבדוק", "תבדקי"]) && attempt.length) return checkAttempt();
  if (saysPhrase(alts, WANT_GUESS)) return openAnimalMenu();
  if (saysPhrase(alts, ["הכתבה"])) return openDictation();
  setFb("spellFb", "אומרים את שמות האותיות, למשל ״דלת, גימל״", "try");
  say(P.sayLettersHint).then(done => { if (done) autoListen(); });
}

// On-screen letters, for when the mic mishears a letter or isn't available
for (const c of "אבגדהוזחטיכךלמםנןסעפףצץקרשת") {
  const b = document.createElement("button");
  b.textContent = c; b.setAttribute("aria-label", LETTER_NAMES[c] ? stripNiqqud(LETTER_NAMES[c]) : c);
  b.onclick = () => { if (listening && rec) rec.abort(); addLetters([c]); };
  $("pad").appendChild(b);
}
$("padBtn").onclick = () => { $("pad").hidden = !$("pad").hidden; };
$("backBtn").onclick = () => { if (!spellLocked && attempt.length) { attempt.pop(); renderAttempt(); } };
$("spellSpeaker").onclick = () => { if (!spellLocked) promptWord(); else say(spell.words[spell.at].spoken); };
$("spellNextBtn").onclick = spellNext;
$("spellAgainBtn").onclick = () => openSpelling();
$("spellHomeBtn").onclick = () => goHome();
