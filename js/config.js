// Game tuning. Distances are in "shoulder widths" (S): the distance between the
// player's shoulder joints on screen, so pads scale with how far away you stand.
// Pad offsets are measured from the midpoint between the shoulders.
// x is outward toward the punching hand's side, y is down (negative = up).
// Every pad sits well clear of where the fists rest in guard (about x 0.3,
// y -0.42), so a resting or shifting guard never sets one off.

export const PUNCHES = {
  1: { tag: 'Jab',   role: 'lead', x: 0.78, y: -0.8, kind: 'straight' },
  2: { tag: 'Cross', role: 'rear', x: 0.78, y: -0.8, kind: 'straight' },
  3: { tag: 'Hook',  role: 'lead', x: 1.35, y: -0.55, kind: 'hook' },
  4: { tag: 'Hook',  role: 'rear', x: 1.35, y: -0.55, kind: 'hook' },
  5: { tag: 'Upper', role: 'lead', x: 0.55, y: 0.3,   kind: 'upper' },
  6: { tag: 'Upper', role: 'rear', x: 0.55, y: 0.3,   kind: 'upper' },
};

// Pad size on screen, as a share of shoulder width. The cap only stops pads
// swamping a small window: it scales with the screen, so a laptop gets the same
// pad size relative to your body as a phone does.
export const PAD = { size: 0.38, min: 30, maxShare: 0.16 };

// Speed goes up as you go: each level starts once you've landed this many pads
// (`at`, dodged counter punches count too). Times are in milliseconds.
// window: how long a pad stays up once it shows; hit it any time before then,
//   and the sooner the better
// gap: rest after one set is finished before the next one starts
// beat: spacing between the pads of a combo as they show up
// maxLen: longest combo that can be called
// duck: chance that a set is the coach throwing a punch back instead
export const LEVELS = [
  { at: 0,  window: 2200, gap: 700, beat: 450, maxLen: 1, duck: 0 },
  { at: 6,  window: 2000, gap: 600, beat: 420, maxLen: 2, duck: 0 },
  { at: 14, window: 1800, gap: 500, beat: 380, maxLen: 3, duck: 0.15 },
  { at: 24, window: 1600, gap: 420, beat: 340, maxLen: 3, duck: 0.18 },
  { at: 36, window: 1450, gap: 350, beat: 300, maxLen: 4, duck: 0.2 },
  { at: 50, window: 1300, gap: 280, beat: 270, maxLen: 4, duck: 0.22 },
  { at: 66, window: 1150, gap: 220, beat: 240, maxLen: 5, duck: 0.24 },
  { at: 84, window: 1000, gap: 160, beat: 210, maxLen: 5, duck: 0.25 },
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

// A fist reaching a pad on screen: the matching fist (blue pads: left, red
// pads: right) drives into the pad with real speed. It counts the moment it
// gets there. (A punch that doesn't reach the pad counts too: see PUNCH.) The
// fist does not need to stop on the pad or be at full speed right there: its
// last `path` ms of movement are checked, which covers tracking lag and fists
// that blur between camera frames. Each pad only
// counts movement that starts after the previous pad was hit, so one punch, its
// follow-through, or the other hand moving with it can't take a second pad.
export const HIT = {
  popIn: 140,      // ms a pad takes to pop in when it shows up
  minReact: 150,   // nothing counts for a pad this soon after it shows up: too soon to be a reaction
  over: 0.03,      // a fist on a pad: its center inside the pad's circle (plus this, shoulder widths) counts,
  moveMin: 0.2,    // ...if the fist moved at least this far (shoulder widths)
  moveMs: 500,     // ...in the last this many ms to get there (a fist resting or shifting in its guard doesn't count),
  leave: 0.05,     // and a pad that popped up on a fist counts for it once it's this far off the pad
  inputLag: 70,    // camera + tracking delay subtracted before judging timing
  perfect: 650,    // hit within this many ms of the pad showing up for PERFECT (at most 45% of its window)
  great: 1000,     // ...within this for GREAT (at most 75% of its window), otherwise GOOD
  path: 320,       // ms of recent fist movement checked against each pad
  minSpeed: 1.5,   // peak fist speed (shoulder widths per second) needed in that time
  approach: 0.18,  // the fist moves in toward the pad by at least this much (shoulder widths),
  outward: 0.05,   // ...and out from the body, so pulling a fist back never counts
  upperRise: 0.25, // uppercut pads: the fist moves up into it by at least this much
  reach: 1.05,     // a hit: the fist gets within the pad's drawn radius times this,
  fist: 0.13,      // plus the size of the fist itself (shoulder widths),
  edge: 1.05,      // ...having come in from outside its edge (drawn radius times this, plus the fist)
  entry: 0.03,     // ...by at least this much, so a fist resting by a pad never counts
  jump: 0.45,      // a one-frame fist jump bigger than this (shoulder widths) waits a frame to be confirmed
  spike: 0.25,     // a frame this far from both neighbours, which agree with each other, is a glitch
  oneFrame: 0.75,  // ...and one camera frame may cover at most this share of a punch's approach
  cooldown: 160,   // one hand can land at most one pad per this many ms
  rearmSpeed: 0.9, // after a hit, that fist counts again once it slows below this (shoulder widths/s)
  rearmMax: 450,   // ...or pulls back, or after this many ms at the latest
};

// Any real punch lands on that hand's pad, even one that never reaches the pad
// on screen: a punch thrown at the camera hardly moves the fist in the picture.
// A punch is a quick stroke of the fist away from its shoulder (or up, for an
// uppercut), or the arm snapping straight toward the camera, which the
// tracker's 3D estimate shows. It counts the moment it's clearly a punch, while
// still on its way out. Body bounce and sway are taken out first, so only the
// arm counts.
export const PUNCH = {
  look: 650,       // ms of fist movement searched for a punch
  fresh: 120,      // a stroke counts only while it's going or this many ms after it ends
  move: 1.0,       // a stroke: the fist moving at least this fast (shoulder widths per second)...
  turn: 0.3,       // ...without turning more than about 70 degrees between camera frames
  speed: 1.5,      // a punch peaks at least this fast,
  travel: 0.3,     // covers at least this distance (shoulder widths)
  maxMs: 550,      // within this many ms,
  out: 0.1,        // and ends at least this much further out to that hand's side
  across: 0.05,    // (unless it started this far across the body: that's a fist coming back),
  guardX: 0.3,     // A punch across the body, at the other hand's pad, moves away from where
  guardY: -0.42,   // ...that hand sits in guard: this far to its side and above the shoulders.
  up: 0.25,        // or this much higher (an uppercut).
  down: 0.2,       // It never drops more than this,
  low: 0.7,        // starts no lower than this below the shoulders (raising your hands isn't a punch)
  end: 0.45,       // and ends no lower than this below them.
  rise3: 0.2,      // At the camera: the arm straightens by this much in 3D...
  straight3: 0.8,  // ...to at least this straight (on two frames in a row)...
  riseMs: 400,     // ...within this many ms, while on screen the arm looks
  shorten: 0.2,    // ...at least this much shorter (it points at the camera).
  react: 100,      // a punch counts for a pad only if it started at least this many ms after the pad showed up
  wrongAfter: 250, // A punch with the other hand takes a pad only once it has been up this long,
  wrongQuiet: 600, // ...while neither hand has landed anything for this long (an uppercut takes about that),
  wrongTravel: 0.4, // ...and only a full punch (this far on screen, or at the camera).
};

export const POINTS = { PERFECT: 300, GREAT: 200, GOOD: 100, SLIP: 250 };

export const HEALTH = { start: 100, miss: 8, caught: 15, heal: { PERFECT: 3, GREAT: 2, GOOD: 1, SLIP: 4 } };

// From speed 3 the coach throws punches back. A hook has to be rolled under
// (head drops); a straight can be slipped (head moves to either side) or ducked.
export const DUCK = {
  drop: 0.35,      // roll under: nose this many shoulder widths below standing height
  slip: 0.35,      // slip: nose this far to the side of where the punch was aimed
  warnMax: 1300,   // ms from the call to the glove landing: this much when counters start,
  warnMin: 800,    // ...down to this at the top speeds
  recover: 300,    // quiet time after a dodge before the next set, on top of the level's gap
};

// Multiplier grows by 0.25 every 5 hits in a row, up to x4.
export function multiplierFor(combo) {
  return Math.min(4, 1 + Math.floor(combo / 5) * 0.25);
}
