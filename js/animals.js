// Animal games: choosing between the two games, and what both games share.
// Game 1 (js/animal-ask.js): the app thinks of an animal, the child asks yes/no questions.
// Game 2 (js/animal-guess.js): the child thinks of an animal, the app asks yes/no questions.
const MAX_QUESTIONS = 20;
const ASK_WORDS = ["שואלים", "אני שואל", "אנחנו שואלים", "אני אשאל", "אשאל"];
const APP_GUESS_WORDS = ["תשאל", "תנחש", "מנחש", "האפליקציה"];
const NEW_GAME = ["משחק חדש", "עוד משחק", "עוד פעם", "חדש", "הבא", "שוב"];

// Each animal's traits: true (has it), "some" (sometimes), missing means no
for (const a of ANIMALS) {
  a.traits = {};
  for (const t of a.has.split(" ")) {
    if (t.endsWith("?")) a.traits[t.slice(0, -1)] = "some";
    else a.traits[t] = true;
  }
}
const traitOf = (animal, id) => animal.traits[id] || false;
const traitList = Object.entries(TRAITS).map(([id, t]) => ({ id, ...t }));

// A grid of animal pictures; onPick(animal) is called on a tap (null for a picture-only grid)
function animalGrid(box, onPick) {
  box.innerHTML = "";
  for (const a of ANIMALS) {
    const b = document.createElement(onPick ? "button" : "div");
    b.className = "choice";
    const e = document.createElement("span"); e.className = "e"; e.textContent = a.e;
    const n = document.createElement("span"); n.textContent = a.name;
    b.append(e, n);
    if (onPick) b.onclick = () => { if (listening && rec) rec.abort(); onPick(a); };
    box.appendChild(b);
  }
}

function setQuestionProgress(numId, barId, n) {
  $(numId).textContent = n + " / " + MAX_QUESTIONS;
  $(barId).style.width = (n / MAX_QUESTIONS * 100) + "%";
}

// After the app finishes talking, listen for the child's next words while that screen is still open
function listenAfter(speech, screen) {
  speech.then(done => { if (done && current === screen && !voiceBlocked) listenOnce(true); });
}

function openAnimalMenu() {
  hush(); show("animalMenu");
  if (!voiceBlocked) setStatus("לוחצים על משחק, או אומרים ״שואלים״ או ״תנחשי״");
  listenAfter(say(P.animalMenu), "animalMenu");
}

function handleAnimalMenu(alts) {
  if (saysPhrase(alts, APP_GUESS_WORDS)) return startAppGuess();
  if (saysPhrase(alts, ASK_WORDS)) return startAsk();
  listenAfter(say(P.animalMenu), "animalMenu");
}

$("goAsk").onclick = () => startAsk();
$("goAppGuess").onclick = () => startAppGuess();
