import {
  PUNCHES, PAD, LEVELS, COMBOS, SPOKEN, HIT, POINTS, HEALTH, DUCK, multiplierFor,
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
    this.lastWasDuck = false;
    this.stats = { hits: 0, perfect: 0, great: 0, good: 0, missed: 0, slips: 0, ducks: 0 };
    this.shake = 0;
    this.flash = 0;
    this.handSeen = { L: body ? body.hands.L.seq : 0, R: body ? body.hands.R.seq : 0 };
    this.handCooldown = { L: -1e9, R: -1e9 };
    this.handUsed = { L: -Infinity, R: -Infinity };
    this.handLanded = { L: null, R: null }; // the last hit's direction, until the fist stops or pulls back
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

  // Earliest (judged) time a punch can count for this pad. A pad lights up
  // HIT.early ms before its ideal moment. Combos go in order: while an earlier
  // pad is still up, this one waits until that pad's ideal moment (a little
  // longer if it's for the same hand). It also only counts movement after the
  // last pad before it was hit (p.freeAt).
  freeFrom(p) {
    let t = Math.max(this.openAt(p), p.freeAt ?? -Infinity);
    for (const q of this.pads) {
      if (q === p || q.state !== 'live' || q.hitT >= p.hitT) continue;
      t = Math.max(t, q.hand === p.hand ? q.hitT + HIT.hold : q.hitT);
    }
    return t;
  }

  // Pop-up text size: phone-sized on phones, bigger on laptop and desktop screens.
  get textBase() {
    return clamp(Math.min(this.view.W, this.view.H) * 0.045, 28, 46);
  }

  // ---------------------------------------------------------------- spawning

  schedule() {
    const L = this.level;
    const lookahead = L.approach + 60;
    let guard = 0;
    while (this.t >= this.nextSetT - lookahead && guard++ < 4) {
      if (this.dodges && !this.tapMode && L.duck > 0 && !this.lastWasDuck && this.t > 3000 && Math.random() < L.duck) {
        // The coach throws one back: a hook to roll under or a straight to slip.
        const warn = clamp(L.approach + 150, 1000, 1500);
        const hitT = Math.max(this.nextSetT, this.t + warn);
        const F = this.frameOf();
        const nose = this.body && this.body.nose;
        const kind = Math.random() < 0.55 ? 'hook' : 'straight';
        this.ducks.push({
          kind,
          hitT,
          warn: hitT - this.t,
          side: Math.random() < 0.5 ? -1 : 1,
          tx: nose ? nose.x : F.ax,
          ty: this.baseline ?? (nose ? nose.y : F.ay - 0.7 * F.S),
          state: 'live',
          doneT: 0,
        });
        this.nextSetT = hitT + DUCK.recover + L.gap * 0.5;
        this.lastWasDuck = true;
        this.events.onCall?.([{ text: kind === 'hook' ? 'Duck' : 'Slip', hand: null }]);
        this.coach.say(kind === 'hook' ? 'duck' : 'slip', 1.2);
        this.sfx.warn();
        continue;
      }
      this.lastWasDuck = false;
      const len = Math.random() < 0.25 ? 1 : 1 + Math.floor(Math.random() * L.maxLen);
      const seq = pick(COMBOS[len]);
      seq.forEach((n, i) => {
        const def = PUNCHES[n];
        const hand = def.role === 'lead' ? this.leadHand : this.rearHand;
        const repeat = i > 0 && seq[i - 1] === n;
        this.pads.push({
          id: ++this.padSeq,
          n,
          hand,
          kind: def.kind,
          tag: def.tag,
          hitT: this.nextSetT + i * L.beat,
          approach: L.approach,
          jx: rand(-0.08, 0.08),
          jy: rand(-0.08, 0.08) + (repeat ? -0.32 : 0),
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
      this.nextSetT += (seq.length - 1) * L.beat + L.gap + (seq.length > 1 ? 200 : 0);
    }
  }

  // ---------------------------------------------------------------- update

  step(dt) {
    if (!this.running) return;
    this.t += dt;
    this.schedule();

    if (!this.tapMode && this.body) {
      for (const key of ['L', 'R']) {
        const h = this.body.hands[key];
        if (!h.visible || h.seq === this.handSeen[key]) continue;
        this.handSeen[key] = h.seq;
        this.tryHand(key, h);
      }
    }

    const judgeNow = this.t - (this.tapMode ? 0 : HIT.inputLag);
    for (const p of this.pads) {
      if (p.state === 'live' && judgeNow > p.hitT + HIT.late) this.onMiss(p);
    }
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
      if (now < free) {
        // Thrown before the pad lit up: say so once instead of silently ignoring
        // it. Only when it is simply early, not waiting its turn in a combo.
        if (!p.toldEarly && free === this.openAt(p) && now >= p.hitT - p.approach * 0.75) {
          const early = this.punchInto(p, all, F, judgeAt);
          if (early) {
            p.toldEarly = true;
            this.popText('Early', early.pos.x, early.pos.y - early.pos.r - 14, COLORS.miss);
          }
        }
        continue;
      }
      // Only movement since the pad became hittable counts.
      let start = 0;
      while (start < all.length && judgeAt(all[start]) < free) start++;
      const hit = this.punchInto(p, all.slice(start), F, judgeAt);
      if (hit && (!best || p.hitT < best.p.hitT)) best = { p, ...hit };
    }
    if (best) {
      this.handCooldown[key] = this.t;
      this.handUsed[key] = best.sampleT;
      this.handLanded[key] = { t: h.cur.t, vx: h.vx, vy: h.vy };
      this.onHit(best.p, key, best.judgeT, best.pos);
    }
  }

  // When the pad lights up and starts taking hits, before any combo-order wait.
  openAt(p) {
    return p.hitT - Math.min(HIT.early, p.approach * 0.75);
  }

  // Did this stretch of fist movement punch into pad p? Returns where and when
  // (timed at the fist's closest point), or null. Waits one camera frame while
  // the fist is still closing in, unless it is already deep in the pad.
  punchInto(p, path, F, judgeAt) {
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
      if (t > p.hitT + HIT.late) continue;
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
      for (let i = 0; i < at; i++) {
        const d = Math.hypot(path[i].x - pos.x, path[i].y - pos.y);
        if (d > dFar) {
          dFar = d;
          far = path[i];
        }
      }
      const moved = Math.hypot(path[at].x - far.x, path[at].y - far.y) / F.S;
      if ((dFar - dMin) / F.S < HIT.approach || moved < HIT.travel) return null;
    }
    return { pos, judgeT, sampleT: path[at].t };
  }

  tapAt(x, y) {
    if (!this.running) return false;
    const F = this.frameOf();
    let best = null;
    for (const p of this.pads) {
      if (p.state !== 'live' || this.t < this.freeFrom(p)) continue;
      const pos = this.padPos(p, F);
      if (Math.hypot(x - pos.x, y - pos.y) > pos.r * 1.35) continue;
      if (!best || p.hitT < best.p.hitT) best = { p, pos };
    }
    if (!best) return false;
    this.onHit(best.p, best.p.hand, this.t, best.pos);
    return true;
  }

  onHit(p, key, judgeT, pos) {
    const err = Math.abs(judgeT - p.hitT);
    const j = err <= HIT.perfect ? 'PERFECT' : err <= HIT.great ? 'GREAT' : 'GOOD';
    // Later pads only count movement from here on, so this punch can't take one too.
    for (const q of this.pads) {
      if (q !== p && q.state === 'live' && q.hitT > p.hitT) q.freeAt = Math.max(q.freeAt ?? -Infinity, judgeT);
    }
    const pts = Math.round(POINTS[j] * multiplierFor(this.combo));
    this.score += pts;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.health = Math.min(HEALTH.start, this.health + HEALTH.heal[j]);
    this.stats.hits++;
    if (j === 'PERFECT') this.stats.perfect++;
    else if (j === 'GREAT') this.stats.great++;
    else this.stats.good++;

    Object.assign(p, { state: 'hit', doneT: this.fxT, judge: j, x: pos.x, y: pos.y, r: pos.r });
    const color = COLORS[p.hand];
    this.burst(pos.x, pos.y, color, j === 'PERFECT' ? 22 : 14, pos.r);
    this.rings.push({ x: pos.x, y: pos.y, r: pos.r, t0: this.fxT, color: j === 'PERFECT' ? COLORS.gold : color });
    this.popText(j, pos.x, pos.y - pos.r - 14, judgeColor(j), `+${pts}`);
    this.shake = Math.max(this.shake, j === 'PERFECT' ? 7 : 4);
    this.sfx.hit(j);
    this.checkLevel();
  }

  onMiss(p) {
    const pos = this.padPos(p, this.frameOf());
    Object.assign(p, { state: 'missed', doneT: this.fxT, x: pos.x, y: pos.y, r: pos.r });
    this.stats.missed++;
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
    return {
      ...s,
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
    const order = [...this.pads].sort((a, b) => b.hitT - a.hitT);
    for (const p of order) this.drawPad(ctx, p, F);
    this.drawRings(ctx);
    this.drawParticles(ctx);
    this.drawTexts(ctx);
  }

  drawPad(ctx, p, F) {
    const color = COLORS[p.hand];
    const dark = COLORS[p.hand + 'dark'];
    ctx.save();
    if (p.state === 'live') {
      const pos = this.padPos(p, F);
      const toHit = p.hitT - this.t;
      const life = clamp(1 - toHit / p.approach, 0, 1);
      const appear = clamp(life / 0.25, 0, 1); // pops in over the first quarter of its approach
      const r = pos.r * easeOutBack(appear);
      const open = this.t - (this.tapMode ? 0 : HIT.inputLag) >= this.freeFrom(p);

      // Timing ring closes onto the pad at the ideal moment.
      if (toHit > -HIT.late) {
        const k = Math.max(0, toHit) / p.approach;
        const ar = pos.r * (1 + 1.4 * k);
        ctx.globalAlpha = (0.35 + 0.65 * appear) * (toHit < 0 ? 0.5 : 1);
        ctx.lineWidth = Math.max(3, pos.r * 0.08);
        ctx.strokeStyle = Math.abs(toHit) <= HIT.perfect ? COLORS.gold : COLORS.chalk;
        circle(ctx, pos.x, pos.y, ar);
        ctx.stroke();
      }

      // Rim in the hand's color, dark face, then the punch number filling the face.
      // Dimmer until it can be hit, then full strength with a glow.
      ctx.globalAlpha = open ? 1 : 0.7 * appear;
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
