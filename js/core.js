// Shared helpers, saved progress, stars, talking (recorded clips or the phone's voice) and listening.
const $ = id => document.getElementById(id);
let current = "home";
const LANG = "he-IL";
const REVIEW_COUNT = 5;

const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);

// Hebrew text helpers: drop niqqud, apostrophes and punctuation so speech results compare cleanly
const stripNiqqud = t => t.replace(/[֑-ׇ]/g, "");
const clean = t => t.replace(/[֑-ׇ'"׳״`]/g, "").replace(/[.,!?;:־-]/g, " ").replace(/\s+/g, " ").trim();
// A spoken word matches a name with or without a one-letter prefix (הכלב, וכלב, זה כלב)
const PREFIXES = "הובלכמש";
const wordMatches = (w, n) => w === n || (w.length === n.length + 1 && PREFIXES.includes(w[0]) && w.slice(1) === n);
const saidAny = (alts, names) => alts.some(a => a.split(" ").some(w => names.some(n => wordMatches(w, n))));
const saysPhrase = (alts, phrases) => alts.some(a => phrases.some(p => a.includes(p)));

// ---------- Saved on this phone ----------
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

// ---------- Stars ----------
let stars = load("tp-stars", 0) || 0;
const renderStars = () => { $("stars").textContent = "⭐ " + stars; };
function addStars(n = 1) {
  stars += n;
  save("tp-stars", stars);
  renderStars();
  const el = $("stars"); el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
}
renderStars();

// ---------- Talking (text to speech) ----------
const canSpeak = "speechSynthesis" in window;
let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => /^(he|iw)/i.test(v.lang));
  voice = vs.find(v => /google|carmit|hila|avri/i.test(v.name)) || vs[0] || null;
}
if (canSpeak) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
  setTimeout(() => {
    if (!voice && speechSynthesis.getVoices().length && !voiceBlocked)
      setStatus("בטלפון הזה עוד אין קול בעברית. אפשר להוסיף אותו בהגדרות הטלפון, תחת ״הקראה״ או ״טקסט לדיבור״.");
  }, 2000);
}

// Recorded clips: audio/index.json maps each phrase to an mp3 ("slow:" + word for the slow version).
// A phrase without a clip is read by the phone's own Hebrew voice instead.
let clips = {};
const clipsReady = fetch("audio/index.json", { cache: "no-cache" })
  .then(r => (r.ok ? r.json() : {})).then(m => { clips = m || {}; }).catch(() => {});
const AC = window.AudioContext || window.webkitAudioContext;
let actx = null, source = null;
const buffers = new Map();
try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {} // play even when an iPhone is on silent
function unlockAudio() {
  if (!AC) return;
  const first = !actx;
  if (first) actx = new AC();
  if (actx.state === "suspended") actx.resume();
  if (first) clipsReady.then(() => preload([...Object.values(P), ...PRAISE]));
}
// Browsers only allow sound after a tap, so the audio is switched on by the first touch
document.addEventListener("pointerdown", unlockAudio, true);
document.addEventListener("keydown", unlockAudio, true);

function getBuffer(file) {
  if (!buffers.has(file)) {
    const p = fetch("audio/" + file)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(data => new Promise((res, rej) => actx.decodeAudioData(data, res, rej)));
    p.catch(() => buffers.delete(file));
    buffers.set(file, p);
  }
  return buffers.get(file);
}
function preload(texts) {
  if (!actx) return;
  for (const t of texts) if (t && clips[t.trim()]) getBuffer(clips[t.trim()]).catch(() => {});
}
async function playClip(file) {
  const buf = await getBuffer(file);
  if (actx.state === "suspended") await actx.resume();
  return new Promise(res => {
    const s = actx.createBufferSource();
    s.buffer = buf; s.connect(actx.destination);
    s.onended = () => { if (source === s) source = null; res(); };
    source = s; s.start();
  });
}

function speakDevice(text, rate) {
  return new Promise(resolve => {
    if (!canSpeak) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : LANG;
    u.rate = rate; u.pitch = 1.1;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = finish; u.onerror = finish;
    speechSynthesis.speak(u);
    setTimeout(finish, 1500 + text.length * 120 / rate); // some phones never fire onend
  });
}

// say("text") or say([part, part, ...]); resolves true if it finished without being interrupted
let speakToken = 0;
async function say(parts, slow = false) {
  stopSound();
  const token = ++speakToken;
  await clipsReady;
  for (const raw of [].concat(parts)) {
    const text = (raw || "").trim();
    if (!text) continue;
    if (token !== speakToken) return false;
    const file = (slow && clips["slow:" + text]) || clips[text];
    let played = false;
    if (file && actx) { try { await playClip(file); played = true; } catch (e) {} }
    if (!played && token === speakToken) await speakDevice(text, slow ? 0.6 : 0.9);
  }
  return token === speakToken;
}
function stopSound() {
  if (canSpeak) speechSynthesis.cancel();
  if (source) { const s = source; source = null; try { s.stop(); } catch (e) {} }
}
const hush = () => { speakToken++; stopSound(); };

// ---------- Listening (speech to text) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, voiceBlocked = !SR;
const mic = $("mic"), statusEl = $("status");
const setStatus = t => { statusEl.textContent = t; };
if (voiceBlocked) markNoVoice("הדפדפן הזה לא יכול להקשיב. לוחצים על הכפתורים, או פותחים את האפליקציה ב-Chrome או ב-Safari.");

function markNoVoice(msg) {
  voiceBlocked = true;
  mic.classList.add("off");
  setStatus(msg);
  if (current === "guess") showChoices();
}

function listen() {
  return new Promise((resolve, reject) => {
    hush();
    rec = new SR();
    rec.lang = LANG; rec.interimResults = false; rec.maxAlternatives = 5;
    // Hand back the result once the mic has closed, so the app can listen again right away
    let heard = null, error = null;
    rec.onresult = e => { heard = Array.from(e.results[0]).map(a => clean(a.transcript)).filter(Boolean); };
    rec.onerror = e => { error = e.error; };
    rec.onend = () => { setListening(false); if (!heard && error && error !== "aborted") reject(error); else resolve(heard || []); };
    setListening(true);
    try { rec.start(); } catch (err) { setListening(false); reject("not-allowed"); }
  });
}
function setListening(on) {
  listening = on;
  mic.classList.toggle("listening", on);
  if (on) setStatus("מקשיבים…");
}

mic.addEventListener("click", () => {
  if (voiceBlocked) { say(P.tapButtons); return; }
  if (listening) { rec && rec.stop(); return; }
  listenOnce(false);
});

// auto: the app started listening by itself; if the phone refuses, the child just taps the mic
async function listenOnce(auto) {
  if (voiceBlocked || listening) return;
  try {
    const heard = await listen();
    if (!heard.length) { setStatus(auto ? "לוחצים על המיקרופון ומדברים" : "לא שמעתי כלום. לוחצים ומנסים שוב!"); return; }
    setStatus("שמעתי: ״" + heard[0] + "״");
    handle(heard);
  } catch (err) {
    if (auto) setStatus("לוחצים על המיקרופון ומדברים");
    else if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture") {
      markNoVoice("המיקרופון כבוי כאן. לוחצים על הכפתורים, או פותחים את האפליקציה בדף משלה.");
    } else if (err === "no-speech") {
      setStatus("לא שמעתי כלום. לוחצים ומנסים שוב!");
    } else if (err === "language-not-supported") {
      markNoVoice("הטלפון הזה לא מזהה דיבור בעברית. לוחצים על הכפתורים במקום.");
    } else {
      setStatus("אופס, לא הצלחתי להקשיב. לוחצים על המיקרופון ומנסים שוב.");
    }
  }
}
