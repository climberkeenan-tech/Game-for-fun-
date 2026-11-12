// Game tuning. Distances are in "shoulder widths" (S): the distance between the
// player's shoulder joints on screen, so pads scale with how far away you stand.
// Pad offsets are measured from the midpoint between the shoulders.
// x is outward toward the punching hand's side, y is down (negative = up).

export const PUNCHES = {
  1: { tag: 'Jab',   role: 'lead', x: 0.85, y: -0.80, kind: 'straight' },
  2: { tag: 'Cross', role: 'rear', x: 0.85, y: -0.80, kind: 'straight' },
  3: { tag: 'Hook',  role: 'lead', x: 1.45, y: -0.55, kind: 'hook' },
  4: { tag: 'Hook',  role: 'rear', x: 1.45, y: -0.55, kind: 'hook' },
  5: { tag: 'Upper', role: 'lead', x: 0.45, y: 0.05,  kind: 'upper' },
  6: { tag: 'Upper', role: 'rear', x: 0.45, y: 0.05,  kind: 'upper' },
};

// Speed levels unlock by score. Times are in milliseconds.
// approach: how long a pad is on screen before its ideal hit moment
// gap: rest between the end of one set and the start of the next
// beat: spacing between punches inside a combo
// maxLen: longest combo that can be called
// duck: chance that a set is replaced by a duck
export const LEVELS = [
  { at: 0,     approach: 1700, gap: 950, beat: 560, maxLen: 1, duck: 0 },
  { at: 3000,  approach: 1550, gap: 850, beat: 520, maxLen: 2, duck: 0 },
  { at: 8000,  approach: 1400, gap: 760, beat: 480, maxLen: 3, duck: 0.16 },
  { at: 16000, approach: 1280, gap: 680, beat: 440, maxLen: 3, duck: 0.18 },
  { at: 28000, approach: 1150, gap: 620, beat: 410, maxLen: 4, duck: 0.2 },
  { at: 45000, approach: 1050, gap: 560, beat: 380, maxLen: 4, duck: 0.22 },
  { at: 70000, approach: 950,  gap: 520, beat: 350, maxLen: 5, duck: 0.24 },
  { at: 100000, approach: 860,  gap: 480, beat: 330, maxLen: 5, duck: 0.25 },
];

export const LEVEL_BANNERS = [
  null,
  ['Pick it up', 'Speed 2 · two-punch combos'],
  ['Hands up', 'Speed 3 · duck under the bar'],
  ['Stay sharp', 'Speed 4 · less time per pad'],
  ['Championship rounds', 'Speed 5 · four-punch combos'],
  ['Keep firing', 'Speed 6 · no let-up'],
  ['Empty the tank', 'Speed 7 · five-punch combos'],
  ['Final gear', 'Speed 8 · top speed'],
];

// Trainer-style combinations, by length. Repeats weight the common ones.
export const COMBOS = {
  1: [[1], [1], [2], [2], [3], [4], [5], [6]],
  2: [[1, 1], [1, 2], [1, 2], [2, 3], [3, 2], [1, 6], [5, 2], [2, 1]],
  3: [[1, 2, 3], [1, 2, 3], [1, 1, 2], [2, 3, 2], [1, 2, 5], [3, 2, 3], [1, 6, 3]],
  4: [[1, 2, 3, 2], [1, 2, 5, 2], [1, 6, 3, 2], [1, 1, 2, 3]],
  5: [[1, 2, 3, 2, 3], [1, 2, 5, 6, 3], [1, 1, 2, 3, 2]],
};

export const SPOKEN = ['', 'one', 'two', 'three', 'four', 'five', 'six'];

export const HIT = {
  early: 420,      // a pad accepts hits this long before its ideal moment
  late: 300,       // and this long after; past that it counts as a miss
  inputLag: 70,    // camera + tracking delay subtracted before judging timing
  perfect: 110,    // |timing error| at or under this is PERFECT
  great: 220,      // at or under this is GREAT, otherwise GOOD
  minSpeed: 1.7,   // fist speed (shoulder widths per second) needed to count as a punch
  upperSpeed: 1.0, // uppercut pads need the fist moving up at least this fast
  reach: 1.25,     // hit radius as a multiple of the drawn pad radius
  cooldown: 170,   // one hand can land at most one pad per this many ms
};

export const POINTS = { PERFECT: 300, GREAT: 200, GOOD: 100, WRONG: 50, SLIP: 250 };

export const HEALTH = { start: 100, miss: 8, caught: 15, heal: { PERFECT: 3, GREAT: 2, GOOD: 1, WRONG: 0, SLIP: 4 } };

export const DUCK = {
  drop: 0.38,      // nose must sit this many shoulder widths below standing height
  recover: 900,    // quiet time after a duck before the next set
};

// Multiplier grows by 0.25 every 5 hits in a row, up to x4.
export function multiplierFor(combo) {
  return Math.min(4, 1 + Math.floor(combo / 5) * 0.25);
}
