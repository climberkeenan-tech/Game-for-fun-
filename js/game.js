import {
  PUNCHES, PAD, LEVELS, COMBOS, SPOKEN, HIT, PUNCH, QUALITY, FORM, POINTS, HEALTH, DUCK, multiplierFor,
} from './config.js';

export const COLORS = {
  L: '#3cc4f2', // left hand
  R: '#ff4f6a', // right hand
  Ldark: '#123f52',
  Rdark: '#5c1424',
  chalk: '#f1ece1',
  ink: '#101216',
  gold: '#ffcf4a',
  hazard: '#ffb02e',
  miss: '#9aa0aa',
  mitt: '#d9822b', // the coach's glove when it comes back at you
  mittDark: '#6e360b',
};

export const FONT_DISPLAY = '"Big Shoulders Display", Impact, "Arial Narrow Bold", sans-serif';
export const FONT_BODY = '"Barlow Semi Condensed", "Arial Narrow", system-ui, sans-serif';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutBack = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

// Distance from point P to segment AB.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// A fist sample moved with the body: where it would be if the body were where
// it is now (the pads' anchor). Bouncing or swaying then doesn't look like a
// punch; only the arm's own movement does.
function onBody(s, F) {
  if (s.cx == null) return s;
  return { ...s, x: s.x - s.cx + F.ax, y: s.y - s.cy + F.ay };
}

// Drops single camera frames that jump far from both neighbours while the
// neighbours stay close together: tracking glitches, not fist movement.
function dropSpikes(path, S) {
  if (path.length < 3) return path;
  const out = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1];
    const b = path[i];
    const c = path[i + 1];
    const ab = Math.hypot(b.x - a.x, b.y - a.y);
    const bc = Math.hypot(c.x - b.x, c.y - b.y);
    const ac = Math.hypot(c.x - a.x, c.y - a.y);
    if (ab > HIT.spike * S && bc > HIT.spike * S && ac < 0.5 * Math.min(ab, bc)) continue;
    out.push(b);
  }
  out.push(path[path.length - 1]);
  return out;
}

// One arm measure (by default its straightness in 3D) for each sample,
// smoothed: the middle of three frames in a row, so one noisy frame can't make
// or break a punch. null where it isn't known.
function smooth3(path, k = 'ext3') {
  const n = path.length;
  return path.map((s, i) => {
    if (i === 0 || i === n - 1) return null;
    const v = [path[i - 1][k], s[k], path[i + 1][k]];
    if (v.some((x) => x == null)) return null;
    return v.sort((x, y) => x - y)[1];
  });
}

// How much the arm straightened (in 3D) from sample k to sample top, and how
// fast: timed from the last moment it was still near its lowest.
function riseOf(e, path, k, top) {
  let k2 = k;
  for (let j = k; j < top; j++) if (e[j] != null && e[j] <= e[k] + 0.04) k2 = j;
  const rise = e[top] - e[k];
  return { rise, rate: rise / Math.max(0.05, (path[top].t - path[k2].t) / 1000), t0: path[k2].t };
}

// The biggest quick straightening of the arm in 3D in this stretch of samples.
function armRise(path) {
  const e = smooth3(path);
  let best = { rise: 0, rate: 0 };
  for (let j = 0; j < path.length; j++) {
    if (e[j] == null) continue;
    let k = -1;
    for (let i = j - 1; i >= 0 && path[j].t - path[i].t <= PUNCH.riseMs; i--) {
      if (e[i] != null && (k < 0 || e[i] < e[k])) k = i;
    }
    if (k >= 0 && e[j] - e[k] > best.rise) best = riseOf(e, path, k, j);
  }
  return best;
}

// What a punch should do better, short enough for the pop-up.
const FLAW_TIPS = {
  hand: null, // depends on the pad: see tipFor
  type: 'drive it up',
  aim: 'aim at the pad',
  guard: 'start from your guard',
  bob: 'hands still, then punch',
  curve: 'punch straight to it',
  slow: 'snap it out',
  short: 'punch all the way out',
  extend: 'extend the arm',
  elbow: 'elbow up',
  bent: 'bend the arm',
  snap: 'snap it',
};

function tipFor(flaw, p) {
  if (flaw === 'hand') return p.hand === 'L' ? 'blue = left hand' : 'red = right hand';
  return FLAW_TIPS[flaw];
}

function judgeColor(j) {
  if (j === 'PERFECT') return COLORS.gold;
  if (j === 'GREAT') return COLORS.chalk;
  if (j === 'GOOD') return '#cfd3da';
  return COLORS.miss;
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
}

export class Game {
  constructor({ sfx, coach, events }) {
    this.sfx = sfx;
    this.coach = coach;
    this.events = events || {};
    this.view = { W: 1, H: 1, top: 0, bottom: 0 };
    this.running = false;
    this.ended = false;
    this.pads = [];
    this.ducks = [];
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.fxT = 0;
    this.shake = 0;
    this.flash = 0;
  }

  start({ duration, stance, tapMode, body, dodges = true }) {
    this.duration = duration * 1000; // 0 means survival
    this.tapMode = tapMode;
    this.dodges = dodges;
    this.body = body;
    this.leadHand = stance === 'southpaw' ? 'R' : 'L';
    this.rearHand = this.leadHand === 'L' ? 'R' : 'L';
    this.t = 0;
    this.fxT = 0;
    this.score = 0;
    this.displayScore = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.health = HEALTH.start;
    this.levelIdx = 0;
    this.topLevel = 0;
    this.pads = [];
    this.ducks = [];
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.nextSetT = 1400;
    this.restAfter = 0;
    this.lastWasDuck = false;
    this.stats = { hits: 0, clean: 0, sloppy: 0, perfect: 0, great: 0, good: 0, missed: 0, slips: 0, ducks: 0 };
    // Detail for the scorecard's grade and corner notes.
    this.detail = {
      byPunch: { 1: { hit: 0, miss: 0 }, 2: { hit: 0, miss: 0 }, 3: { hit: 0, miss: 0 }, 4: { hit: 0, miss: 0 }, 5: { hit: 0, miss: 0 }, 6: { hit: 0, miss: 0 } },
      byHand: { L: { hit: 0, miss: 0 }, R: { hit: 0, miss: 0 } },
      reactionSum: 0,
      reactionN: 0,
      caught: { hook: 0, straight: 0 },
      flaws: { hand: 0, type: 0, aim: 0, guard: 0, bob: 0, curve: 0, slow: 0, short: 0, extend: 0, elbow: 0, bent: 0, snap: 0 },
      qualitySum: 0,
      punches: 0,
      handsDown: 0,
    };
    this.shake = 0;
    this.flash = 0;
    this.handSeen = { L: body ? body.hands.L.seq : 0, R: body ? body.hands.R.seq : 0 };
    this.handCooldown = { L: -1e9, R: -1e9 };
    this.handUsed = { L: -Infinity, R: -Infinity };
    this.handLanded = { L: null, R: null }; // the last hit's direction, until the fist stops or pulls back
    this.guardSpot = { L: null, R: null }; // where this player holds each fist, relative to the shoulders
    this.judging = []; // punches that landed and are about to be judged
    this.baseline = !tapMode && body && body.nose ? body.nose.y : null;
    this.lastDuckEnd = -1e9;
    this.padSeq = 0;
    this.ended = false;
    this.endReason = null;
    this.running = true;
  }

  // Where the player is: shoulder midpoint and shoulder width in screen pixels.
  frameOf() {
    const { W, H } = this.view;
    if (this.tapMode || !this.body || !this.body.anchor) {
      return { ax: W / 2, ay: H * 0.52, S: Math.min(W * 0.3, H * 0.2) };
    }
    return { ax: this.body.anchor.x, ay: this.body.anchor.y, S: Math.max(40, this.body.S) };
  }

  padPos(p, F) {
    const def = PUNCHES[p.n];
    const side = p.hand === 'L' ? -1 : 1; // the camera image is mirrored, so your left is screen-left
    const { W, H, top, bottom } = this.view;
    const r = clamp(F.S * PAD.size, PAD.min, Math.max(PAD.min, Math.min(W, H) * PAD.maxShare));
    const x = clamp(F.ax + side * (def.x + p.jx) * F.S, r + 6, W - r - 6);
    const y = clamp(F.ay + (def.y + p.jy) * F.S, top + r, Math.max(top + r, H - bottom - r));
    return { x, y, r };
  }

  get level() {
    return LEVELS[this.levelIdx];
  }

  // Earliest (judged) time a punch can count for this pad: the moment it shows
  // up, or Infinity while it is still hidden behind this hand's current pad. It
  // also only counts movement after the last pad before it was hit (p.freeAt).
  freeFrom(p) {
    if (!p.shown) return Infinity;
    return Math.max(p.showT, p.freeAt ?? -Infinity);
  }

  // One pad per hand on screen: a pad stays hidden while an earlier pad for the
  // same hand is still up, so pads never stack and one punch can't meet two.
  waiting(p) {
    for (const q of this.pads) {
      if (q !== p && q.state === 'live' && q.hand === p.hand && q.id < p.id) return true;
    }
    return false;
  }

  // Shows pads whose turn has come. A pad can be hit the moment it shows, and
  // it stays up for its full time window from then.
  revealPads() {
    const order = this.pads.filter((p) => p.state === 'live' && !p.shown).sort((a, b) => a.id - b.id);
    for (const p of order) {
      if (this.t < p.showT || this.waiting(p)) continue;
      p.shown = true;
      p.showT = this.t;
      p.endT = this.t + p.life;
    }
  }

  // Pop-up text size: phone-sized on phones, bigger on laptop and desktop screens.
  get textBase() {
    return clamp(Math.min(this.view.W, this.view.H) * 0.045, 28, 46);
  }

  // ---------------------------------------------------------------- spawning

  // Sets (a single pad, a combo or a punch to dodge) come one after another:
  // the next one starts a short gap after the last one is finished, so the
  // faster you hit, the more pads you get.
  schedule() {
    const L = this.level;
    if (this.pads.some((p) => p.state === 'live') || this.ducks.some((d) => d.state === 'live')) return;
    if (this.nextSetT == null) this.nextSetT = this.t + this.restAfter;
    if (this.t < this.nextSetT) return;
    this.nextSetT = null;
    if (this.dodges && !this.tapMode && L.duck > 0 && !this.lastWasDuck && this.t > 3000 && Math.random() < L.duck) {
      // The coach throws one back: a hook to roll under or a straight to slip.
      const warn = clamp(L.window - 300, 1000, 1500);
      const F = this.frameOf();
      const nose = this.body && this.body.nose;
      const kind = Math.random() < 0.55 ? 'hook' : 'straight';
      this.ducks.push({
        kind,
        hitT: this.t + warn,
        warn,
        side: Math.random() < 0.5 ? -1 : 1,
        tx: nose ? nose.x : F.ax,
        ty: this.baseline ?? (nose ? nose.y : F.ay - 0.7 * F.S),
        state: 'live',
        doneT: 0,
      });
      this.restAfter = DUCK.recover;
      this.lastWasDuck = true;
      this.events.onCall?.([{ text: kind === 'hook' ? 'Duck' : 'Slip', hand: null }]);
      this.coach.say(kind === 'hook' ? 'duck' : 'slip', 1.2);
      this.sfx.warn();
      return;
    }
    this.lastWasDuck = false;
    const len = Math.random() < 0.25 ? 1 : 1 + Math.floor(Math.random() * L.maxLen);
    const seq = pick(COMBOS[len]);
    // A combo's pads show one beat apart (a hand's next pad waits for its
    // current one), and each can be hit as soon as it shows.
    seq.forEach((n, i) => {
      const def = PUNCHES[n];
      this.pads.push({
        id: ++this.padSeq,
        n,
        hand: def.role === 'lead' ? this.leadHand : this.rearHand,
        kind: def.kind,
        tag: def.tag,
        showT: this.t + i * L.beat,
        life: L.window,
        endT: Infinity,
        jx: rand(0, 0.08), // only outward, so left and right pads never touch
        jy: rand(-0.06, 0.06),
        shown: false,
        state: 'live',
        doneT: 0,
        x: 0,
        y: 0,
        r: 0,
      });
    });
    if (seq.length > 1) {
      this.events.onCall?.(seq.map((n) => ({
        text: String(n),
        hand: PUNCHES[n].role === 'lead' ? this.leadHand : this.rearHand,
      })));
      this.coach.say(seq.map((n) => SPOKEN[n]).join(' '));
    }
    this.restAfter = L.gap + (seq.length > 1 ? 200 : 0);
  }

  // ---------------------------------------------------------------- update

  step(dt) {
    if (!this.running) return;
    this.t += dt;
    this.schedule();
    this.revealPads();

    if (!this.tapMode && this.body) {
      for (const key of ['L', 'R']) {
        const h = this.body.hands[key];
        if (!h.visible || h.seq === this.handSeen[key]) continue;
        this.handSeen[key] = h.seq;
        this.learnGuard(key, h, this.frameOf());
        this.tryHand(key, h);
      }
    }

    this.judgeLanded(false);
    const judgeNow = this.t - (this.tapMode ? 0 : HIT.inputLag);
    for (const p of this.pads) {
      if (p.state === 'live' && p.shown && judgeNow > p.endT) this.onMiss(p);
    }
    this.revealPads();
    for (const d of this.ducks) {
      if (d.state === 'live' && this.t >= d.hitT) this.resolveDuck(d);
    }
    this.updateBaseline();

    this.pads = this.pads.filter((p) => p.state === 'live' || this.fxT - p.doneT < 700);
    this.ducks = this.ducks.filter((d) => d.state === 'live' || this.fxT - d.doneT < 600);

    this.updateFx(dt);

    if (this.health <= 0) {
      this.health = 0;
      this.end('ko');
    } else if (this.duration && this.t >= this.duration) {
      this.end('bell');
    }
  }

  updateFx(dt) {
    this.fxT += dt;
    const s = dt / 1000;
    for (const p of this.particles) {
      p.life += dt;
      p.vy += 900 * s;
      p.vx *= 0.985;
      p.x += p.vx * s;
      p.y += p.vy * s;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    this.texts = this.texts.filter((t) => this.fxT - t.t0 < 800);
    this.rings = this.rings.filter((r) => this.fxT - r.t0 < 400);
    this.shake *= Math.pow(0.002, s);
    if (this.shake < 0.3) this.shake = 0;
    this.flash = Math.max(0, this.flash - s * 2.2);
    this.displayScore += (this.score - this.displayScore) * Math.min(1, dt / 120);
    if (Math.abs(this.score - this.displayScore) < 1) this.displayScore = this.score;
  }

  // Standing nose height, used to judge ducks. Frozen around duck events.
  updateBaseline() {
    if (this.tapMode || !this.body || !this.body.nose) return;
    const busy = this.ducks.some((d) => d.state === 'live') || this.t - this.lastDuckEnd < 1200;
    if (busy) return;
    const y = this.body.nose.y;
    if (this.baseline == null) this.baseline = y;
    else this.baseline += (y - this.baseline) * 0.03;
  }

  // ---------------------------------------------------------------- hits

  // Checks the fist's recent movement against this hand's pads. A pad is hit
  // when the fist moved into it (uppercut pads: up through it) with real speed.
  // The hit is timed at the fist's closest point, so it waits one camera frame
  // for the fist to stop closing in unless the fist is already deep in the pad.
  tryHand(key, h) {
    if (this.t - this.handCooldown[key] < HIT.cooldown) return;
    const F = this.frameOf();
    // A fist that just landed is still following through. It counts again once
    // it slows down or pulls back, and only its movement from then on.
    const landed = this.handLanded[key];
    if (landed) {
      // New movement starts at the first camera frame since the hit where the fist
      // slowed or pulled back, or where the follow-through allowance ran out (the
      // fist may have been out of sight in between, mid-way into a new punch).
      let from = null;
      for (const s of h.hist) {
        if (s.t <= landed.t) continue;
        if (s.t - landed.t >= HIT.rearmMax) {
          from = landed.t + HIT.rearmMax;
          break;
        }
        const slow = (s.sp || 0) < HIT.rearmSpeed * F.S;
        const back = (s.vx || 0) * landed.vx + (s.vy || 0) * landed.vy < 0;
        if (slow || back) {
          from = s.t;
          break;
        }
      }
      if (from === null) return;
      this.handLanded[key] = null;
      this.handUsed[key] = Math.max(this.handUsed[key], from);
    }
    const all = h.recent(HIT.path, this.handUsed[key]);
    if (all.length < 2) return;
    const newest = all[all.length - 1];
    const judgeAt = (s) => this.t - HIT.inputLag - (newest.t - s.t);
    const now = judgeAt(newest);
    let best = null;
    for (const p of this.pads) {
      if (p.state !== 'live' || p.hand !== key) continue;
      const free = this.freeFrom(p);
      if (now < free) continue;
      // Only movement since the pad showed up counts.
      let start = 0;
      while (start < all.length && judgeAt(all[start]) < free) start++;
      const hit = this.punchInto(p, all.slice(start), F, judgeAt);
      if (hit && (!best || p.id < best.p.id)) best = { p, ...hit };
    }
    if (best) {
      this.handCooldown[key] = this.t;
      this.handUsed[key] = best.sampleT;
      this.handLanded[key] = { t: h.cur.t, vx: h.vx, vy: h.vy };
      this.noteGuardHand(key, F);
      this.land(best.p, key, best.judgeT, best.pos, h, best.sampleT);
      return;
    }

    // No fist reached a pad on screen. A finished punch still lands on this
    // hand's pad (or, by mistake, on the other hand's), however close it got:
    // how close, and how good a punch it was, decide what it scores.
    const punch = this.detectPunch(key, h, F);
    if (!punch) return;
    // Spend the motion, whether or not there's a pad for it.
    this.handUsed[key] = punch.t;
    const judgeT = judgeAt(punch);
    const target = this.targetFor(key, punch, judgeT, judgeAt({ t: punch.t0 }));
    if (!target) return;
    this.handCooldown[key] = this.t;
    this.noteGuardHand(key, F);
    this.land(target, key, judgeT, this.padPos(target, F), h, punch.t, punch);
  }

  // Which pad a finished punch lands on: this hand's pad if it was up, else the
  // other hand's, as a wrong-hand hit, if that one has been up a while and its
  // own hand isn't busy with it. Like a fist reaching a pad, only a punch
  // thrown after the pad showed up counts (startT: when it started).
  targetFor(key, punch, judgeT, startT) {
    let own = null;
    let other = null;
    for (const p of this.pads) {
      if (p.state !== 'live' || !p.shown || judgeT > p.endT) continue;
      const free = this.freeFrom(p);
      if (startT < free - PUNCH.early) continue;
      if (p.hand === key) {
        if (!own || p.id < own.id) own = p;
      } else if (judgeT >= free + PUNCH.wrongAfter && (!other || p.id < other.id)) other = p;
    }
    if (own) return own;
    if (!other || !(punch.depth || punch.travel >= PUNCH.wrongTravel)) return null;
    const ok = other.hand;
    if (this.t - this.handCooldown[ok] < PUNCH.wrongQuiet) return null;
    const oh = this.body && this.body.hands[ok];
    if (oh && oh.visible && oh.cur && (oh.cur.sp || 0) >= PUNCH.speed * this.frameOf().S) return null;
    return other;
  }

  // Finds a finished punch in this fist's movement since it last landed one:
  // a quick stroke away from its shoulder (or up, for an uppercut) that has
  // since stopped or turned, or the arm snapping straight toward the camera,
  // which the 3D estimate shows even when the fist hardly moves on screen.
  // Returns the earliest one, or null.
  detectPunch(key, h, F) {
    const raw = h.recent(PUNCH.look, this.handUsed[key]);
    if (raw.length < 3) return null;
    const path = dropSpikes(raw.map((s) => onBody(s, F)), F.S);
    if (path.length < 3) return null;
    const a = this.strokePunch(key, path, F);
    const b = this.depthPunch(path, F);
    if (a && b) return a.t <= b.t ? a : b;
    return a || b;
  }

  // A punch seen on screen: a fast, fairly straight stroke of the fist (each
  // camera frame moving it quickly, without turning sharply) away from its
  // shoulder or upward, never mainly down, that has ended.
  strokePunch(key, path, F) {
    const S = F.S;
    const n = path.length;
    const step = (i) => ({ x: path[i].x - path[i - 1].x, y: path[i].y - path[i - 1].y });
    const speedAt = (i) => {
      const d = step(i);
      return Math.hypot(d.x, d.y) / (Math.max(16, path[i].t - path[i - 1].t) / 1000) / S;
    };
    const side = key === 'L' ? -1 : 1;
    const sh = { x: F.ax + side * 0.5 * S, y: F.ay };
    let i = 1;
    while (i < n) {
      if (speedAt(i) < PUNCH.move) {
        i++;
        continue;
      }
      const a = i;
      let b = i;
      let peak = speedAt(i);
      while (b + 1 < n) {
        const v = speedAt(b + 1);
        const p = step(b);
        const q = step(b + 1);
        const cos = (p.x * q.x + p.y * q.y) / (Math.hypot(p.x, p.y) * Math.hypot(q.x, q.y) || 1);
        if (v < PUNCH.move || cos < PUNCH.turn) break;
        b++;
        peak = Math.max(peak, v);
      }
      // Still going: judge it once it stops or turns.
      if (b === n - 1) return null;
      i = b + 1;
      const st = path[a - 1];
      const en = path[b];
      const travel = Math.hypot(en.x - st.x, en.y - st.y) / S;
      const out = (Math.hypot(en.x - sh.x, en.y - sh.y) - Math.hypot(st.x - sh.x, st.y - sh.y)) / S;
      const up = (st.y - en.y) / S;
      if (peak < PUNCH.speed || travel < PUNCH.travel || en.t - st.t > PUNCH.maxMs) continue;
      if (out < PUNCH.out && up < PUNCH.up) continue;
      if (-up > PUNCH.down || (st.y - F.ay) / S > PUNCH.low || (en.y - F.ay) / S > PUNCH.end) continue;
      return { t: en.t, t0: st.t, start: st, end: en, depth: false, travel, up, peak };
    }
    return null;
  }

  // A punch at the camera: the arm straightens quickly in the 3D estimate and
  // then holds or bends back, while on screen it looks much shorter (it points
  // at the camera). Both have to agree, since the 3D estimate alone can be
  // noisy. The fist mustn't drop: lowering your arms straightens them too.
  depthPunch(path, F) {
    const S = F.S;
    const n = path.length;
    const e = smooth3(path);
    const a2 = smooth3(path, 'arm2');
    for (let i = 1; i < n - 1; i++) {
      if (e[i] == null || e[i] < PUNCH.straight3) continue;
      let k = -1;
      for (let j = i - 1; j >= 0 && path[i].t - path[j].t <= PUNCH.riseMs; j--) {
        if (e[j] != null && (k < 0 || e[j] < e[k])) k = j;
      }
      if (k < 0 || e[i] - e[k] < PUNCH.rise3) continue;
      let top = i;
      while (top + 1 < n && e[top + 1] != null && e[top + 1] >= e[top]) top++;
      // Looked shorter on screen than it did just before.
      let long = 0;
      for (let j = top - 1; j >= 0 && path[top].t - path[j].t <= PUNCH.riseMs; j--) if (a2[j] != null) long = Math.max(long, a2[j]);
      const short = [top - 1, top, top + 1].map((j) => a2[j]).filter((x) => x != null);
      if (!long || !short.length || Math.min(...short) > long * (1 - PUNCH.shorten)) {
        i = top;
        continue;
      }
      if (path[n - 1].t - path[top].t < PUNCH.hold) return null;
      const st = path[k];
      const en = path[top];
      const up = (st.y - en.y) / S;
      if (-up > PUNCH.down || (st.y - F.ay) / S > PUNCH.low || (en.y - F.ay) / S > PUNCH.end) {
        i = top;
        continue;
      }
      let peak = 0;
      for (let m = k + 1; m <= top; m++) peak = Math.max(peak, Math.hypot(path[m].x - path[m - 1].x, path[m].y - path[m - 1].y) / (Math.max(16, path[m].t - path[m - 1].t) / 1000) / S);
      const { rise, rate, t0 } = riseOf(e, path, k, top);
      return { t: en.t, t0, start: st, end: en, depth: true, up, peak, travel: Math.hypot(en.x - st.x, en.y - st.y) / S, rise, rate3: rate };
    }
    return null;
  }

  // Where a fist sits in guard: up by the chin.
  chinPoint(F) {
    const nose = this.body && this.body.nose;
    return nose ? { x: nose.x, y: nose.y + 0.3 * F.S } : { x: F.ax, y: F.ay - 0.42 * F.S };
  }

  // Judges a hit: a clean punch, or a sloppy one and why. A good punch leaves
  // the guard (the fist settled up by the chin, elbow bent), goes fairly
  // straight and quickly out to the pad (an uppercut dips and drives up, and
  // isn't one more stroke of a hand bobbing up and down), and has good form:
  // straights straighten the arm, hooks keep the elbow up and bent, uppercuts
  // keep the arm bent, and every punch is snappy. When the tracker can't see the
  // arm well enough to tell, it gets the benefit of the doubt. Returns the
  // flaws, most important first (empty for a clean punch).
  formOf(p, h, hit, F) {
    const punch = hit.punch;
    const hist = h.hist.map((s) => onBody(s, F));
    const ci = hist.findIndex((s) => s.t === hit.sampleT);
    if (ci < 0) return [];
    const contact = hist[ci];
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const inGuard = (s) => this.inGuard(h.key, s, F);
    const stepSpeed = (i) => (i > 0 ? dist(hist[i], hist[i - 1]) / Math.max(0.016, (hist[i].t - hist[i - 1].t) / 1000) / F.S : Infinity);
    const flaws = [];
    // Where it left the guard (the last frame in the guard before the hit),
    // and where it had settled there before that.
    let gi = -1;
    for (let i = ci - 1; i >= 0 && hist[i].t >= contact.t - FORM.guardLook; i--) {
      if (inGuard(hist[i])) {
        gi = i;
        break;
      }
    }
    let ri = -1;
    for (let i = gi; i >= 2 && hist[i].t >= contact.t - FORM.guardLook; i--) {
      if (inGuard(hist[i]) && inGuard(hist[i - 1]) && stepSpeed(i) <= FORM.restSpeed && stepSpeed(i - 1) <= FORM.restSpeed) {
        ri = i;
        break;
      }
    }
    // Did the arm snap straight toward the camera? Then the fist's path on
    // screen says little about the punch.
    const arm3 = armRise(hist.filter((s) => s.t >= contact.t - PUNCH.riseMs - 50 && s.t <= contact.t + FORM.judgeAfter));
    const atCamera = (punch && punch.depth) || arm3.rise >= PUNCH.rise3;
    if (gi < 0 || ri < 0) flaws.push('guard');
    else if (atCamera) {
      // Thrown at the camera: the fist's path on screen says little about it.
    } else if (p.kind !== 'upper') {
      const g = hist[gi];
      // A quick, fairly direct punch out to the pad.
      const cl = dist(g, contact) || 1;
      let stray = 0;
      for (let i = gi + 1; i < ci; i++) {
        stray = Math.max(stray, Math.abs((hist[i].x - g.x) * (contact.y - g.y) - (hist[i].y - g.y) * (contact.x - g.x)) / cl);
      }
      if (stray > Math.max(FORM.strayMin * F.S, FORM.stray * cl)) flaws.push('curve');
      else if (contact.t - g.t > FORM.maxReach) flaws.push('slow');
      else if (p.kind === 'hook' && dist(hist[ri], contact) < FORM.minTravel * F.S) flaws.push('short');
    } else {
      // One drive up, not another stroke of a hand bobbing up and down: no
      // earlier rise by this fist from down around the pad's level.
      let li = ci;
      for (let i = gi; i <= ci; i++) if (hist[i].y > hist[li].y) li = i;
      let lowest = -Infinity;
      for (let i = 0; i <= gi; i++) {
        if (hist[i].t < hist[li].t - FORM.bobLook) continue;
        if (hist[i].y >= hit.pos.y - FORM.bobFrom * F.S) lowest = Math.max(lowest, hist[i].y);
        if (lowest - hist[i].y >= FORM.bobRise * F.S) {
          flaws.push('bob');
          break;
        }
      }
    }

    // Arm shape, from typical (median) values, so one noisy tracker frame
    // can't make or break it.
    const around = hist.filter((s) => Math.abs(s.t - contact.t) <= 70);
    const finish = hist.filter((s) => s.t >= contact.t - 70 && s.t <= contact.t + FORM.judgeAfter);
    const before = hist.filter((s) => s.t >= contact.t - 450 && s.t <= contact.t - 150);
    const median = (arr, k) => {
      const v = arr.map((s) => s[k]).filter((x) => x != null).sort((a, b) => a - b);
      return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
    };
    // The most a value reached, ignoring one-frame spikes (best of the medians
    // of three frames in a row).
    const reached = (arr, k) => {
      const v = arr.map((s) => s[k]).filter((x) => x != null);
      if (v.length < 3) return median(arr, k);
      let m = -Infinity;
      for (let i = 1; i < v.length - 1; i++) m = Math.max(m, [v[i - 1], v[i], v[i + 1]].sort((a, b) => a - b)[1]);
      return m;
    };
    const e3 = median(around, 'ext3');
    if (p.kind === 'straight') {
      // The arm has to straighten during the punch (by the time it finishes).
      // The 3D estimate sees that even when the arm points at the camera; the
      // flat image can show it too when the arm reaches out to the side. Either
      // is enough.
      const e3 = reached(finish, 'ext3');
      const e3b = median(before, 'ext3');
      const e2 = reached(finish, 'ext2');
      const e2b = median(before, 'ext2');
      const by3 = e3 != null && e3b != null && e3 - e3b >= FORM.extend3 && e3 >= FORM.straightArm;
      const by2 = e2 != null && e2b != null && e2 - e2b >= FORM.extend2 && e2 >= FORM.straightArm2;
      const known = (e3 != null && e3b != null) || (e2 != null && e2b != null);
      if (known && !by3 && !by2) flaws.push('extend');
    } else if (p.kind === 'hook') {
      const up = median(around, 'elbowUp');
      if (up != null && up < -FORM.elbowDrop) flaws.push('elbow');
      else if (e3 != null && e3 > FORM.bentMax) flaws.push('bent');
    } else if (e3 != null && e3 > FORM.bentMax) flaws.push('bent');
    // Snappy: peak speed on the way in (and for an uppercut, the drive up
    // through), or, thrown at the camera, the arm straightening fast.
    // Fist speed over two camera frames, so a short, fast punch counts as fast.
    const until = p.kind === 'upper' ? contact.t + 200 : contact.t;
    let peak = 0;
    for (let i = 2; i < hist.length; i++) {
      if (hist[i].t < contact.t - HIT.path || hist[i].t > until) continue;
      peak = Math.max(peak, dist(hist[i], hist[i - 2]) / Math.max(0.032, (hist[i].t - hist[i - 2].t) / 1000) / F.S);
    }
    const snap3 = arm3.rise >= PUNCH.rise3 * 0.75 && arm3.rate >= FORM.snap3;
    if (peak < FORM.snap && !snap3) flaws.push('snap');
    return flaws;
  }

  // Is the fist in its guard: arm bent, and either near this player's own
  // guard spot (learned at the start of the round and while resting) or up in
  // front of the face and upper chest?
  inGuard(key, s, F) {
    const bent = s.ext3 != null ? s.ext3 <= FORM.guardBend : s.ext2 == null || s.ext2 <= FORM.guardBend;
    if (!bent) return false;
    const chin = this.chinPoint(F);
    if (Math.hypot(s.x - chin.x, s.y - chin.y) <= FORM.guardZone * F.S) return true;
    const own = this.guardSpot[key];
    return !!own && Math.hypot(s.x - (F.ax + own.x * F.S), s.y - (F.ay + own.y * F.S)) <= FORM.ownGuard * F.S;
  }

  // Learns where this player holds each fist: a bent arm resting (slow) up
  // around the face or chest, away from any pad.
  learnGuard(key, h, F) {
    const n = h.hist.length;
    if (n < 7) return;
    const b = onBody(h.hist[n - 1], F);
    // Held still for a moment (a wave only slows for an instant as it turns).
    let slow = b.t - h.hist[n - 7].t >= FORM.holdFor;
    for (let i = n - 6; i < n && slow; i++) {
      const a1 = onBody(h.hist[i], F);
      const a0 = onBody(h.hist[i - 1], F);
      const v = Math.hypot(a1.x - a0.x, a1.y - a0.y) / Math.max(0.016, (a1.t - a0.t) / 1000) / F.S;
      if (v > FORM.restSpeed * 0.6) slow = false;
    }
    const bent = b.ext3 != null ? b.ext3 <= FORM.guardBend : b.ext2 == null || b.ext2 <= FORM.guardBend;
    const rx = (b.x - F.ax) / F.S;
    const ry = (b.y - F.ay) / F.S;
    const up = ry <= FORM.guardLow && ry >= -1.1 && Math.abs(rx) <= FORM.guardWide;
    if (!slow || !bent || !up) return;
    for (const p of this.pads) {
      if (p.state === 'live' && p.shown && Math.hypot(b.x - this.padPos(p, F).x, b.y - this.padPos(p, F).y) < this.padPos(p, F).r * 1.5) return;
    }
    const g = this.guardSpot[key];
    if (!g) this.guardSpot[key] = { x: rx, y: ry };
    else {
      g.x += (rx - g.x) * 0.08;
      g.y += (ry - g.y) * 0.08;
    }
  }

  // Did the other hand stay up while this one punched? For the corner's notes.
  noteGuardHand(key, F) {
    const other = this.body && this.body.hands[key === 'L' ? 'R' : 'L'];
    if (!other || !other.visible || !other.cur) return;
    const chin = this.chinPoint(F);
    const o = onBody(other.cur, F);
    this.detail.punches++;
    if (Math.hypot(o.x - chin.x, o.y - chin.y) > FORM.guardZone * 1.2 * F.S) this.detail.handsDown++;
  }

  // Did the fist go over pad p in this stretch of movement? Any fist of the right
  // hand moving into the pad counts; formOf then judges whether it was a good
  // punch. Returns where and when (timed at the fist's closest point), or null.
  // Waits one camera frame while the fist is still closing in, unless it is
  // already deep in the pad. Pulling a fist back toward the body, a fist resting
  // at a pad's edge, and one-frame tracking glitches don't count.
  punchInto(p, rawPath, F, judgeAt) {
    if (rawPath.length < 2) return null;
    const raw = rawPath.map((s) => onBody(s, F));
    // A fist that jumps a long way in one camera frame may be a tracking glitch:
    // decide once the next frame shows whether it stays there.
    const last = raw[raw.length - 1];
    const prev = raw[raw.length - 2];
    if (Math.hypot(last.x - prev.x, last.y - prev.y) > HIT.jump * F.S) return null;
    const path = dropSpikes(raw, F.S);
    if (path.length < 2) return null;
    let peak = 0;
    for (const s of path) peak = Math.max(peak, s.sp || 0);
    if (peak / F.S < HIT.minSpeed) return null;

    const pos = this.padPos(p, F);
    const reach = pos.r * HIT.reach + HIT.fist * F.S;
    const newest = path[path.length - 1];
    let dMin = Infinity;
    let at = -1;
    let judgeT = 0;
    for (let i = 1; i < path.length; i++) {
      const t = judgeAt(path[i]);
      if (t > p.endT) continue;
      const d = segDist(pos.x, pos.y, path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
      if (d < dMin) {
        dMin = d;
        at = i;
        judgeT = t;
      }
    }
    if (at < 0 || dMin > reach) return null;
    if (at === path.length - 1 && Math.hypot(newest.x - pos.x, newest.y - pos.y) > pos.r * HIT.deep) return null;
    if (p.kind === 'upper') {
      // Moving up into it.
      let low = -Infinity;
      for (let i = 0; i < at; i++) low = Math.max(low, path[i].y);
      let high = Infinity;
      for (let i = at - 1; i < path.length; i++) high = Math.min(high, path[i].y);
      if ((low - high) / F.S < HIT.upperRise) return null;
    } else {
      // How far out the fist was before it closed in (it may have pulled back
      // from a previous pad first), and how far it actually travelled.
      let dFar = -1;
      let far = path[0];
      let farIdx = 0;
      for (let i = 0; i < at; i++) {
        const d = Math.hypot(path[i].x - pos.x, path[i].y - pos.y);
        if (d > dFar) {
          dFar = d;
          far = path[i];
          farIdx = i;
        }
      }
      // Coming in from outside it, toward its middle (a fist resting at the
      // edge of a pad, or bouncing there, doesn't count).
      const edge = pos.r * HIT.edge + HIT.fist * F.S;
      if (dFar < edge + HIT.entry * F.S || (dFar - dMin) / F.S < HIT.approach) return null;
      // A real punch closes in over several camera frames; a tracking glitch
      // covers nearly all of the distance in one.
      let step = 0;
      for (let i = farIdx + 1; i <= at; i++) {
        const before = Math.hypot(path[i - 1].x - pos.x, path[i - 1].y - pos.y);
        const after = i === at ? dMin : Math.hypot(path[i].x - pos.x, path[i].y - pos.y);
        step = Math.max(step, before - after);
      }
      if (step > HIT.oneFrame * (dFar - dMin)) return null;
      const out = Math.hypot(path[at].x - F.ax, path[at].y - F.ay) - Math.hypot(far.x - F.ax, far.y - F.ay);
      if (out / F.S < HIT.outward) return null;
    }
    // settled: the fist is already past its closest point, so later frames can't change the verdict.
    return { pos, judgeT, sampleT: path[at].t, settled: at < path.length - 1 };
  }

  tapAt(x, y) {
    if (!this.running) return false;
    const F = this.frameOf();
    let best = null;
    for (const p of this.pads) {
      if (p.state !== 'live' || this.t < this.freeFrom(p)) continue;
      const pos = this.padPos(p, F);
      if (Math.hypot(x - pos.x, y - pos.y) > pos.r * 1.35) continue;
      if (!best || p.id < best.p.id) best = { p, pos };
    }
    if (!best) return false;
    this.onHit(best.p, best.p.hand, this.t, best.pos);
    return true;
  }

  // A fist got to the pad: it pops right away with a thud. Whether it was a
  // good punch or a sloppy one is decided FORM.judgeAfter ms later, once the
  // punch has finished (the arm's full extension comes just after the fist
  // reaches the pad).
  land(p, key, judgeT, pos, h, sampleT, punch = null) {
    for (const q of this.pads) {
      if (q !== p && q.state === 'live' && q.hand === p.hand) q.freeAt = Math.max(q.freeAt ?? -Infinity, judgeT);
    }
    Object.assign(p, { state: 'hit', doneT: this.fxT, x: pos.x, y: pos.y, r: pos.r });
    this.burst(pos.x, pos.y, COLORS[p.hand], 10, pos.r);
    this.shake = Math.max(this.shake, 3);
    this.sfx.land();
    this.judging.push({ p, key, judgeT, pos, h, sampleT, punch, t0: this.t });
  }

  // Judges landed punches whose moment has come (all of them when forced, at
  // the final bell).
  judgeLanded(force) {
    if (!this.judging.length) return;
    const F = this.frameOf();
    const later = [];
    for (const j of this.judging) {
      if (!force && this.t - j.t0 < FORM.judgeAfter) {
        later.push(j);
        continue;
      }
      this.onHit(j.p, j.key, j.judgeT, j.pos, this.verdictOf(j, F), true);
    }
    this.judging = later;
  }

  // How good a landed punch was: the right hand, the right kind of punch, how
  // close it came to the pad, and its form. Each flaw costs a share of the
  // points; the tip is for the costliest one.
  verdictOf(j, F) {
    const { p, key, punch } = j;
    const flaws = [];
    if (key !== p.hand) flaws.push('hand');
    if (p.kind === 'upper' && punch && punch.up < PUNCH.up * 0.8) flaws.push('type');
    flaws.push(...this.formOf(p, j.h, { sampleT: j.sampleT, pos: j.pos, punch }, F));
    let quality = 1;
    let worst = null;
    let worstCut = 1;
    for (const f of flaws) {
      const c = QUALITY.cut[f];
      quality *= c;
      if (c < worstCut) {
        worstCut = c;
        worst = f;
      }
    }
    // Aim: only for a punch that didn't reach the pad on screen, and not one
    // thrown at the camera, whose spot on screen doesn't show where it went.
    if (punch && !punch.depth) {
      const edge = Math.hypot(punch.end.x - j.pos.x, punch.end.y - j.pos.y) - j.pos.r - HIT.fist * F.S;
      const k = clamp((edge / F.S - QUALITY.aimFrom) / (QUALITY.aimTo - QUALITY.aimFrom), 0, 1);
      const aim = 1 - (1 - QUALITY.aimMin) * k;
      if (aim < 0.97) {
        flaws.push('aim');
        quality *= aim;
        if (aim < worstCut) worst = 'aim';
      }
    }
    quality = clamp(quality, QUALITY.floor, 1);
    return { quality, flaws, tip: worst ? tipFor(worst, p) : null };
  }

  // verdict: how good the punch was (verdictOf); a tap is always full marks.
  onHit(p, key, judgeT, pos, verdict = null, landed = false) {
    // Faster is better: judged by how soon after the pad showed up it was hit.
    const reaction = Math.max(0, judgeT - p.showT);
    const j = reaction <= Math.min(HIT.perfect, p.life * 0.45) ? 'PERFECT' : reaction <= Math.min(HIT.great, p.life * 0.75) ? 'GREAT' : 'GOOD';
    const quality = verdict ? verdict.quality : 1;
    const flaws = verdict ? verdict.flaws : [];
    const clean = quality >= QUALITY.sloppy;
    // Later pads only count movement from here on, so this punch can't take one too.
    if (!landed) {
      for (const q of this.pads) {
        if (q !== p && q.state === 'live' && q.hand === p.hand) q.freeAt = Math.max(q.freeAt ?? -Infinity, judgeT);
      }
    }
    // Points scale with how good the punch was. A sloppy one doesn't grow the
    // combo or win back health, and it doesn't break the combo either.
    const pts = Math.round(POINTS[j] * quality * multiplierFor(this.combo));
    this.score += pts;
    if (clean) {
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.health = Math.min(HEALTH.start, this.health + HEALTH.heal[j]);
      this.stats.clean++;
    } else this.stats.sloppy++;
    for (const f of flaws) this.detail.flaws[f]++;
    this.detail.qualitySum += quality;
    this.stats.hits++;
    this.detail.byPunch[p.n].hit++;
    this.detail.byHand[p.hand].hit++;
    this.detail.reactionSum += reaction;
    this.detail.reactionN++;
    if (j === 'PERFECT') this.stats.perfect++;
    else if (j === 'GREAT') this.stats.great++;
    else this.stats.good++;

    if (!landed) Object.assign(p, { state: 'hit', doneT: this.fxT, x: pos.x, y: pos.y, r: pos.r });
    p.judge = clean ? j : 'SLOPPY';
    p.quality = quality;
    const color = COLORS[p.hand];
    const sub = verdict && verdict.tip ? `+${pts} · ${verdict.tip}` : `+${pts}`;
    if (clean) {
      this.burst(pos.x, pos.y, color, j === 'PERFECT' ? 18 : 10, pos.r);
      this.rings.push({ x: pos.x, y: pos.y, r: pos.r, t0: this.fxT, color: j === 'PERFECT' ? COLORS.gold : color });
      this.popText(j, pos.x, pos.y - pos.r - 14, judgeColor(j), sub);
      this.shake = Math.max(this.shake, j === 'PERFECT' ? 7 : 4);
      if (landed) this.sfx.judged(j);
      else this.sfx.hit(j);
    } else {
      this.popText('Sloppy', pos.x, pos.y - pos.r - 14, COLORS.miss, sub);
      if (landed) this.sfx.judged('SLOPPY');
      else this.sfx.hit('GOOD');
    }
    this.checkLevel();
  }

  onMiss(p) {
    const pos = this.padPos(p, this.frameOf());
    Object.assign(p, { state: 'missed', doneT: this.fxT, x: pos.x, y: pos.y, r: pos.r });
    this.stats.missed++;
    this.detail.byPunch[p.n].miss++;
    this.detail.byHand[p.hand].miss++;
    this.combo = 0;
    this.health -= HEALTH.miss;
    this.flash = Math.max(this.flash, 0.45);
    this.popText('Miss', pos.x, pos.y - pos.r - 14, COLORS.miss);
    this.sfx.miss();
  }

  // Is the head out of the way of an incoming glove? A hook has to be rolled
  // under. A straight can be slipped to either side or ducked.
  dodged(d, F) {
    if (this.baseline == null) return true;
    const nose = this.body && this.body.nose;
    if (!nose) return false;
    const under = nose.y > d.ty + DUCK.drop * F.S;
    if (d.kind === 'hook') return under;
    return under || Math.abs(nose.x - d.tx) > DUCK.slip * F.S;
  }

  resolveDuck(d) {
    const F = this.frameOf();
    const ok = this.dodged(d, F);
    d.state = ok ? 'slipped' : 'caught';
    d.doneT = this.fxT;
    this.stats.ducks++;
    this.lastDuckEnd = this.t;
    const x = clamp(d.tx, 80, this.view.W - 80);
    const y = d.ty - F.S * 0.9;
    if (ok) {
      this.stats.slips++;
      const pts = Math.round(POINTS.SLIP * multiplierFor(this.combo));
      this.score += pts;
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.health = Math.min(HEALTH.start, this.health + HEALTH.heal.SLIP);
      this.popText(d.kind === 'hook' ? 'Rolled under' : 'Slipped', x, y, COLORS.chalk, `+${pts}`);
      this.sfx.slip();
      this.checkLevel();
    } else {
      this.combo = 0;
      this.detail.caught[d.kind]++;
      this.health -= HEALTH.caught;
      this.flash = 1;
      this.shake = 16;
      this.burst(d.tx, d.ty, COLORS.mitt, 16, F.S * 0.3);
      this.popText('Caught', x, y, COLORS.R);
      this.sfx.caught();
    }
  }

  checkLevel() {
    while (this.levelIdx < LEVELS.length - 1 && this.score >= LEVELS[this.levelIdx + 1].at) {
      this.levelIdx++;
      this.topLevel = Math.max(this.topLevel, this.levelIdx);
      this.sfx.levelUp();
      this.events.onLevel?.(this.levelIdx);
    }
  }

  end(reason) {
    if (this.ended) return;
    this.judgeLanded(true);
    this.ended = true;
    this.running = false;
    this.endReason = reason;
    for (const p of this.pads) {
      if (p.state === 'live') {
        const pos = this.padPos(p, this.frameOf());
        Object.assign(p, { state: 'gone', doneT: this.fxT, x: pos.x, y: pos.y, r: pos.r });
      }
    }
    for (const d of this.ducks) {
      if (d.state === 'live') {
        d.state = 'gone';
        d.doneT = this.fxT;
      }
    }
    this.events.onEnd?.(this.result());
  }

  result() {
    const s = this.stats;
    const total = s.hits + s.missed;
    const d = this.detail;
    return {
      ...s,
      byPunch: d.byPunch,
      byHand: d.byHand,
      reaction: d.reactionN ? d.reactionSum / d.reactionN : 0,
      caught: d.caught,
      flaws: d.flaws,
      quality: s.hits ? d.qualitySum / s.hits : null,
      punches: d.punches,
      handsDown: d.handsDown,
      leadHand: this.leadHand,
      reason: this.endReason,
      score: this.score,
      time: this.t,
      duration: this.duration,
      bestCombo: this.bestCombo,
      total,
      accuracy: total ? s.hits / total : 0,
      level: this.topLevel + 1,
    };
  }

  // ---------------------------------------------------------------- effects

  burst(x, y, color, n, r) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(140, 460);
      this.particles.push({
        x: x + Math.cos(a) * r * 0.5,
        y: y + Math.sin(a) * r * 0.5,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 80,
        life: 0,
        max: rand(320, 640),
        size: rand(2, 5.5),
        color: Math.random() < 0.55 ? COLORS.chalk : color,
      });
    }
  }

  popText(text, x, y, color, sub) {
    // Keep it clear of the top bar; it rises a little as it fades.
    y = Math.max(this.view.top + this.textBase * 1.6, y);
    this.texts.push({ text: text.toUpperCase(), sub, x, y, color, t0: this.fxT });
  }

  // ---------------------------------------------------------------- drawing

  draw(ctx) {
    const F = this.frameOf();
    for (const d of this.ducks) this.drawDuck(ctx, d, F);
    // Later pads underneath so the next one to hit is always on top.
    const order = [...this.pads].sort((a, b) => b.id - a.id);
    for (const p of order) this.drawPad(ctx, p, F);
    this.drawRings(ctx);
    this.drawParticles(ctx);
    this.drawTexts(ctx);
  }

  drawPad(ctx, p, F) {
    if (!p.shown) return; // still waiting behind this hand's current pad
    const color = COLORS[p.hand];
    const dark = COLORS[p.hand + 'dark'];
    ctx.save();
    if (p.state === 'live') {
      const pos = this.padPos(p, F);
      const appear = clamp((this.t - p.showT) / HIT.popIn, 0, 1);
      const r = pos.r * easeOutBack(appear);
      const open = true; // a pad can be hit as soon as it shows up
      const left = clamp((p.endT - this.t) / p.life, 0, 1);

      // Countdown ring: the time left to hit it drains away clockwise, turning
      // gold and then orange near the end.
      const rr = pos.r * 1.2;
      ctx.lineWidth = Math.max(4, pos.r * 0.1);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.22 * appear;
      ctx.strokeStyle = COLORS.chalk;
      circle(ctx, pos.x, pos.y, rr);
      ctx.stroke();
      // Orange rather than red at the end, so it shows on red pads too; it pulses when time is nearly up.
      ctx.globalAlpha = appear * (left > 0.25 ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(this.t / 90)));
      ctx.strokeStyle = left > 0.5 ? COLORS.chalk : left > 0.25 ? COLORS.gold : COLORS.hazard;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, rr, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
      ctx.stroke();
      ctx.lineCap = 'butt';

      // Rim in the hand's color, dark face, then the punch number filling the face.
      ctx.globalAlpha = 1;
      if (open) {
        ctx.shadowColor = color;
        ctx.shadowBlur = pos.r * 0.5;
      }
      ctx.fillStyle = color;
      circle(ctx, pos.x, pos.y, r);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = dark;
      circle(ctx, pos.x, pos.y, r * 0.78);
      ctx.fill();
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = Math.max(2, r * 0.05);
      circle(ctx, pos.x, pos.y, r * 0.78);
      ctx.stroke();

      if (r > 4) {
        const label = String(p.n);
        ctx.font = `900 ${Math.round(r * 1.1)}px ${FONT_DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const m = ctx.measureText(label);
        const asc = m.actualBoundingBoxAscent || r * 0.75;
        const desc = m.actualBoundingBoxDescent || 0;
        const by = pos.y + (asc - desc) / 2;
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(3, r * 0.1);
        ctx.strokeStyle = COLORS.ink;
        ctx.strokeText(label, pos.x, by);
        ctx.fillStyle = COLORS.chalk;
        ctx.fillText(label, pos.x, by);
      }

      if (p.kind === 'upper') {
        // Arrow on the rim says "drive upward through it".
        ctx.fillStyle = COLORS.ink;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - r * 1.02);
        ctx.lineTo(pos.x - r * 0.26, pos.y - r * 0.66);
        ctx.lineTo(pos.x + r * 0.26, pos.y - r * 0.66);
        ctx.closePath();
        ctx.fill();
      }

      // Punch name under the pad: dark type on a tab in the hand's color.
      if (appear > 0.6) {
        const fs = Math.max(15, Math.round(pos.r * 0.34));
        ctx.font = `700 ${fs}px ${FONT_BODY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = p.tag.toUpperCase();
        const w = ctx.measureText(label).width + fs * 1.1;
        const h = fs * 1.35;
        const ty = pos.y + r + h * 0.5 + Math.max(4, pos.r * 0.08);
        ctx.fillStyle = color;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(pos.x - w / 2, ty - h / 2, w, h, h * 0.3);
        else ctx.rect(pos.x - w / 2, ty - h / 2, w, h);
        ctx.fill();
        ctx.fillStyle = COLORS.ink;
        ctx.fillText(label, pos.x, ty + fs * 0.04);
      }
    } else if (p.state === 'hit') {
      const k = clamp((this.fxT - p.doneT) / 220, 0, 1);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = p.judge === 'PERFECT' ? COLORS.gold : color;
      circle(ctx, p.x, p.y, p.r * (1 + 0.35 * k));
      ctx.fill();
      ctx.fillStyle = COLORS.chalk;
      circle(ctx, p.x, p.y, p.r * 0.5 * (1 - k));
      ctx.fill();
    } else {
      // Missed pads drop away. Pads cleared at the final bell just fade.
      const k = clamp((this.fxT - p.doneT) / 500, 0, 1);
      const drop = p.state === 'missed' ? k * k * 140 : 0;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.fillStyle = '#4b4f57';
      circle(ctx, p.x, p.y + drop, p.r);
      ctx.fill();
      ctx.strokeStyle = '#2a2d33';
      ctx.lineWidth = Math.max(2, p.r * 0.07);
      circle(ctx, p.x, p.y + drop, p.r * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Where the coach's glove is k of the way through its throw (1 = impact).
  // The first half is the wind-up, so you can see it coming; then it fires.
  glovePose(d, F, k) {
    const S = F.S;
    const windup = 0.5;
    const fire = (k - windup) / (1 - windup);
    if (d.kind === 'hook') {
      // Swings in flat from the side at head height.
      const sx = d.tx + d.side * 2.3 * S;
      const sy = d.ty - 0.25 * S;
      const u = k < windup ? -0.12 * Math.sin(Math.PI * (k / windup)) - 0.25 * (1 - easeOut(k / windup)) : Math.pow(fire, 1.6);
      const x = sx + (d.tx - sx) * u;
      const y = sy + (d.ty - sy) * u - 0.18 * S * Math.sin(Math.PI * clamp(u, 0, 1));
      return { x, y, size: 0.42 * S, angle: d.side > 0 ? Math.PI : 0 };
    }
    // A straight comes from out in front, angled at your face, growing as it closes in.
    const sx = d.tx + d.side * 1.25 * S;
    const sy = d.ty - 0.6 * S;
    const u = k < windup ? 0.05 * Math.sin(Math.PI * (k / windup)) : Math.pow(fire, 2);
    const x = sx + (d.tx - sx) * u;
    const y = sy + (d.ty - sy) * u;
    return { x, y, size: (0.26 + 0.24 * u) * S, angle: Math.atan2(d.ty - sy, d.tx - sx) };
  }

  drawDuck(ctx, d, F) {
    let k;
    let alpha = 1;
    if (d.state === 'live') {
      k = clamp(1 - (d.hitT - this.t) / d.warn, 0, 1);
    } else {
      const e = clamp((this.fxT - d.doneT) / 320, 0, 1);
      alpha = 1 - e;
      k = 1;
      if (d.state === 'slipped' || d.state === 'gone') k = 1 + e * 0.6; // follows through past you
    }
    let pose;
    if (k <= 1) pose = this.glovePose(d, F, k);
    else if (d.kind === 'hook') {
      const end = this.glovePose(d, F, 1);
      pose = { ...end, x: end.x - d.side * (k - 1) * 3 * F.S };
    } else {
      const end = this.glovePose(d, F, 1);
      const dist = (k - 1) * 2.5 * F.S;
      pose = { ...end, x: end.x + Math.cos(end.angle) * dist, y: end.y + Math.sin(end.angle) * dist };
    }

    // Head marker: red while your head is in the line of the punch.
    if (d.state === 'live' && k > 0.25) {
      const nose = this.body && this.body.nose;
      if (nose) {
        const safe = this.dodged(d, F);
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = Math.max(3, F.S * 0.025);
        ctx.strokeStyle = safe ? COLORS.chalk : COLORS.R;
        circle(ctx, nose.x, nose.y, Math.max(16, F.S * 0.3));
        ctx.stroke();
        ctx.restore();
      }
    }

    // Motion streaks behind the glove once it fires.
    if (d.state === 'live' && k > 0.55) {
      ctx.save();
      ctx.globalAlpha = 0.35 * alpha;
      ctx.strokeStyle = COLORS.mitt;
      ctx.lineCap = 'round';
      for (let i = 1; i <= 3; i++) {
        const back = this.glovePose(d, F, Math.max(0.5, k - i * 0.05));
        ctx.lineWidth = pose.size * (0.5 - i * 0.1);
        ctx.beginPath();
        ctx.moveTo(back.x, back.y);
        ctx.lineTo(pose.x, pose.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    drawGlove(ctx, pose);
    ctx.restore();
  }

  drawRings(ctx) {
    ctx.save();
    for (const r of this.rings) {
      const k = clamp((this.fxT - r.t0) / 400, 0, 1);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1, r.r * 0.18 * (1 - k));
      circle(ctx, r.x, r.y, r.r * (1 + 0.9 * easeOut(k)));
      ctx.stroke();
    }
    ctx.restore();
  }

  drawParticles(ctx) {
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }

  drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const base = this.textBase;
    for (const t of this.texts) {
      const k = clamp((this.fxT - t.t0) / 800, 0, 1);
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.55 : k < 0.2 ? 1.15 - ((k - 0.12) / 0.08) * 0.15 : 1;
      const y = t.y - base * 1.2 * easeOut(k);
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const size = Math.round(base * pop);
      ctx.font = `900 ${size}px ${FONT_DISPLAY}`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = COLORS.ink;
      ctx.strokeText(t.text, t.x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, y);
      if (t.sub) {
        ctx.font = `700 ${Math.round(base * 0.56)}px ${FONT_BODY}`;
        ctx.lineWidth = 4;
        ctx.strokeText(t.sub, t.x, y + size * 0.72);
        ctx.fillStyle = COLORS.chalk;
        ctx.fillText(t.sub, t.x, y + size * 0.72);
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- coach's glove

// A boxing glove seen from the side, knuckles leading along `angle`, thumb kept
// on the underside whichever way it travels.
function drawGlove(ctx, { x, y, size: s, angle }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (Math.cos(angle) < 0) ctx.scale(1, -1);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, s * 0.05);
  ctx.strokeStyle = COLORS.ink;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = s * 0.4;
  ctx.shadowOffsetY = s * 0.1;

  // Cuff trailing behind.
  ctx.fillStyle = '#26282d';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-s * 1.5, -s * 0.48, s * 0.82, s * 0.96, s * 0.16);
  else ctx.rect(-s * 1.5, -s * 0.48, s * 0.82, s * 0.96);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.stroke();
  ctx.fillStyle = COLORS.mitt;
  ctx.fillRect(-s * 1.12, -s * 0.48, s * 0.12, s * 0.96);

  // Padded fist, lit from above.
  const g = ctx.createRadialGradient(-s * 0.15, -s * 0.4, s * 0.1, 0, 0, s * 1.05);
  g.addColorStop(0, '#f6b866');
  g.addColorStop(0.55, COLORS.mitt);
  g.addColorStop(1, COLORS.mittDark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.04, s, s * 0.74, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Knuckle crease near the front.
  ctx.strokeStyle = 'rgba(70,35,8,0.55)';
  ctx.lineWidth = Math.max(1.5, s * 0.04);
  ctx.beginPath();
  ctx.ellipse(s * 0.38, -s * 0.04, s * 0.3, s * 0.56, 0, -Math.PI * 0.42, Math.PI * 0.42);
  ctx.stroke();

  // Thumb tucked along the underside.
  const tg = ctx.createLinearGradient(0, s * 0.3, 0, s * 0.72);
  tg.addColorStop(0, COLORS.mitt);
  tg.addColorStop(1, COLORS.mittDark);
  ctx.fillStyle = tg;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = Math.max(2, s * 0.05);
  ctx.beginPath();
  ctx.ellipse(-s * 0.02, s * 0.5, s * 0.55, s * 0.2, 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- body overlay

const BONES = [
  [11, 12, 'T'], [11, 23, 'T'], [12, 24, 'T'], [23, 24, 'T'],
  [11, 13, 'L'], [13, 15, 'L'], [12, 14, 'R'], [14, 16, 'R'],
];

// Draws the tracked skeleton (optional) and the fist markers (always), arms
// colored by hand so the player learns which color belongs to which fist.
export function drawBody(ctx, body, showBones) {
  if (!body.hasPose || !body.pts) return;
  const pts = body.pts;
  const S = Math.max(40, body.S || 0);
  ctx.save();
  ctx.lineCap = 'round';
  if (showBones) {
    const w = Math.max(2.5, S * 0.035);
    for (const [a, b, c] of BONES) {
      const A = pts[a];
      const B = pts[b];
      if (!A || !B || A.v < 0.4 || B.v < 0.4) continue;
      ctx.globalAlpha = c === 'T' ? 0.5 : 0.85;
      ctx.strokeStyle = c === 'T' ? COLORS.chalk : COLORS[c];
      ctx.lineWidth = c === 'T' ? w * 0.75 : w;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }
  }
  for (const key of ['L', 'R']) {
    const h = body.hands[key];
    if (!h.visible || !h.cur) continue;
    const r = Math.max(9, S * 0.14);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = COLORS[key];
    circle(ctx, h.cur.x, h.cur.y, r);
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS[key];
    circle(ctx, h.cur.x, h.cur.y, r);
    ctx.stroke();
  }
  ctx.restore();
}

// Tap mode has no camera, so a faint stand-in figure shows where the pads hang.
export function drawGhost(ctx, F) {
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = COLORS.chalk;
  const { ax, ay, S } = F;
  circle(ctx, ax, ay - 0.75 * S, 0.32 * S);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(ax - 0.55 * S, ay);
  ctx.quadraticCurveTo(ax, ay - 0.25 * S, ax + 0.55 * S, ay);
  ctx.lineTo(ax + 0.42 * S, ay + 1.6 * S);
  ctx.lineTo(ax - 0.42 * S, ay + 1.6 * S);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
