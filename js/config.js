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
// window: how long a pad stays up once it shows; hit it any time before then,
//   and the sooner the better
// gap: rest after one set is finished before the next one starts
// beat: spacing between the pads of a combo as they show up
// maxLen: longest combo that can be called
// duck: chance that a set is the coach throwing a punch back instead
export const LEVELS = [
  { at: 0,      window: 2200, gap: 750, beat: 450, maxLen: 1, duck: 0 },
  { at: 3000,   window: 2000, gap: 680, beat: 420, maxLen: 2, duck: 0 },
  { at: 8000,   window: 1850, gap: 620, beat: 390, maxLen: 3, duck: 0.16 },
  { at: 16000,  window: 1700, gap: 560, beat: 360, maxLen: 3, duck: 0.18 },
  { at: 28000,  window: 1550, gap: 500, beat: 330, maxLen: 4, duck: 0.2 },
  { at: 45000,  window: 1400, gap: 450, beat: 300, maxLen: 4, duck: 0.22 },
  { at: 70000,  window: 1300, gap: 400, beat: 280, maxLen: 5, duck: 0.24 },
  { at: 100000, window: 1200, gap: 360, beat: 260, maxLen: 5, duck: 0.25 },
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
  popIn: 140,      // ms a pad takes to pop in when it shows up (it can be hit right away)
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
  deep: 0.5,       // inside this share of the pad radius a hit counts at once
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
// uppercut) that then stops or turns back, or the arm snapping straight toward
// the camera, which the tracker's 3D estimate shows. It is judged once it has
// finished. Body bounce and sway are taken out first, so only the arm counts.
export const PUNCH = {
  look: 650,       // ms of fist movement searched for a finished punch
  move: 1.0,       // a stroke: the fist moving at least this fast (shoulder widths per second)...
  turn: 0.3,       // ...without turning more than about 70 degrees between camera frames
  speed: 1.5,      // a punch peaks at least this fast,
  travel: 0.3,     // covers at least this distance (shoulder widths)
  maxMs: 550,      // within this many ms,
  out: 0.1,        // and ends at least this much further from its shoulder than it started,
  up: 0.25,        // or this much higher (an uppercut).
  down: 0.2,       // It never drops more than this,
  low: 0.7,        // starts no lower than this below the shoulders (raising your hands isn't a punch)
  end: 0.45,       // and ends no lower than this below them.
  rise3: 0.2,      // At the camera: the arm straightens by this much in 3D...
  straight3: 0.8,  // ...to at least this straight...
  riseMs: 400,     // ...within this many ms, while on screen the arm looks
  shorten: 0.2,    // ...at least this much shorter (it points at the camera),
  hold: 70,        // ...and has stopped straightening for this long.
  early: 50,       // a punch counts for a pad if it started no more than this many ms before the pad showed up
  wrongAfter: 250, // A punch with the other hand takes a pad only once it has been up this long,
  wrongQuiet: 400, // ...while its own hand hasn't landed anything for this long,
  wrongTravel: 0.4, // ...and only a full punch (this far on screen, or at the camera).
};

// How good a landed punch was, from 25% to 100%: its points are multiplied by
// the factor of each flaw it had. Under `sloppy` it shows as SLOPPY and doesn't
// grow the combo; otherwise it shows PERFECT, GREAT or GOOD (by speed) with a
// tip if anything was off.
export const QUALITY = {
  floor: 0.25,
  sloppy: 0.8,
  cut: {
    hand: 0.5,    // the other hand's pad
    type: 0.75,   // an uppercut pad hit by a punch that didn't go up
    guard: 0.7,   // didn't start from the guard
    bob: 0.7,     // an uppercut that was one more stroke of a hand bobbing up and down
    curve: 0.75,  // a swing or wave rather than a punch
    slow: 0.85,
    short: 0.85,
    extend: 0.85,
    elbow: 0.85,
    bent: 0.85,
    snap: 0.85,
  },
  // Aim, for a punch that didn't reach its pad on screen: full marks within
  // aimFrom shoulder widths of the pad's edge, down to aimMin at aimTo or more.
  aimFrom: 0.3,
  aimTo: 1.2,
  aimMin: 0.6,
};

// Punch form. A good punch leaves the guard (fist within guardZone shoulder
// widths of the chin, elbow bent) in the last guardLook ms, reaches the pad
// within maxReach ms on a fairly direct line (an uppercut dips first), and
// stops or comes back there instead of carrying on through. Each flaw costs
// some of the punch's points (QUALITY).
export const FORM = {
  guardZone: 0.55,   // around the chin...
  ownGuard: 0.35,    // ...or this close to where this player holds that fist (learned)
  guardLow: 0.35,    // a learned guard spot is no lower than this below the shoulder line
  guardWide: 0.85,   // ...and no further out to the side than this,
  holdFor: 180,      // ...where the fist was held still for at least this many ms
  minTravel: 0.3,    // jabs, crosses and hooks travel at least this far from the guard (shoulder widths)
  guardBend: 0.85,   // in guard the arm is bent: straightness at most this
  guardLook: 700,
  restSpeed: 1.5,    // in the guard the fist slows below this (shoulder widths/s) at least once
  maxReach: 450,     // ms from leaving the guard to reaching the pad (straights and hooks)
  stray: 0.35,       // on the way, the fist strays sideways from the straight line by at most
  strayMin: 0.22,    // this share of the distance (or this many shoulder widths, if more)
  carry: 0.3,        // after the pad the fist may carry on this far (shoulder widths)
  turnBack: 0.05,    // it counts once the fist turns back this far,
  settle: 160,       // or after this many ms without carrying on
  hintEvery: 2500,   // ms between "No punch" reminders
  extend3: 0.15,     // jab/cross: the arm straightens by this much in 3D during the punch...
  straightArm: 0.75, // ...and ends at least this straight;
  extend2: 0.2,      // or in the flat image, by this much...
  straightArm2: 0.8, // ...ending at least this straight
  upperTop: 0.15,    // uppercut: drives up to within this of the chin (shoulder widths below it)
  bobLook: 1000,     // ...and the same fist didn't already rise
  bobRise: 0.25,     // ...this far in the bobLook ms before it,
  bobFrom: 0.15,     // ...from down around the pad's level (no higher than this above its center)
  elbowDrop: 0.1,    // hook: elbow no more than this far below the shoulder
  bentMax: 0.92,     // hook/uppercut: arm no straighter than this (no straight-arm swings)
  snap: 2.2,         // peak fist speed (shoulder widths per second) for a crisp punch,
  snap3: 1.2,        // or, at the camera, how fast the arm straightens (straightness per second)
  judgeAfter: 150,   // ms after a fist lands before the punch is judged (it pops at once)
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
