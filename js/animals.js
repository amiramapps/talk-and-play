// Guess the animal from spoken clues.
// ---------- Animal game ----------
let animal = null, clueAt = 0, solved = false, lastAnimal = -1;

function startGuess() {
  show("guess");
  let i; do { i = Math.floor(Math.random() * ANIMALS.length); } while (i === lastAnimal);
  lastAnimal = i; animal = ANIMALS[i]; clueAt = 0; solved = false;
  $("mystery").textContent = "?"; $("mystery").classList.remove("found");
  $("choices").hidden = true; $("choices").innerHTML = "";
  setFb("guessFb", "");
  renderClue();
  if (voiceBlocked) showChoices();
  else setStatus("לוחצים על המיקרופון ואומרים את שם החיה");
  say([P.guessWho, animal.clues[0]]);
}

function renderClue() {
  $("clue").textContent = animal.clues[clueAt];
  $("dots").innerHTML = animal.clues.map((_, i) => `<i class="${i <= clueAt ? "on" : ""}"></i>`).join("");
}

function showChoices() {
  if (!animal || solved || !$("choices").hidden) return;
  const others = shuffle(ANIMALS.filter(a => a !== animal)).slice(0, 2);
  $("choices").innerHTML = "";
  for (const a of shuffle([animal, ...others])) {
    const b = document.createElement("button");
    b.className = "choice";
    b.innerHTML = `<span class="e">${a.e}</span><span>${a.name}</span>`;
    b.onclick = () => guess([a.alt[0]]);
    $("choices").appendChild(b);
  }
  $("choices").hidden = false;
}

function nextClue() {
  if (solved) return;
  if (clueAt < animal.clues.length - 1) {
    clueAt++; renderClue();
    if (clueAt === animal.clues.length - 1) showChoices();
    return say(animal.clues[clueAt]);
  }
  showChoices();
  say(P.lastClue);
}

function guess(alts) {
  if (solved) return;
  if (saidAny(alts, animal.alt)) {
    solved = true;
    $("mystery").textContent = animal.e; $("mystery").classList.add("found");
    $("choices").hidden = true;
    addStars(1);
    setFb("guessFb", "נכון! זה " + animal.name + "! ⭐", "good");
    return say([P.rightIAm, animal.name, pick(PRAISE), P.sayNextAnimal]);
  }
  const named = ANIMALS.find(a => saidAny(alts, a.alt));
  setFb("guessFb", named ? "זה לא " + named.name + ". מנסים שוב!" : "לא בדיוק. מנסים שוב!", "try");
  if (clueAt < animal.clues.length - 1) {
    clueAt++; renderClue();
    if (clueAt === animal.clues.length - 1) showChoices();
    return say([...(named ? [P.iAmNot, named.name] : [P.notQuite]), P.anotherClue, animal.clues[clueAt]]);
  }
  showChoices();
  say(P.lookAtPictures);
}

function reveal() {
  if (solved) return;
  solved = true;
  $("mystery").textContent = animal.e; $("mystery").classList.add("found");
  $("choices").hidden = true;
  setFb("guessFb", "זה היה " + animal.name + "!", "good");
  say([P.iWas, animal.name, P.tryAnother]);
}

function handleGuess(alts) {
  if (saysPhrase(alts, ["לא יודע", "לא יודעת", "מוותר", "מוותרת", "תגיד", "תגידי"])) return reveal();
  if (saysPhrase(alts, ["רמז", "עזרה", "תעזור", "תעזרי"])) return nextClue();
  if (saysPhrase(alts, AGAIN)) return say(animal.clues[clueAt]);
  if (saysPhrase(alts, ["הבא", "הבאה", "חדשה", "אחרת", "דלג", "עוד חיה"])) return startGuess();
  guess(alts);
}

$("hearBtn").onclick = () => animal && say(animal.clues[clueAt]);
$("hintBtn").onclick = nextClue;
$("nextAnimalBtn").onclick = startGuess;
