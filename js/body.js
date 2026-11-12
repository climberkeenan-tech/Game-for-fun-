// Turns raw pose landmarks into what the game cares about: where the player is,
// how big they are on screen, and where each fist is and how fast it moves.

const NOSE = 0;
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const HANDS = {
  L: { wrist: 15, pinky: 17, index: 19 },
  R: { wrist: 16, pinky: 18, index: 20 },
};

class Hand {
  constructor(key) {
    this.key = key;
    this.reset();
  }

  reset() {
    this.hist = [];
    this.cur = null;
    this.prev = null;
    this.visible = false;
    this.seq = 0;
    this.vx = 0;
    this.vy = 0;
  }

  push(x, y, t) {
    this.prev = this.cur;
    this.cur = { x, y, t };
    this.visible = true;
    this.seq++;
    this.hist.push(this.cur);
    while (this.hist.length > 2 && t - this.hist[0].t > 400) this.hist.shift();
    // Velocity against the oldest sample from the last ~160 ms, so a punch that
    // peaks between camera frames still reads as fast. On slow devices, where
    // frames arrive further apart, fall back to the previous sample.
    let ref = null;
    for (let i = 0; i < this.hist.length - 1; i++) {
      if (t - this.hist[i].t <= 160) {
        ref = this.hist[i];
        break;
      }
    }
    if (!ref && this.prev && t - this.prev.t <= 350) ref = this.prev;
    if (!ref) {
      this.vx = 0;
      this.vy = 0;
      return;
    }
    const dt = Math.max(16, t - ref.t) / 1000;
    this.vx = (x - ref.x) / dt;
    this.vy = (y - ref.y) / dt;
  }

  speed() {
    return Math.hypot(this.vx, this.vy);
  }
}

export class Body {
  constructor() {
    this.hands = { L: new Hand('L'), R: new Hand('R') };
    this.reset();
  }

  reset() {
    this.S = 0;
    this.anchor = null;
    this.nose = null;
    this.pts = null;
    this.hasPose = false;
    this.lastPoseT = -1e9;
    this.lastGoodT = -1e9;
    this.parts = { head: false, shoulders: false, left: false, right: false };
    this.hands.L.reset();
    this.hands.R.reset();
  }

  // map(x, y) converts normalized camera coordinates to screen pixels (mirrored).
  update(lms, now, map) {
    if (!lms) {
      this.hasPose = false;
      this.parts = { head: false, shoulders: false, left: false, right: false };
      this.hands.L.visible = false;
      this.hands.R.visible = false;
      return;
    }
    this.hasPose = true;
    this.lastPoseT = now;
    const pts = new Array(lms.length);
    for (let i = 0; i < lms.length; i++) {
      const l = lms[i];
      const p = map(l.x, l.y);
      pts[i] = { x: p.x, y: p.y, v: l.visibility ?? 1 };
    }
    this.pts = pts;

    const nose = pts[NOSE];
    const ls = pts[L_SHOULDER];
    const rs = pts[R_SHOULDER];
    const shouldersOk = ls.v > 0.5 && rs.v > 0.5;
    const headOk = nose.v > 0.5;

    if (shouldersOk) {
      const s = Math.hypot(ls.x - rs.x, ls.y - rs.y);
      this.S = this.S ? this.S + (s - this.S) * 0.15 : s;
      const cx = (ls.x + rs.x) / 2;
      const cy = (ls.y + rs.y) / 2;
      if (!this.anchor) this.anchor = { x: cx, y: cy };
      else {
        this.anchor.x += (cx - this.anchor.x) * 0.2;
        this.anchor.y += (cy - this.anchor.y) * 0.2;
      }
      this.lastGoodT = now;
    }
    if (headOk) this.nose = { x: nose.x, y: nose.y };

    const handOk = {};
    for (const key of ['L', 'R']) {
      const ids = HANDS[key];
      const w = pts[ids.wrist];
      const hand = this.hands[key];
      if (w.v < 0.35) {
        hand.visible = false;
        handOk[key] = false;
        continue;
      }
      const i = pts[ids.index];
      const k = pts[ids.pinky];
      let fx = w.x;
      let fy = w.y;
      if (i.v > 0.2 && k.v > 0.2) {
        // Fist center sits between the wrist and the knuckles.
        fx = w.x * 0.4 + ((i.x + k.x) / 2) * 0.6;
        fy = w.y * 0.4 + ((i.y + k.y) / 2) * 0.6;
      }
      hand.push(fx, fy, now);
      handOk[key] = w.v > 0.6;
    }

    this.parts = { head: headOk, shoulders: shouldersOk, left: handOk.L, right: handOk.R };
  }

  // True while the player's upper body is being tracked.
  present(now) {
    return this.hasPose && now - this.lastGoodT < 700 && this.S > 0;
  }
}
