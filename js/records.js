// Grades, the leaderboard and the corner's notes for the scorecard.
// Everything is kept on this device (localStorage); nothing is sent anywhere.

const KEY = 'mittrush.boards';
const NAME_KEY = 'mittrush.name';
const SIZE = 10; // entries kept per leaderboard

// ---------------------------------------------------------------- grade

// Letter grades from a 0-100 rating, A+ down to F.
const LETTERS = [
  [97, 'A+'], [93, 'A'], [90, 'A-'],
  [87, 'B+'], [83, 'B'], [80, 'B-'],
  [77, 'C+'], [73, 'C'], [70, 'C-'],
  [67, 'D+'], [63, 'D'], [60, 'D-'],
  [0, 'F'],
];

function titleFor(rating) {
  if (rating >= 93) return 'Champion';
  if (rating >= 87) return 'Contender';
  if (rating >= 80) return 'Prospect';
  if (rating >= 70) return 'Journeyman';
  if (rating >= 60) return 'Club fighter';
  return 'Tomato can';
}

// How well you boxed, whatever the round length: accuracy counts most, then
// timing, then defense (when the coach threw anything back). Rounds with too
// few pads to judge get no grade.
export function gradeFor(r) {
  if (r.total < 8) return null;
  const accuracy = r.hits / r.total;
  const timing = r.hits ? (r.perfect + 0.7 * r.great + 0.4 * r.good) / r.hits : 0;
  const parts = [[0.5, accuracy], [0.35, timing]];
  if (r.ducks > 0) parts.push([0.15, r.slips / r.ducks]);
  const weight = parts.reduce((a, [w]) => a + w, 0);
  const rating = Math.round((100 * parts.reduce((a, [w, v]) => a + w * v, 0)) / weight);
  const letter = LETTERS.find(([min]) => rating >= min)[1];
  return { letter, rating, title: titleFor(rating), accuracy, timing };
}

// ---------------------------------------------------------------- leaderboard

// One board per round length, and separate ones for camera and tap/mouse play,
// which is far easier.
export function boardKey(mode, tapMode) {
  return `${mode}:${tapMode ? 'tap' : 'cam'}`;
}

function load() {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    return all && typeof all === 'object' ? all : {};
  } catch (e) {
    return {};
  }
}

function save(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch (e) {
    /* storage blocked: the board just won't persist */
  }
}

// The single best score from before leaderboards existed goes onto the
// 1-minute camera board, so nobody loses their record.
export function migrateOldBest() {
  try {
    const old = Number(JSON.parse(localStorage.getItem('mittrush.best') || '0')) || 0;
    if (!old) return;
    const all = load();
    const k = boardKey(60, false);
    if (!all[k] || !all[k].length) {
      all[k] = [{ id: 'old-best', name: getName(), score: old, letter: null, rating: null, level: null, date: null }];
      save(all);
    }
    localStorage.removeItem('mittrush.best');
  } catch (e) {
    /* nothing to migrate */
  }
}

export function getBoard(key) {
  const list = load()[key];
  return Array.isArray(list) ? list : [];
}

export function bestFor(key) {
  const list = getBoard(key);
  return list.length ? list[0].score : 0;
}

// Adds a finished round. Returns its place (1 = top) if it made the board, else null.
export function addEntry(key, entry) {
  const all = load();
  const list = Array.isArray(all[key]) ? all[key] : [];
  list.push(entry);
  // Ties keep the earlier score ahead.
  list.sort((a, b) => b.score - a.score);
  all[key] = list.slice(0, SIZE);
  save(all);
  const i = all[key].findIndex((e) => e.id === entry.id);
  return i >= 0 ? i + 1 : null;
}

export function renameEntry(key, id, name) {
  const all = load();
  const e = (all[key] || []).find((x) => x.id === id);
  if (!e) return;
  e.name = name;
  save(all);
}

export function getName() {
  try {
    return JSON.parse(localStorage.getItem(NAME_KEY) || '""') || 'You';
  } catch (e) {
    return 'You';
  }
}

export function setName(name) {
  try {
    localStorage.setItem(NAME_KEY, JSON.stringify(name));
  } catch (e) {
    /* not saved */
  }
}

export function cleanName(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return s || 'You';
}

// ---------------------------------------------------------------- corner notes

const GROUPS = [
  { key: 'straight', nums: [1, 2], name: 'Jabs and crosses', short: 'jabs and crosses',
    fix: 'Punch out toward the pad itself, up beside your head, not straight at the camera.' },
  { key: 'hook', nums: [3, 4], name: 'Hooks', short: 'hooks',
    fix: 'Swing the fist out to the side pad with your elbow up, then across.' },
  { key: 'upper', nums: [5, 6], name: 'Uppercuts', short: 'uppercuts',
    fix: 'Start the fist low and drive it straight up through the pad.' },
];

const pct = (x) => `${Math.round(x * 100)}%`;
const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

// What went well and what to work on, from what actually happened in the round.
// Each note gets a weight; the heaviest few are shown.
export function cornerNotes(r, { tapMode, dodges }) {
  const work = [];
  const good = [];
  const by = r.byPunch || {};
  const tally = (nums) => nums.reduce((a, n) => ({ hit: a.hit + (by[n]?.hit || 0), miss: a.miss + (by[n]?.miss || 0) }), { hit: 0, miss: 0 });

  // Punch types.
  for (const g of GROUPS) {
    const t = tally(g.nums);
    const n = t.hit + t.miss;
    if (n < 3) continue;
    const acc = t.hit / n;
    if (acc < 0.85) work.push({ w: (1 - acc) * n, text: `${g.name}: ${t.hit} of ${n} landed. ${tapMode ? 'Tap them as the ring closes.' : g.fix}` });
    else if (n >= 4) good.push({ w: acc * n, text: `Sharp ${g.short}: ${t.hit} of ${n} landed.` });
  }

  // One hand much weaker than the other.
  if (!tapMode && r.byHand) {
    const L = r.byHand.L;
    const R = r.byHand.R;
    const nL = L.hit + L.miss;
    const nR = R.hit + R.miss;
    if (nL >= 5 && nR >= 5) {
      const aL = L.hit / nL;
      const aR = R.hit / nR;
      if (Math.abs(aL - aR) >= 0.2) {
        const [weak, strong, wa, sa, color] = aL < aR ? ['left', 'right', aL, aR, 'blue'] : ['right', 'left', aR, aL, 'red'];
        work.push({ w: Math.abs(aL - aR) * (nL + nR) * 0.6, text: `Your ${weak} hand landed ${pct(wa)}, your ${strong} ${pct(sa)}. Keep the ${weak} hand up and ready for the ${color} pads.` });
      }
    }
  }

  // Timing.
  if (r.hits >= 5) {
    const bias = r.timingBias || 0;
    const perfectShare = r.perfect / r.hits;
    if (bias < -70) work.push({ w: (-bias / 40) * Math.min(1, r.hits / 15), text: `You were punching early, by about ${Math.round(-bias / 10) * 10} ms. Let the white ring close onto the pad, then hit.` });
    else if (bias > 70) work.push({ w: (bias / 40) * Math.min(1, r.hits / 15), text: `You were punching late, by about ${Math.round(bias / 10) * 10} ms. Start the punch as the ring is about to touch the pad.` });
    else if (perfectShare < 0.4) work.push({ w: (0.4 - perfectShare) * 12, text: `${pct(perfectShare)} of your hits were PERFECT. Land the punch right as the ring touches the pad: PERFECT is worth 3 times a GOOD.` });
    if (perfectShare >= 0.6) good.push({ w: perfectShare * 10, text: `Great timing: ${pct(perfectShare)} of your hits were PERFECT.` });
  }
  if ((r.early || 0) >= 3 && r.early >= 0.08 * r.total) work.push({ w: r.early * 0.8, text: `${r.early} ${tapMode ? 'taps' : 'punches'} came before the pad lit up. Wait for it to glow.` });

  // Defense.
  if (dodges && !tapMode && r.ducks > 0) {
    const caughtHook = r.caught?.hook || 0;
    const caughtStraight = r.caught?.straight || 0;
    if (caughtHook) work.push({ w: caughtHook * 2.5, text: `The hook caught you ${times(caughtHook)}. On "duck", bend your knees and drop your head well below where it was.` });
    if (caughtStraight) work.push({ w: caughtStraight * 2.5, text: `The straight caught you ${times(caughtStraight)}. On "slip", move your head to the side, at least a fist's width.` });
    if (!caughtHook && !caughtStraight && r.ducks >= 2) good.push({ w: r.ducks * 1.5, text: `Clean head movement: you dodged all ${r.ducks} punches.` });
  }

  // Combos and staying on your feet.
  if (r.bestCombo >= 20) good.push({ w: r.bestCombo / 4, text: `${r.bestCombo}-hit combo. That's where the big multipliers come from.` });
  else if (r.total >= 20 && r.bestCombo < 10) work.push({ w: 3, text: `Your longest combo was ${r.bestCombo}. Every 5 in a row adds x0.25 to your points, so a clean streak beats a fast miss.` });
  if (r.reason === 'ko') work.push({ w: 6, text: 'You got knocked down. Each missed pad costs health, and clean hits win some back, so slow down and land them.' });

  work.sort((a, b) => b.w - a.w);
  good.sort((a, b) => b.w - a.w);
  return { work: work.slice(0, 3).map((x) => x.text), good: good.slice(0, 2).map((x) => x.text) };
}
