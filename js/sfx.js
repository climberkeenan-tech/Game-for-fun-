// All sounds are synthesized with Web Audio, so there are no audio files to load.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  // Must run inside a user gesture (iOS will not start audio otherwise).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ok() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  _env(gainNode, t, peak, attack, decay) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _tone(type, f0, f1, t, peak, decay, dest = this.master) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + decay);
    this._env(g, t, peak, 0.004, decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  _noise(t, peak, decay, filterType, freq, q = 0.8) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    this._env(g, t, peak, 0.002, decay);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  // Leather-on-mitt smack: low body thump plus a filtered slap.
  hit(judgement) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone('sine', 150, 48, t, 0.9, 0.16);
    this._noise(t, 0.75, 0.07, 'bandpass', 1500, 0.7);
    if (judgement === 'PERFECT') {
      this._noise(t, 0.5, 0.05, 'highpass', 3200, 0.5);
      this._tone('triangle', 1760, 1760, t + 0.01, 0.12, 0.12);
    } else if (judgement === 'GREAT') {
      this._noise(t, 0.3, 0.04, 'highpass', 2600, 0.5);
    }
  }

  // The thud as a fist lands on a pad, before it's judged.
  land() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone('sine', 150, 48, t, 0.9, 0.16);
    this._noise(t, 0.75, 0.07, 'bandpass', 1500, 0.7);
  }

  // The verdict a moment later: a ding for PERFECT, a tick for GREAT, a dull
  // note for SLOPPY.
  judged(judgement) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    if (judgement === 'PERFECT') {
      this._noise(t, 0.4, 0.05, 'highpass', 3200, 0.5);
      this._tone('triangle', 1760, 1760, t + 0.01, 0.14, 0.14);
    } else if (judgement === 'GREAT') {
      this._tone('triangle', 1320, 1320, t, 0.08, 0.1);
    } else if (judgement === 'SLOPPY') {
      this._tone('square', 140, 120, t, 0.06, 0.16);
    }
  }

  miss() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone('triangle', 260, 110, t, 0.25, 0.2);
  }

  caught() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone('sine', 110, 38, t, 1, 0.3);
    this._noise(t, 0.9, 0.18, 'lowpass', 700, 0.6);
  }

  slip() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    const g = c.createGain();
    this._env(g, t, 0.5, 0.03, 0.3);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.4);
  }

  // Rising whoosh that warns of an incoming duck.
  warn() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.45);
    const g = c.createGain();
    this._env(g, t, 0.35, 0.2, 0.3);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.6);
  }

  tick() {
    if (!this.ok) return;
    this._tone('square', 980, 980, this.ctx.currentTime, 0.12, 0.05);
  }

  levelUp() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone('square', 660, 660, t, 0.1, 0.08);
    this._tone('square', 990, 990, t + 0.09, 0.1, 0.12);
  }

  // Ring bell: inharmonic partials with a long decay, struck `times` times.
  bell(times = 1) {
    if (!this.ok) return;
    const c = this.ctx;
    const base = 640;
    const partials = [[1, 0.5], [2.32, 0.3], [3.17, 0.22], [4.53, 0.12], [5.9, 0.08]];
    for (let k = 0; k < times; k++) {
      const t = c.currentTime + k * 0.32;
      for (const [ratio, amp] of partials) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'sine';
        o.frequency.value = base * ratio;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(amp, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2 / ratio + 0.4);
        o.connect(g).connect(this.master);
        o.start(t);
        o.stop(t + 3);
      }
      this._noise(t, 0.3, 0.03, 'highpass', 4000, 0.5);
    }
  }
}
