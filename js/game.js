import {
  PUNCHES, LEVELS, COMBOS, SPOKEN, HIT, POINTS, HEALTH, DUCK, multiplierFor,
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
    this.hazard = null;
  }

  start({ duration, stance, tapMode, body }) {
    this.duration = duration * 1000; // 0 means survival
    this.tapMode = tapMode;
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
    this.stats = { hits: 0, perfect: 0, great: 0, good: 0, wrong: 0, missed: 0, slips: 0, ducks: 0 };
    this.shake = 0;
    this.flash = 0;
    this.handSeen = { L: body ? body.hands.L.seq : 0, R: body ? body.hands.R.seq : 0 };
    this.handCooldown = { L: -1e9, R: -1e9 };
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
    const r = clamp(F.S * 0.4, 26, 90);
    const { W, H, top, bottom } = this.view;
    const x = clamp(F.ax + side * (def.x + p.jx) * F.S, r + 6, W - r - 6);
    const y = clamp(F.ay + (def.y + p.jy) * F.S, top + r, Math.max(top + r, H - bottom - r));
    return { x, y, r };
  }

  get level() {
    return LEVELS[this.levelIdx];
  }

  // ---------------------------------------------------------------- spawning

  schedule() {
    const L = this.level;
    const lookahead = L.approach + 60;
    let guard = 0;
    while (this.t >= this.nextSetT - lookahead && guard++ < 4) {
      if (!this.tapMode && L.duck > 0 && !this.lastWasDuck && this.t > 3000 && Math.random() < L.duck) {
        const warn = clamp(L.approach + 150, 1000, 1500);
        const hitT = Math.max(this.nextSetT, this.t + warn);
        this.ducks.push({ hitT, warn, side: Math.random() < 0.5 ? -1 : 1, state: 'live', doneT: 0 });
        this.nextSetT = hitT + DUCK.recover + L.gap * 0.5;
        this.lastWasDuck = true;
        this.events.onCall?.([{ text: 'Duck', hand: null }]);
        this.coach.say('duck', 1.2);
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
    this.ducks = this.ducks.filter((d) => d.state === 'live' || this.fxT - d.doneT < 700);

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

  tryHand(key, h) {
    const F = this.frameOf();
    const speed = h.speed() / F.S;
    if (speed < HIT.minSpeed) return;
    if (this.t - this.handCooldown[key] < HIT.cooldown) return;
    const a = h.prev && h.cur.t - h.prev.t < 200 ? h.prev : h.cur;
    const b = h.cur;
    const judgeT = this.t - HIT.inputLag;
    const upward = -h.vy / F.S;
    let best = null;
    for (const p of this.pads) {
      if (p.state !== 'live' || judgeT < p.hitT - HIT.early) continue;
      if (p.kind === 'upper' && upward < HIT.upperSpeed) continue;
      const pos = this.padPos(p, F);
      if (segDist(pos.x, pos.y, a.x, a.y, b.x, b.y) > pos.r * HIT.reach) continue;
      const rank = (p.hand === key ? 0 : 1e7) + p.hitT; // right hand first, then earliest pad
      if (!best || rank < best.rank) best = { p, rank, pos };
    }
    if (best) {
      this.handCooldown[key] = this.t;
      this.onHit(best.p, key, judgeT, best.pos);
    }
  }

  tapAt(x, y) {
    if (!this.running) return false;
    const F = this.frameOf();
    let best = null;
    for (const p of this.pads) {
      if (p.state !== 'live' || this.t < p.hitT - HIT.early) continue;
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
    let j = err <= HIT.perfect ? 'PERFECT' : err <= HIT.great ? 'GREAT' : 'GOOD';
    if (p.hand !== key) j = 'WRONG';
    const pts = Math.round(POINTS[j] * multiplierFor(this.combo));
    this.score += pts;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.health = Math.min(HEALTH.start, this.health + HEALTH.heal[j]);
    this.stats.hits++;
    if (j === 'PERFECT') this.stats.perfect++;
    else if (j === 'GREAT') this.stats.great++;
    else if (j === 'GOOD') this.stats.good++;
    else this.stats.wrong++;

    Object.assign(p, { state: 'hit', doneT: this.fxT, judge: j, x: pos.x, y: pos.y, r: pos.r });
    const color = COLORS[p.hand];
    this.burst(pos.x, pos.y, color, j === 'PERFECT' ? 22 : 14, pos.r);
    this.rings.push({ x: pos.x, y: pos.y, r: pos.r, t0: this.fxT, color: j === 'PERFECT' ? COLORS.gold : color });
    this.popText(j === 'WRONG' ? 'Wrong hand' : j, pos.x, pos.y - pos.r - 14, judgeColor(j), `+${pts}`);
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

  duckGeometry(F) {
    const base = this.baseline ?? F.ay - 0.6 * F.S;
    return {
      base,
      barY: base - 0.05 * F.S,
      thick: Math.max(22, 0.3 * F.S),
      line: base + DUCK.drop * F.S, // the nose has to get below this
    };
  }

  resolveDuck(d) {
    const F = this.frameOf();
    const g = this.duckGeometry(F);
    const nose = this.body && this.body.nose;
    const ok = this.baseline == null || (nose && nose.y > g.line);
    d.state = ok ? 'slipped' : 'caught';
    d.doneT = this.fxT;
    this.stats.ducks++;
    this.lastDuckEnd = this.t;
    const x = this.view.W / 2;
    const y = g.barY - g.thick / 2 - 40;
    if (ok) {
      this.stats.slips++;
      const pts = Math.round(POINTS.SLIP * multiplierFor(this.combo));
      this.score += pts;
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.health = Math.min(HEALTH.start, this.health + HEALTH.heal.SLIP);
      this.popText('Slipped', x, y, COLORS.chalk, `+${pts}`);
      this.sfx.slip();
      this.checkLevel();
    } else {
      this.combo = 0;
      this.health -= HEALTH.caught;
      this.flash = 1;
      this.shake = 16;
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
      const appear = clamp(life / 0.18, 0, 1);
      const r = pos.r * easeOutBack(appear);
      const lagged = this.t - (this.tapMode ? 0 : HIT.inputLag);
      const open = lagged >= p.hitT - HIT.early;

      // Timing ring closes onto the pad at the ideal moment.
      if (toHit > -HIT.late) {
        const k = Math.max(0, toHit) / p.approach;
        const ar = pos.r * (1 + 1.6 * k);
        ctx.globalAlpha = (0.3 + 0.7 * appear) * (toHit < 0 ? 0.5 : 1);
        ctx.lineWidth = Math.max(2.5, pos.r * 0.08);
        ctx.strokeStyle = Math.abs(toHit) <= HIT.perfect ? COLORS.gold : COLORS.chalk;
        circle(ctx, pos.x, pos.y, ar);
        ctx.stroke();
      }

      ctx.globalAlpha = open ? 1 : 0.55 + 0.3 * appear;
      if (open) {
        ctx.shadowColor = color;
        ctx.shadowBlur = pos.r * 0.6;
      }
      ctx.fillStyle = color;
      circle(ctx, pos.x, pos.y, r);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = dark;
      circle(ctx, pos.x, pos.y, r * 0.8);
      ctx.fill();
      ctx.strokeStyle = COLORS.chalk;
      ctx.lineWidth = Math.max(2, r * 0.07);
      circle(ctx, pos.x, pos.y, r * 0.5);
      ctx.stroke();

      // Punch number, the way a trainer calls it.
      ctx.fillStyle = COLORS.chalk;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(r * 0.78)}px ${FONT_DISPLAY}`;
      ctx.fillText(String(p.n), pos.x, pos.y + r * 0.04);

      if (p.kind === 'upper') {
        // Arrow says "drive upward through it".
        ctx.fillStyle = COLORS.chalk;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - r * 0.98);
        ctx.lineTo(pos.x - r * 0.2, pos.y - r * 0.68);
        ctx.lineTo(pos.x + r * 0.2, pos.y - r * 0.68);
        ctx.closePath();
        ctx.fill();
      }

      // Tag under the pad.
      if (appear > 0.6) {
        const fs = Math.max(11, Math.round(pos.r * 0.3));
        ctx.font = `700 ${fs}px ${FONT_BODY}`;
        const label = p.tag.toUpperCase();
        const w = ctx.measureText(label).width + fs * 0.9;
        const ty = pos.y + r + fs * 0.9;
        ctx.globalAlpha *= 0.95;
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(pos.x - w / 2, ty - fs * 0.62, w, fs * 1.24);
        ctx.fillStyle = color;
        ctx.fillText(label, pos.x, ty + 1);
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

  hazardPattern(ctx) {
    if (this.hazard) return this.hazard;
    const c = document.createElement('canvas');
    c.width = 28;
    c.height = 28;
    const g = c.getContext('2d');
    g.fillStyle = COLORS.hazard;
    g.fillRect(0, 0, 28, 28);
    g.fillStyle = COLORS.ink;
    for (let i = -28; i < 56; i += 14) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 7, 0);
      g.lineTo(i + 7 - 28, 28);
      g.lineTo(i - 28, 28);
      g.closePath();
      g.fill();
    }
    this.hazard = ctx.createPattern(c, 'repeat');
    return this.hazard;
  }

  drawDuck(ctx, d, F) {
    const { W } = this.view;
    const g = this.duckGeometry(F);
    let k;
    let alpha = 1;
    if (d.state === 'live') {
      k = clamp(1 - (d.hitT - this.t) / d.warn, 0, 1);
    } else {
      const e = clamp((this.fxT - d.doneT) / 350, 0, 1);
      k = 1 + e;
      alpha = 1 - e;
    }
    // The bar swings in from one side and is fully across at the moment of impact.
    const off = k <= 1 ? (1 - easeOut(k)) * W * d.side : -(k - 1) * W * d.side;
    ctx.save();
    ctx.globalAlpha = alpha * (d.state === 'live' ? 0.92 : 1);
    ctx.translate(off, 0);
    ctx.fillStyle = this.hazardPattern(ctx);
    ctx.fillRect(0, g.barY - g.thick / 2, W, g.thick);
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0, g.barY - g.thick / 2 - 3, W, 3);
    ctx.fillRect(0, g.barY + g.thick / 2, W, 3);
    ctx.restore();

    if (d.state !== 'live') return;
    ctx.save();
    // Target line: get your nose below it before the bar lands.
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = COLORS.chalk;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(12, g.line);
    ctx.lineTo(W - 12, g.line);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `700 13px ${FONT_BODY}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = COLORS.chalk;
    ctx.fillText('HEAD BELOW THIS LINE', W - 14, g.line - 5);

    const nose = this.body && this.body.nose;
    if (nose) {
      const below = nose.y > g.line;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 4;
      ctx.strokeStyle = below ? COLORS.chalk : COLORS.R;
      circle(ctx, nose.x, nose.y, Math.max(14, F.S * 0.18));
      ctx.stroke();
    }

    const pulse = 0.75 + 0.25 * Math.sin(this.t / 60);
    ctx.globalAlpha = pulse;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = `900 ${Math.round(Math.max(40, F.S * 0.55))}px ${FONT_DISPLAY}`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = COLORS.ink;
    ctx.strokeText('DUCK', W / 2, g.barY - g.thick / 2 - 8);
    ctx.fillStyle = COLORS.hazard;
    ctx.fillText('DUCK', W / 2, g.barY - g.thick / 2 - 8);
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
    for (const t of this.texts) {
      const k = clamp((this.fxT - t.t0) / 800, 0, 1);
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.55 : k < 0.2 ? 1.15 - ((k - 0.12) / 0.08) * 0.15 : 1;
      const y = t.y - 36 * easeOut(k);
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const size = Math.round(30 * pop);
      ctx.font = `900 ${size}px ${FONT_DISPLAY}`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = COLORS.ink;
      ctx.strokeText(t.text, t.x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, y);
      if (t.sub) {
        ctx.font = `700 17px ${FONT_BODY}`;
        ctx.lineWidth = 4;
        ctx.strokeText(t.sub, t.x, y + size * 0.72);
        ctx.fillStyle = COLORS.chalk;
        ctx.fillText(t.sub, t.x, y + size * 0.72);
      }
    }
    ctx.restore();
  }
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
