// Turns raw pose landmarks into what the game cares about: where the player is,
// how big they are on screen, and where each fist is and how fast it moves.

// Landmark smoothing (a "one euro" filter): strong when a point is nearly still,
// so resting fists and shoulders stop jittering, and almost none when it moves
// fast, so punches are not delayed. Speeds are measured in shoulder widths.
const SMOOTH = { minCutoff: 1.2, beta: 3.0, dCutoff: 2.5, resetGap: 300 };

const lowpass = (dt, cutoff) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

class PointFilter {
  constructor() {
    this.t = null;
  }

  filter(x, y, t, scale) {
    if (this.t === null || t - this.t > SMOOTH.resetGap || t <= this.t) {
      this.t = t;
      this.x = x;
      this.y = y;
      this.dx = 0;
      this.dy = 0;
      return this;
    }
    const dt = (t - this.t) / 1000;
    this.t = t;
    const ad = lowpass(dt, SMOOTH.dCutoff);
    this.dx += ad * ((x - this.x) / dt - this.dx);
    this.dy += ad * ((y - this.y) / dt - this.dy);
    const speed = Math.hypot(this.dx, this.dy) / scale;
    const a = lowpass(dt, SMOOTH.minCutoff + SMOOTH.beta * speed);
    this.x += a * (x - this.x);
    this.y += a * (y - this.y);
    return this;
  }
}

const NOSE = 0;
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const HANDS = {
  L: { shoulder: 11, elbow: 13, wrist: 15, pinky: 17, index: 19 },
  R: { shoulder: 12, elbow: 14, wrist: 16, pinky: 18, index: 20 },
};

// How straight an arm is: shoulder-to-wrist distance over the arm's length.
// About 0.55-0.75 in a guard, close to 1 at the end of a straight punch.
function straightness(s, e, w) {
  const arm = Math.hypot(e.x - s.x, e.y - s.y, (e.z || 0) - (s.z || 0)) + Math.hypot(w.x - e.x, w.y - e.y, (w.z || 0) - (e.z || 0));
  return arm > 0 ? Math.hypot(w.x - s.x, w.y - s.y, (w.z || 0) - (s.z || 0)) / arm : null;
}

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

  // extra: arm shape at this frame (straightness in 2D and 3D, elbow height).
  push(x, y, t, extra) {
    this.prev = this.cur;
    this.cur = { x, y, t, ...extra };
    this.visible = true;
    this.seq++;
    this.hist.push(this.cur);
    while (this.hist.length > 2 && t - this.hist[0].t > 1000) this.hist.shift();
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
    this.cur.vx = this.vx;
    this.cur.vy = this.vy;
    this.cur.sp = Math.hypot(this.vx, this.vy);
  }

  speed() {
    return Math.hypot(this.vx, this.vy);
  }

  // Samples from the last `ms` milliseconds (oldest first), never reaching back
  // past `since`, the sample that landed this hand's previous hit.
  recent(ms, since = -Infinity) {
    const out = [];
    if (!this.cur) return out;
    for (const s of this.hist) {
      if (s.t >= this.cur.t - ms && s.t >= since) out.push(s);
    }
    return out;
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
    this.filters = [];
    this.prevWrists = null;
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
    // The tracker sometimes swaps left and right arms for a frame or two. Keep
    // each fist on the arm it was on: if the two wrists are each much closer to
    // where the other one just was, swap the arms back.
    const raw = (i) => (lms[i] && (lms[i].visibility ?? 1) >= 0.3 ? map(lms[i].x, lms[i].y) : null);
    const wl = raw(15);
    const wr = raw(16);
    const pw = this.prevWrists;
    if (wl && wr && pw && now - pw.t < 200) {
      const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const same = d(wl, pw.L) + d(wr, pw.R);
      const cross = d(wl, pw.R) + d(wr, pw.L);
      if (cross < same * 0.5 && same > 0.5 * (this.S || 150)) {
        const world = lms.world;
        lms = lms.slice();
        for (const [a, b] of [[13, 14], [15, 16], [17, 18], [19, 20], [21, 22]]) [lms[a], lms[b]] = [lms[b], lms[a]];
        if (world) {
          lms.world = world.slice();
          for (const [a, b] of [[13, 14], [15, 16], [17, 18], [19, 20], [21, 22]]) [lms.world[a], lms.world[b]] = [lms.world[b], lms.world[a]];
        }
        this.prevWrists = { L: wr, R: wl, t: now };
      } else this.prevWrists = { L: wl, R: wr, t: now };
    } else this.prevWrists = wl && wr ? { L: wl, R: wr, t: now } : null;
    const pts = new Array(lms.length);
    const scale = Math.max(40, this.S || 150);
    for (let i = 0; i < lms.length; i++) {
      const l = lms[i];
      const p = map(l.x, l.y);
      const f = (this.filters[i] ||= new PointFilter()).filter(p.x, p.y, now, scale);
      pts[i] = { x: f.x, y: f.y, v: l.visibility ?? 1 };
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
      if (w.v < 0.3) {
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
      // Arm shape, for judging punch form. Left out when the elbow or shoulder
      // isn't tracked well enough to trust.
      const sh = pts[ids.shoulder];
      const el = pts[ids.elbow];
      const extra = {};
      // Where the body was at this frame (shoulder midpoint), so hits can be
      // judged from arm movement alone: bouncing or swaying moves the fists and
      // the pads together.
      if (shouldersOk) {
        extra.cx = (ls.x + rs.x) / 2;
        extra.cy = (ls.y + rs.y) / 2;
      }
      if (sh.v > 0.5 && el.v > 0.4) {
        extra.ext2 = straightness(sh, el, w);
        // How long the arm looks on screen: it looks much shorter when it
        // points at the camera, which backs up the 3D estimate.
        if (this.S) extra.arm2 = (Math.hypot(el.x - sh.x, el.y - sh.y) + Math.hypot(w.x - el.x, w.y - el.y)) / this.S;
        if (this.S) extra.elbowUp = (sh.y - el.y) / this.S;
        const W3 = lms.world;
        if (W3 && W3[ids.wrist] && W3[ids.elbow] && W3[ids.shoulder]) extra.ext3 = straightness(W3[ids.shoulder], W3[ids.elbow], W3[ids.wrist]);
      }
      hand.push(fx, fy, now, extra);
      handOk[key] = w.v > 0.6;
    }

    this.parts = { head: headOk, shoulders: shouldersOk, left: handOk.L, right: handOk.R };
  }

  // True while the player's upper body is being tracked.
  present(now) {
    return this.hasPose && now - this.lastGoodT < 700 && this.S > 0;
  }
}
