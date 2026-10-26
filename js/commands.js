// Voice commands and switching between screens.
// ---------- Commands ----------
const HOME = ["הביתה","תפריט","מסך ראשי","להתחלה"];
const WANT_GUESS = ["חיה","חיות","לנחש","ניחוש","חידה","חידות"];
const WANT_DICT = ["הכתבה","הכתבות","מילים","כתיבה","לכתוב"];
const WANT_SPELL = ["איות","לאיית","מאייתים","אותיות"];
const AGAIN = ["שוב","עוד פעם","חזור","תחזור","תחזרי","לא שמעתי","מה אמרת"];
const SLOW = ["לאט","יותר לאט"];
const NEXT = ["הבא","הבאה","כתבתי","דלג"];
const PAUSE = ["רגע","חכה","חכי","עצור","עצרי","הפסקה"];
const RESUME = ["ממשיכים","המשך","להמשיך","תמשיך","תמשיכי"];
const PREV = ["הקודם","הקודמת","אחורה"];
const START = ["מתחילים","להתחיל","מוכן","מוכנה","מוכנים","יאללה","כן"];

function handle(alts) {
  if (saysPhrase(alts, HOME)) { goHome(); return; }
  if (current === "spellWord") return handleSpell(alts);
  // In the animal games everything said is a question or an answer, so it goes to the game first
  if (current === "askGame") return handleAsk(alts);
  if (current === "guessGame") return handleAppGuess(alts);
  if (current === "animalMenu") return handleAnimalMenu(alts);
  if (!current.startsWith("spell") && saysPhrase(alts, WANT_SPELL)) { openSpelling(); return; }
  if (!current.startsWith("dict") && saysPhrase(alts, WANT_DICT)) { openDictation(); return; }
  if (saysPhrase(alts, WANT_GUESS)) { openAnimalMenu(); return; }
  if (current === "dictIntro") {
    if (saysPhrase(alts, START)) return startDictation(false);
    return say(P.sayStart);
  }
  if (current === "dictWord") {
    if (saysPhrase(alts, SLOW)) return sayWord(true);
    if (saysPhrase(alts, RESUME)) return setPaused(false);
    if (saysPhrase(alts, PAUSE)) return setPaused(true);
    if (saysPhrase(alts, PREV)) return goWord(-1);
    if (saysPhrase(alts, NEXT)) return goWord(1);
    if (saysPhrase(alts, AGAIN)) return sayWord();
    return say(P.dictCommands);
  }
  if (current === "dictCheck") return say(P.checkWithParent);
  if (current === "spellIntro") {
    if (saysPhrase(alts, START)) return startSpelling(false);
    return say(P.spellSayStart);
  }
  say(P.canSayGames);
}

// ---------- Screens ----------
const SCREENS = ["home", "dictIntro", "dictWord", "dictCheck", "spellIntro", "spellWord", "spellDone",
  "animalMenu", "askGame", "guessGame"];
function show(id) {
  if (id !== current && listening && rec) rec.abort();
  current = id;
  if (id !== "dictWord") { stopTimer(); letScreenSleep(); }
  if (id !== "spellWord") clearTimeout(advanceTimer);
  for (const s of SCREENS) $(s).hidden = s !== id;
  document.querySelector("main").scrollTop = 0;
}
function goHome() {
  hush(); show("home");
  if (!voiceBlocked) setStatus("לוחצים על המיקרופון ומדברים");
  say(P.whatToPlay);
}
$("homeBtn").onclick = goHome;
$("goDict").onclick = () => openDictation();
$("goSpell").onclick = () => openSpelling();
$("goGuess").onclick = () => openAnimalMenu();
