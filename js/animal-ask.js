// Animal game 1: the app thinks of an animal; the child asks up to 20 yes/no questions to find it.
// Questions are understood by the words in them (TRAITS in js/content.js); naming an animal is a guess.
let secret = null, asked = 0, askOver = false;

function startAsk() {
  hush(); show("askGame");
  secret = pick(ANIMALS); asked = 0; askOver = false;
  $("askMystery").textContent = "?"; $("askMystery").classList.remove("found");
  $("askLog").innerHTML = "";
  $("askChips").hidden = $("askGrid").hidden = true;
  setFb("askFb", "");
  setQuestionProgress("askNum", "askBar", 0);
  if (!voiceBlocked) setStatus("לוחצים על המיקרופון ושואלים שאלה של כן או לא");
  listenAfter(say(P.askIntro), "askGame");
}

// The trait a question is about. The longest matching word wins, so "ארבע רגליים" beats "רגליים".
function traitInQuestion(alts) {
  let best = null, bestLen = 0;
  for (const a of alts) {
    const tokens = a.split(" ");
    for (const t of traitList) {
      for (const w of t.words) {
        const hit = w.includes(" ") ? a.includes(w) : tokens.some(tok => wordMatches(tok, w));
        if (hit && w.length > bestLen) { best = t; bestLen = w.length; }
      }
    }
  }
  return best;
}

function logAnswer(question, answer, cls) {
  const li = document.createElement("li");
  const q = document.createElement("span"); q.textContent = question;
  const a = document.createElement("b"); a.className = cls; a.textContent = answer;
  li.append(q, a);
  $("askLog").prepend(li);
}

function leftWarning() {
  const left = MAX_QUESTIONS - asked;
  if (left === 1) return [P.lastQuestion];
  if (left > 1 && left <= 5) return [P.questionsLeft, NUMS[left], P.questionsWord];
  return [];
}

function answerTrait(trait) {
  if (askOver) return;
  asked++;
  setQuestionProgress("askNum", "askBar", asked);
  const v = traitOf(secret, trait.id);
  const [word, cls, clip] = v === true ? ["כן", "a-yes", P.yes] : v === "some" ? ["לפעמים", "a-some", P.sometimes] : ["לא", "a-no", P.no];
  logAnswer(trait.ask, word, cls);
  setFb("askFb", "");
  if (asked >= MAX_QUESTIONS) return endAsk(false, [clip, P.outOfQuestions]);
  listenAfter(say([clip, ...leftWarning()]), "askGame");
}

function guessAnimal(animal) {
  if (askOver) return;
  asked++;
  setQuestionProgress("askNum", "askBar", asked);
  const right = animal === secret;
  logAnswer("האם זה " + animal.e + " " + animal.name + "?", right ? "כן!" : "לא", right ? "a-yes" : "a-no");
  if (right) return endAsk(true);
  $("askGrid").hidden = true;
  if (asked >= MAX_QUESTIONS) return endAsk(false, [P.notIt, animal.name, P.outOfQuestions]);
  listenAfter(say([P.notIt, animal.name, ...leftWarning()]), "askGame");
}

function endAsk(won, before = []) {
  askOver = true;
  $("askMystery").textContent = secret.e; $("askMystery").classList.add("found");
  $("askChips").hidden = $("askGrid").hidden = true;
  if (!voiceBlocked) setStatus("אומרים ״משחק חדש״ כדי לשחק שוב");
  if (won) {
    addStars(1);
    setFb("askFb", "נכון! זה " + secret.name + " ⭐", "good");
    return say([P.rightAnimal, secret.name, pick(PRAISE)]);
  }
  setFb("askFb", "החיה הייתה: " + secret.name, "try");
  say([...before, P.iThoughtOf, secret.name]);
}

function handleAsk(alts) {
  if (askOver) { if (saysPhrase(alts, NEW_GAME)) startAsk(); return; }
  const named = ANIMALS.find(a => saidAny(alts, a.alt));
  if (named) return guessAnimal(named);
  const trait = traitInQuestion(alts);
  if (trait) return answerTrait(trait);
  setFb("askFb", "לא הבנתי. אפשר לבחור שאלה מהרשימה 📋", "try");
  $("askChips").hidden = false;
  listenAfter(say(P.notUnderstood), "askGame");
}

// Questions and guesses by tapping, for when the mic mishears or isn't available
for (const t of traitList) {
  const b = document.createElement("button");
  b.textContent = t.ask;
  b.onclick = () => { if (listening && rec) rec.abort(); answerTrait(t); };
  $("askChips").appendChild(b);
}
animalGrid($("askGrid"), a => guessAnimal(a));
$("askListBtn").onclick = () => { $("askChips").hidden = !$("askChips").hidden; $("askGrid").hidden = true; };
$("askGuessBtn").onclick = () => { $("askGrid").hidden = !$("askGrid").hidden; $("askChips").hidden = true; };
$("askGiveUpBtn").onclick = () => { if (!askOver) endAsk(false); };
$("askNewBtn").onclick = () => startAsk();
