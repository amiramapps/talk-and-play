// The dictation: 15 seconds per word, then checking together.
// ---------- Dictation timing ----------
// Each word gets 15 seconds: it is said at the start, again at 7.5 s and at 12 s, then the next word comes.
const WORD_SECONDS = 15, REPEAT_AT = [7.5, 12];
let timer = null, wakeLock = null;
function startTimer() {
  stopTimer();
  timer = { elapsed: 0, last: performance.now(), fired: 0, paused: false, id: setInterval(tick, 100) };
  renderTimer();
}
function stopTimer() { if (timer) clearInterval(timer.id); timer = null; }
function tick() {
  if (!timer) return;
  const now = performance.now();
  if (timer.paused || listening) { timer.last = now; return; } // hold the clock while paused or listening
  timer.elapsed += (now - timer.last) / 1000;
  timer.last = now;
  if (timer.fired < REPEAT_AT.length && timer.elapsed >= REPEAT_AT[timer.fired]) { timer.fired++; sayWord(); }
  if (timer.elapsed >= WORD_SECONDS) { goWord(1); return; }
  renderTimer();
}
function renderTimer() {
  const left = timer ? Math.max(0, WORD_SECONDS - timer.elapsed) : WORD_SECONDS;
  const secs = Math.ceil(left);
  $("ring").style.setProperty("--left", (left / WORD_SECONDS).toFixed(3));
  $("timeLeft").textContent = timer && timer.paused ? "⏸ עצרנו. לוחצים ״ממשיכים״" : secs === 1 ? "עוד שנייה" : "עוד " + secs + " שניות";
  $("pauseBtn").textContent = timer && timer.paused ? "▶ ממשיכים" : "⏸ רגע";
  $("pauseBtn").classList.toggle("paused", !!(timer && timer.paused));
}
function setPaused(on) {
  if (!timer || timer.paused === on) return;
  timer.paused = on;
  if (on) hush();
  renderTimer();
}
async function keepScreenOn() {
  try {
    if (!wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }
  } catch (e) {}
}
function letScreenSleep() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });

function showWord() {
  show("dictWord");
  const n = dict.words.length;
  $("wordNum").textContent = (dict.at + 1) + " / " + n;
  $("barFill").style.width = (dict.at / n * 100) + "%";
  $("prevBtn").disabled = dict.at === 0;
  $("nextBtn").textContent = dict.at === n - 1 ? "סיימתי ←" : "הבאה ←";
  if (!voiceBlocked) setStatus("אפשר להגיד: ״שוב״, ״לאט״, ״רגע״ או ״הבאה״");
  keepScreenOn();
  startTimer();
  announceWord();
}

function sayWord(slow = false) {
  const sp = $("speakerBtn"); sp.classList.remove("talking"); void sp.offsetWidth; sp.classList.add("talking");
  return say(dict.words[dict.at].spoken, slow);
}
// The first reading: "המילה הבאה: ספר", then the sentence if the parent added one
function announceWord() {
  const w = dict.words[dict.at];
  const sp = $("speakerBtn"); sp.classList.remove("talking"); void sp.offsetWidth; sp.classList.add("talking");
  return say([dict.at === 0 ? P.firstWord : P.nextWord, w.spoken, w.sentence]);
}

function goWord(step) {
  const n = dict.words.length;
  const to = dict.at + step;
  if (to < 0) return;
  stopTimer();
  if (to >= n) {
    dict.stage = "check"; save("tp-dict", dict);
    say([P.dictDone, pick(PRAISE), P.checkNow]);
    return showCheck(true);
  }
  dict.at = to; save("tp-dict", dict);
  showWord();
}
$("speakerBtn").onclick = () => sayWord();
$("slowBtn").onclick = () => sayWord(true);
$("pauseBtn").onclick = () => setPaused(!(timer && timer.paused));
$("prevBtn").onclick = () => goWord(-1);
$("nextBtn").onclick = () => goWord(1);

function showCheck(silent) {
  show("dictCheck");
  $("barFill").style.width = "100%";
  if (!voiceBlocked) setStatus("מסמנים ✓ או ✗ ליד כל מילה");
  const list = $("checklist"); list.innerHTML = "";
  dict.words.forEach((w, i) => {
    const li = document.createElement("li");
    const n = document.createElement("span"); n.className = "n"; n.textContent = i + 1;
    const word = document.createElement("span"); word.className = "w"; word.textContent = w.written;
    if (w.review) { const t = document.createElement("span"); t.className = "tag"; t.textContent = "חזרה"; word.append(" ", t); }
    const hear = document.createElement("button"); hear.className = "mini"; hear.textContent = "🔊"; hear.setAttribute("aria-label", "לשמוע את " + w.written);
    hear.onclick = () => say(w.spoken);
    const marks = document.createElement("div"); marks.className = "marks";
    for (const [val, label, cls] of [[true, "✓", "yes"], [false, "✗", "no"]]) {
      const b = document.createElement("button"); b.className = "mini mark " + cls; b.textContent = label;
      b.setAttribute("aria-label", (val ? "נכון: " : "טעות: ") + w.written);
      b.onclick = () => { dict.marks[i] = val; save("tp-dict", dict); renderMarks(); };
      marks.appendChild(b);
    }
    li.append(n, word, hear, marks);
    list.appendChild(li);
  });
  setFb("checkFb", "");
  renderMarks();
  if (!silent) say(P.checkHow);
}

function renderMarks() {
  const items = [...$("checklist").children];
  let right = 0, marked = 0;
  items.forEach((li, i) => {
    const m = dict.marks[i];
    li.classList.toggle("ok", m === true); li.classList.toggle("miss", m === false);
    li.querySelector(".yes").classList.toggle("on", m === true);
    li.querySelector(".no").classList.toggle("on", m === false);
    if (m !== undefined) marked++;
    if (m === true) right++;
  });
  $("score").textContent = right + " נכונות מתוך " + dict.words.length;
  $("finishCheckBtn").disabled = marked < dict.words.length || dict.stage === "done";
  $("finishCheckBtn").textContent = marked < dict.words.length ? "מסמנים עוד " + (dict.words.length - marked) : "סיימנו לבדוק";
}

$("finishCheckBtn").onclick = () => {
  if (dict.stage === "done") return;
  const right = dict.words.filter((_, i) => dict.marks[i] === true).length;
  // Remember mistakes so they come back as review words in the next weeks
  dict.words.forEach((w, i) => recordResult(w.written, dict.marks[i] === false ? "wrong" : "right"));
  dict.stage = "done"; save("tp-dict", dict);
  addStars(right);
  $("finishCheckBtn").disabled = true;
  const total = dict.words.length;
  const num = n => NUMS[n] || String(n);
  setFb("checkFb", "קיבלתם " + right + " ⭐", "good");
  say(right === total ? [P.allRight, pick(PRAISE)] : [num(right), P.outOf, num(total), pick(PRAISE), P.practiceAgain]);
};

function setFb(id, text, kind) {
  const el = $(id); el.textContent = text; el.className = "feedback" + (kind ? " " + kind : "");
}
