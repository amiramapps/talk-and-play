// How well the child knows each word, remembered on this phone, so weak words come back often
// and well-known words rarely. Each word sits in a box from 0 (just got it wrong) to 5 (knows it well):
// a mistake sends it back to box 0, and each right answer moves it up one box.
const BOX_WEIGHT = [16, 8, 4, 2, 1, 0.5]; // how likely a review word in each box is to be picked
const NEW_BOX = 2;                         // words not practiced yet start in the middle

function loadMastery() {
  const saved = load("tp-mastery", null);
  if (saved) return saved;
  // First run after this update: words marked wrong before start in box 0
  const start = {};
  for (const w of load("tp-missed", [])) start[w] = { box: 0, right: 0, wrong: 1 };
  return start;
}
let mastery = loadMastery();

// outcome: "right", "wrong", or "almost" (right on a second try), which keeps the word's box
function recordResult(word, outcome) {
  const m = mastery[word] || { box: NEW_BOX, right: 0, wrong: 0 };
  if (outcome === "wrong") { m.box = 0; m.wrong++; }
  else if (outcome === "right") { m.box = Math.min(BOX_WEIGHT.length - 1, m.box + 1); m.right++; }
  m.last = Date.now();
  mastery[word] = m;
  save("tp-mastery", mastery);
  renderWeakWords();
}

const boxOf = word => (mastery[word] ? mastery[word].box : NEW_BOX);

// Pick n review words at random without repeats, weak words much more often than known ones
function pickWeighted(words, n) {
  const pool = words.slice(), out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((sum, w) => sum + BOX_WEIGHT[boxOf(w.written)], 0);
    let r = Math.random() * total, i = 0;
    for (; i < pool.length - 1; i++) {
      r -= BOX_WEIGHT[boxOf(pool[i].written)];
      if (r <= 0) break;
    }
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// For parents on the home screen: the words that need the most practice
function renderWeakWords() {
  const weak = Object.keys(mastery).filter(w => mastery[w].box <= 1)
    .sort((a, b) => mastery[a].box - mastery[b].box || mastery[b].wrong - mastery[a].wrong);
  $("weakWords").textContent = weak.length ? "מילים לחיזוק: " + weak.slice(0, 6).join(", ") + "." : "";
}
renderWeakWords();
