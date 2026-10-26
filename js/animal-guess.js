// Animal game 2: the child thinks of an animal; the app asks up to 20 yes/no questions to find it.
// Each question is the trait that best splits the animals still possible. A wrong answer from the
// child doesn't end the game: animals are ranked by how many answers they don't fit.
const YES_WORDS = ["כן", "נכון", "בטח", "כמובן", "נכונה"];
const DONT_KNOW = ["לא יודע", "לא יודעת", "לא יודעים", "אולי", "לפעמים"];
let answers = [], excluded = new Set(), qCount = 0, pending = null, guessStage = "start";

function startAppGuess() {
  hush(); show("guessGame");
  guessStage = "start";
  $("guessStart").hidden = false; $("guessPlay").hidden = true; $("guessEnd").hidden = true;
  if (!voiceBlocked) setStatus("כשמוכנים, אומרים ״מתחילים״");
  listenAfter(say(P.guessIntro), "guessGame");
}

function beginGuessing() {
  answers = []; excluded = new Set(); qCount = 0; guessStage = "play";
  $("guessStart").hidden = true; $("guessPlay").hidden = false;
  if (!voiceBlocked) setStatus("עונים ״כן״, ״לא״ או ״לא יודעים״");
  nextQuestion();
}

// How many of the child's answers an animal doesn't fit ("sometimes" traits always fit)
function misfits(animal) {
  let n = 0;
  for (const { id, yes } of answers) {
    const v = traitOf(animal, id);
    if (yes !== null && v !== "some" && v !== yes) n++;
  }
  return n;
}

function nextQuestion() {
  const alive = ANIMALS.filter(a => !excluded.has(a));
  if (!alive.length) return endGuess(false);
  const fewest = Math.min(...alive.map(misfits));
  if (fewest > 2) return endGuess(false);
  const top = alive.filter(a => misfits(a) === fewest);
  const askedIds = new Set(answers.map(x => x.id));
  let best = null, bestScore = 0;
  for (const t of traitList) {
    if (askedIds.has(t.id)) continue;
    let y = 0, n = 0;
    for (const a of top) { const v = traitOf(a, t.id); if (v === true) y++; else if (!v) n++; }
    if (Math.min(y, n) > bestScore) { bestScore = Math.min(y, n); best = t; }
  }
  if (top.length === 1 || !best || qCount >= MAX_QUESTIONS - 1) return askGuess(pick(top));
  askTrait(best);
}

function askTrait(trait) {
  qCount++; pending = { trait };
  setQuestionProgress("guessNum", "guessBar", qCount);
  $("guessQuestion").textContent = trait.ask;
  listenAfter(say(trait.ask), "guessGame");
}

function askGuess(animal) {
  qCount++; pending = { animal };
  setQuestionProgress("guessNum", "guessBar", qCount);
  $("guessQuestion").textContent = "האם זה " + animal.e + " " + animal.name + "?";
  listenAfter(say([P.isIt, animal.name]), "guessGame");
}

// yes: true, false, or null for "don't know"
function answerApp(yes) {
  if (guessStage !== "play" || !pending) return;
  const { trait, animal } = pending;
  pending = null;
  if (animal) {
    if (yes === true) return endGuess(true, animal);
    excluded.add(animal);
  } else {
    answers.push({ id: trait.id, yes }); // a "don't know" is kept too, so the question isn't asked again
  }
  if (qCount >= MAX_QUESTIONS) return endGuess(false);
  nextQuestion();
}

function endGuess(appWon, animal) {
  guessStage = "end";
  $("guessPlay").hidden = true; $("guessEnd").hidden = false;
  addStars(1);
  if (!voiceBlocked) setStatus("אומרים ״משחק חדש״ כדי לשחק שוב");
  if (appWon) {
    $("guessReveal").hidden = true;
    $("guessResult").textContent = "יש! ניחשתי! " + animal.e + " " + animal.name + " ⭐";
    return say([P.iGuessed, pick(PRAISE)]);
  }
  $("guessResult").textContent = "ניצחתם! ⭐ על איזו חיה חשבתם?";
  $("guessReveal").hidden = false;
  listenAfter(say(P.youWin), "guessGame");
}

function revealAnimal(animal) {
  $("guessReveal").hidden = true;
  $("guessResult").textContent = "אה! חשבתם על " + animal.e + " " + animal.name + ".";
  say([P.youThoughtOf, animal.name, P.nextTime]);
}

function handleAppGuess(alts) {
  if (guessStage === "start") {
    if (saysPhrase(alts, START)) return beginGuessing();
    return listenAfter(say(P.spellSayStart), "guessGame");
  }
  if (guessStage === "end") {
    const named = ANIMALS.find(a => saidAny(alts, a.alt));
    if (named && !$("guessReveal").hidden) return revealAnimal(named);
    if (saysPhrase(alts, NEW_GAME)) return startAppGuess();
    return;
  }
  const words = alts[0].split(" ");
  if (saysPhrase(alts, DONT_KNOW)) return answerApp(null);
  if (words.includes("לא")) return answerApp(false);
  if (alts.some(a => a.split(" ").some(w => YES_WORDS.includes(w)))) return answerApp(true);
  listenAfter(say(P.answerYesNo), "guessGame");
}

animalGrid($("guessKnown"), null);
animalGrid($("guessReveal"), a => revealAnimal(a));
$("guessStartBtn").onclick = beginGuessing;
$("ansYes").onclick = () => { if (listening && rec) rec.abort(); answerApp(true); };
$("ansNo").onclick = () => { if (listening && rec) rec.abort(); answerApp(false); };
$("ansSkip").onclick = () => { if (listening && rec) rec.abort(); answerApp(null); };
$("guessNewBtn").onclick = () => startAppGuess();
