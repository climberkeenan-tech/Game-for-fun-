// Game tuning. Distances are in "shoulder widths" (S): the distance between the
// player's shoulder joints on screen, so pads scale with how far away you stand.
// Pad offsets are measured from the midpoint between the shoulders.
// x is outward toward the punching hand's side, y is down (negative = up).

export const PUNCHES = {
  1: { tag: 'Jab',   role: 'lead', x: 0.78, y: -0.8, kind: 'straight' },
  2: { tag: 'Cross', role: 'rear', x: 0.78, y: -0.8, kind: 'straight' },
  3: { tag: 'Hook',  role: 'lead', x: 1.35, y: -0.55, kind: 'hook' },
  4: { tag: 'Hook',  role: 'rear', x: 1.35, y: -0.55, kind: 'hook' },
  5: { tag: 'Upper', role: 'lead', x: 0.42, y: 0.08,  kind: 'upper' },
  6: { tag: 'Upper', role: 'rear', x: 0.42, y: 0.08,  kind: 'upper' },
};

// Pad size on screen, as a share of shoulder width. The cap only stops pads
// swamping a small window: it scales with the screen, so a laptop gets the same
// pad size relative to your body as a phone does.
export const PAD = { size: 0.38, min: 30, maxShare: 0.16 };

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
  ['Hands up', 'Speed 3 · slip and roll the counters'],
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

// A punch lands when the matching fist (blue pads: left, red pads: right) drives
// into a pad with real speed. The fist does not need to stop on the pad or be at
// full speed right there: its last `path` ms of movement are checked, which
// covers tracking lag and fists that blur between camera frames. Each pad only
// counts movement that starts after the previous pad was hit, so one punch, its
// follow-through, or the other hand moving with it can't take a second pad.
export const HIT = {
  early: 500,      // ms before its ideal moment that a pad starts taking hits (it lights up then)
  late: 360,       // ms after its ideal moment before an unhit pad counts as a miss
  inputLag: 70,    // camera + tracking delay subtracted before judging timing
  perfect: 120,    // |timing error| at or under this is PERFECT
  great: 250,      // at or under this is GREAT, otherwise GOOD
  path: 320,       // ms of recent fist movement checked against each pad
  minSpeed: 1.45,  // peak fist speed (shoulder widths per second) needed in that time
  approach: 0.16,  // the fist must end at least this much closer to the pad (shoulder widths)
  travel: 0.27,    // ...after moving at least this far, so a twitch or a resting fist never counts
  outward: 0.1,    // ...and moving out from the body, so pulling a fist back is never a punch
  upperRise: 0.3,  // uppercut pads need the fist to travel up at least this far
  reach: 1.3,      // hit radius as a multiple of the drawn pad radius
  fist: 0.1,       // plus the size of the fist itself (shoulder widths)
  deep: 0.5,       // inside this share of the pad radius a hit counts at once
  jump: 0.45,      // a one-frame fist jump bigger than this (shoulder widths) waits a frame to be confirmed
  spike: 0.25,     // a frame this far from both neighbours, which agree with each other, is a glitch
  oneFrame: 0.75,  // ...and one camera frame may cover at most this share of a punch's approach
  cooldown: 160,   // one hand can land at most one pad per this many ms
  justLit: 200,    // a punch landing this soon after its pad lit up, but started before, shows EARLY
  earlyQuiet: 300, // no EARLY within this many ms of any hit
  rearmSpeed: 0.9, // after a hit, that fist counts again once it slows below this (shoulder widths/s)
  rearmMax: 450,   // ...or pulls back, or after this many ms at the latest
  hold: 150,       // a pad waits for an earlier pad for the same hand until this long past its ideal moment
};

export const POINTS = { PERFECT: 300, GREAT: 200, GOOD: 100, SLIP: 250 };

export const HEALTH = { start: 100, miss: 8, caught: 15, heal: { PERFECT: 3, GREAT: 2, GOOD: 1, SLIP: 4 } };

// From speed 3 the coach throws punches back. A hook has to be rolled under
// (head drops); a straight can be slipped (head moves to either side) or ducked.
export const DUCK = {
  drop: 0.35,      // roll under: nose this many shoulder widths below standing height
  slip: 0.35,      // slip: nose this far to the side of where the punch was aimed
  recover: 900,    // quiet time after a dodge before the next set
};

// Multiplier grows by 0.25 every 5 hits in a row, up to x4.
export function multiplierFor(combo) {
  return Math.min(4, 1 + Math.floor(combo / 5) * 0.25);
}
