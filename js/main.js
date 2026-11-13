import { Tracker } from './tracker.js';
import { Body } from './body.js';
import { Game, COLORS, drawBody, drawGhost } from './game.js';
import { Sfx } from './sfx.js';
import { Coach } from './coach.js';
import { LEVEL_BANNERS, PUNCHES, PAD, multiplierFor } from './config.js';
import {
  gradeFor, boardKey, getBoard, bestFor, addEntry, renameEntry, getName, setName, cleanName, cornerNotes, migrateOldBest,
} from './records.js';

const $ = (id) => document.getElementById(id);
const els = {
  stage: $('stage'),
  video: $('cam'),
  canvas: $('fx'),
  probe: $('safeProbe'),
  hud: $('hud'),
  score: $('hudScore'),
  clock: $('hudClock'),
  clockLbl: $('hudClockLbl'),
  comboWrap: $('hudComboWrap'),
  combo: $('hudCombo'),
  mult: $('hudMult'),
  hp: $('hudHp'),
  hpFill: $('hudHpFill'),
  lvl: $('hudLvl'),
  call: $('call'),
  banner: $('banner'),
  countdown: $('countdown'),
  lost: $('lost'),
  loadStatus: $('loadStatus'),
  startBtn: $('startBtn'),
  setupTitle: $('setupTitle'),
  setupHint: $('setupHint'),
  holdFill: $('holdFill'),
  debug: $('debug'),
  hudBest: $('hudBest'),
};
const screens = { menu: $('menu'), setup: $('setup'), pause: $('pause'), results: $('results'), board: $('board') };
const ctx = els.canvas.getContext('2d');
const DEBUG = new URLSearchParams(location.search).has('debug');
const IS_DESK = document.documentElement.classList.contains('device-desk');
const DEVICE_NAME = IS_DESK ? 'laptop' : 'phone';

// ---------------------------------------------------------------- settings

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('mittrush.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('mittrush.' + key, JSON.stringify(value));
    } catch (e) {
      /* storage blocked: settings just won't persist */
    }
  },
};

const settings = {
  mode: Number(store.get('mode', 60)),
  stance: store.get('stance', 'orthodox'),
  coach: store.get('coach', 'on'),
  sound: store.get('sound', 'on'),
  skeleton: store.get('skeleton', 'on'),
  dodges: store.get('dodges', 'on'),
};
migrateOldBest();
const MODE_NAMES = { 60: '1 min', 180: '3 min', 0: 'Survival' };
let roundBest = 0; // the score to beat this round
let beatBest = false;

// ---------------------------------------------------------------- systems

const sfx = new Sfx();
const coach = new Coach();
const tracker = new Tracker();
const body = new Body();
const game = new Game({ sfx, coach, events: { onLevel, onCall, onEnd } });

let state = 'menu'; // menu | setup | countdown | play | paused | over | results
let tapMode = false;
let camOn = false;
let stream = null;
let trackerState = 'loading';
let view = { W: 1, H: 1 };
let dpr = 1;
let fit = { ox: 0, oy: 0, dw: 1, dh: 1 };
let setupOkSince = null;
let countdownStart = 0;
let lastCount = null;
let lostSince = null;
let foundSince = null;
let isLost = false;
let lastResult = null;
let wakeLock = null;

// Normalized camera coordinates to screen pixels, mirrored like a selfie view.
const map = (x, y) => ({ x: fit.ox + (1 - x) * fit.dw, y: fit.oy + y * fit.dh });

const trackerLoading = tracker
  .load()
  .then(() => {
    trackerState = 'ready';
    refreshLoadStatus();
  })
  .catch((err) => {
    console.error(err);
    trackerState = 'failed';
    refreshLoadStatus();
  });

function refreshLoadStatus(message, isError) {
  const el = els.loadStatus;
  if (message) {
    el.textContent = message;
    el.classList.toggle('error', !!isError);
    return;
  }
  el.classList.remove('error');
  if (trackerState === 'loading') el.textContent = 'Loading body tracking…';
  else if (trackerState === 'ready') el.textContent = 'Ready. Video stays on your device.';
  else {
    el.textContent = 'Body tracking could not start in this browser. Try Safari or Chrome, or play without the camera.';
    el.classList.add('error');
  }
}

// ---------------------------------------------------------------- layout

function resize() {
  const r = els.stage.getBoundingClientRect();
  view = { W: r.width, H: r.height };
  dpr = Math.min(2, window.devicePixelRatio || 1);
  els.canvas.width = Math.round(view.W * dpr);
  els.canvas.height = Math.round(view.H * dpr);
  const cs = getComputedStyle(els.probe);
  const safeTop = parseFloat(cs.paddingTop) || 0;
  const safeBottom = parseFloat(cs.paddingBottom) || 0;
  game.view = { W: view.W, H: view.H, top: safeTop + 92, bottom: safeBottom + 76 };
  measureHud();
  computeFit();
}

// Keep pads clear of the HUD, whose size depends on the screen.
function measureHud() {
  if (els.hud.hidden) return;
  const top = els.hud.querySelector('.hud-top').getBoundingClientRect().bottom;
  const bottomEdge = els.hud.querySelector('.hud-bottom').getBoundingClientRect().top;
  if (top > 0 && bottomEdge > top) {
    game.view.top = top + 10;
    game.view.bottom = view.H - bottomEdge + 10;
  }
}

// Cover the screen with the camera image unless that would crop away too much
// of it (for example a landscape feed on a portrait phone); then letterbox.
function computeFit() {
  const vw = els.video.videoWidth;
  const vh = els.video.videoHeight;
  if (!vw || !vh) return;
  const { W, H } = view;
  const cover = Math.max(W / vw, H / vh);
  const contain = Math.min(W / vw, H / vh);
  const visible = Math.min(W / (vw * cover), H / (vh * cover));
  const useCover = visible >= 0.62;
  const s = useCover ? cover : contain;
  els.video.style.objectFit = useCover ? 'cover' : 'contain';
  fit = { ox: (W - vw * s) / 2, oy: (H - vh * s) / 2, dw: vw * s, dh: vh * s };
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
els.video.addEventListener('loadedmetadata', computeFit);
els.video.addEventListener('resize', computeFit);
resize();

// ---------------------------------------------------------------- camera

async function startCamera() {
  if (camOn) return;
  if (!window.isSecureContext) {
    const e = new Error('insecure');
    e.name = 'InsecureError';
    throw e;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const e = new Error('no camera api');
    e.name = 'NotFoundError';
    throw e;
  }
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  });
  els.video.srcObject = stream;
  try {
    await els.video.play();
  } catch (e) {
    /* autoplay is allowed for muted inline video; ignore spurious rejections */
  }
  if (!els.video.videoWidth) {
    await new Promise((res) => els.video.addEventListener('loadedmetadata', res, { once: true }));
  }
  camOn = true;
  computeFit();
  document.body.classList.add('cam-on');
}

function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  els.video.srcObject = null;
  camOn = false;
  body.reset();
  document.body.classList.remove('cam-on');
}

function cameraErrorText(err) {
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `Camera access is blocked. Allow the camera for this site in your browser settings, then ${IS_DESK ? 'click' : 'tap'} Glove up again.`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return IS_DESK
        ? 'No camera was found on this computer. You can still play with your mouse.'
        : 'No front camera was found on this device. You can still play with taps.';
    case 'NotReadableError':
      return 'Another app is using the camera. Close it and try again.';
    case 'InsecureError':
      return 'The camera only works over https. Open the game from its https link.';
    default:
      return 'The camera could not start. Reload the page and try again.';
  }
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  try {
    if (wakeLock) wakeLock.release();
  } catch (e) {
    /* already released */
  }
  wakeLock = null;
}

// ---------------------------------------------------------------- screens

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
}

function syncChips() {
  document.querySelectorAll('.chip[data-opt]').forEach((b) => {
    b.setAttribute('aria-pressed', String(String(settings[b.dataset.opt]) === b.dataset.val));
  });
  updateMenuBest();
  coach.enabled = settings.coach === 'on';
  sfx.enabled = settings.sound === 'on';
  if (!coach.enabled) coach.stop();
}

document.querySelectorAll('.chip[data-opt]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const key = btn.dataset.opt;
    const val = key === 'mode' ? Number(btn.dataset.val) : btn.dataset.val;
    settings[key] = val;
    store.set(key, val);
    syncChips();
    blurAfterPointer(e);
  });
});

// A mouse or touch click leaves focus on the button, which would swallow the
// Space and Enter shortcuts. Keyboard activation (detail 0) keeps focus.
function blurAfterPointer(e) {
  if (e && e.detail > 0 && e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
}

function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function goMenu() {
  state = 'menu';
  coach.stop();
  releaseWakeLock();
  stopCamera();
  tapMode = false;
  els.hud.hidden = true;
  els.lost.hidden = true;
  els.countdown.hidden = true;
  els.banner.hidden = true;
  els.call.hidden = true;
  game.running = false;
  game.pads = [];
  game.ducks = [];
  updateMenuBest();
  showScreen('menu');
}

function enterSetup() {
  state = 'setup';
  setupOkSince = null;
  els.hud.hidden = true;
  els.lost.hidden = true;
  els.holdFill.style.width = '0%';
  showScreen('setup');
}

function beginCountdown(now) {
  state = 'countdown';
  countdownStart = now;
  lastCount = null;
  isLost = false;
  els.lost.hidden = true;
  showScreen(null);
  // Fresh HUD for the new round.
  game.running = false;
  game.pads = [];
  game.ducks = [];
  game.particles = [];
  game.texts = [];
  game.score = 0;
  game.displayScore = 0;
  game.combo = 0;
  game.health = 100;
  game.levelIdx = 0;
  game.t = 0;
  game.duration = settings.mode * 1000;
  roundBest = bestFor(boardKey(settings.mode, tapMode));
  beatBest = false;
  els.hudBest.hidden = !roundBest;
  els.hudBest.textContent = `Best ${fmt(roundBest)}`;
  els.hudBest.classList.remove('beat');
  hudCache.clear();
  updateHud();
  els.hud.hidden = false;
  measureHud();
  els.countdown.hidden = false;
}

function updateCountdown(now) {
  const n = 3 - Math.floor((now - countdownStart) / 750);
  if (n >= 1) {
    if (n !== lastCount) {
      lastCount = n;
      setCountdown(String(n), false);
      sfx.tick();
    }
  } else if (lastCount !== 0) {
    lastCount = 0;
    setCountdown('Box!', true);
    sfx.bell(1);
    startRound();
    setTimeout(() => {
      if (lastCount === 0) els.countdown.hidden = true;
    }, 650);
  }
}

function setCountdown(text, isBox) {
  const el = els.countdown;
  el.textContent = text;
  el.classList.toggle('box', isBox);
  el.classList.remove('pop');
  void el.offsetWidth; // restart the animation
  el.classList.add('pop');
}

function startRound() {
  game.start({ duration: settings.mode, stance: settings.stance, tapMode, body, dodges: settings.dodges === 'on' });
  state = 'play';
  hudCache.clear();
}

function pause() {
  if (state !== 'play' && state !== 'countdown') return;
  state = 'paused';
  coach.stop();
  els.countdown.hidden = true;
  showScreen('pause');
  // Space then activates Resume instead of the pause button that still has focus.
  $('resumeBtn').focus({ preventScroll: true });
}

function resume() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  showScreen(null);
  sfx.unlock();
  if (!game.running) {
    // Paused during the countdown: count down again.
    beginCountdown(performance.now());
    return;
  }
  state = 'play';
  lostSince = null;
  foundSince = null;
}

// ---------------------------------------------------------------- HUD

const hudCache = new Map();
function setText(el, key, value) {
  if (hudCache.get(key) === value) return false;
  hudCache.set(key, value);
  el.textContent = value;
  return true;
}

function updateHud() {
  setText(els.score, 'score', fmt(game.displayScore));
  if (setText(els.combo, 'combo', String(game.combo)) && game.combo > 0) {
    els.comboWrap.classList.remove('bump');
    void els.comboWrap.offsetWidth;
    els.comboWrap.classList.add('bump');
  }
  els.comboWrap.classList.toggle('zero', game.combo === 0);
  setText(els.mult, 'mult', 'x' + multiplierFor(game.combo));
  const remaining = game.duration ? game.duration - game.t : game.t;
  setText(els.clockLbl, 'clockLbl', game.duration ? 'Round' : 'Time');
  setText(els.clock, 'clock', fmtTime(remaining));
  els.clock.parentElement.classList.toggle('hot', !!game.duration && remaining <= 10000);
  const hp = Math.max(0, Math.round(game.health));
  if (setText(els.hp, 'hp', String(hp))) {
    els.hpFill.style.width = hp + '%';
    els.hp.closest('.health').classList.toggle('low', hp <= 30);
  }
  setText(els.lvl, 'lvl', String(game.levelIdx + 1));
  if (state === 'play' && roundBest > 0 && !beatBest && game.score > roundBest) {
    beatBest = true;
    els.hudBest.textContent = 'New best';
    els.hudBest.classList.add('beat');
    showBanner('New best', `You passed ${fmt(roundBest)}`);
    sfx.levelUp();
  }
}

function onLevel(idx) {
  const b = LEVEL_BANNERS[idx];
  if (!b) return;
  let [title, sub] = b;
  if ((tapMode || settings.dodges !== 'on') && idx === 2) sub = 'Speed 3 · three-punch combos';
  showBanner(title, sub);
}

function showBanner(title, sub) {
  els.banner.querySelector('.b-title').textContent = title;
  els.banner.querySelector('.b-sub').textContent = sub;
  els.banner.hidden = false;
  els.banner.classList.remove('show');
  void els.banner.offsetWidth;
  els.banner.classList.add('show');
}

function onCall(items) {
  const spans = items.map((it) => {
    const s = document.createElement('span');
    s.textContent = it.text;
    if (it.hand) s.style.color = COLORS[it.hand];
    else s.className = 'duck';
    return s;
  });
  els.call.replaceChildren(...spans);
  els.call.hidden = false;
  els.call.classList.remove('show');
  void els.call.offsetWidth;
  els.call.classList.add('show');
}

// ---------------------------------------------------------------- results

function onEnd(result) {
  state = 'over';
  lastResult = result;
  coach.stop();
  releaseWakeLock();
  els.lost.hidden = true;
  if (result.reason === 'ko') {
    setTimeout(() => sfx.bell(3), 350);
  } else {
    sfx.bell(3);
  }
  setTimeout(showResults, 1200);
}

let lastEntry = null; // { key, id } of the round just added to the leaderboard

function showResults() {
  const r = lastResult;
  if (!r || state !== 'over') return;
  state = 'results';
  const key = boardKey(settings.mode, tapMode);
  const modeName = MODE_NAMES[settings.mode] || '';
  const prevBest = bestFor(key);
  const g = gradeFor(r);
  r.grade = g;

  // Leaderboard: every scoring round is offered to this device's board.
  const entry = {
    id: `r${Date.now().toString(36)}`,
    name: getName(),
    score: r.score,
    letter: g ? g.letter : null,
    rating: g ? g.rating : null,
    level: r.level,
    date: new Date().toISOString().slice(0, 10),
  };
  const place = r.score > 0 ? addEntry(key, entry) : null;
  lastEntry = place ? { key, id: entry.id } : null;
  const isBest = r.score > 0 && r.score > prevBest;

  const title = r.reason === 'ko' ? 'Knocked down' : 'Final bell';
  let sub;
  if (r.reason === 'ko') sub = r.duration ? `Health ran out at ${fmtTime(r.time)}.` : `You lasted ${fmtTime(r.time)}.`;
  else sub = 'You went the distance.';
  $('scResult').textContent = title;
  $('scSub').textContent = sub;
  $('scDate').textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Grade stamp.
  $('scLetter').textContent = g ? g.letter : '–';
  $('scRating').textContent = g ? `${g.rating} / 100` : 'Too short';
  $('scGrade').setAttribute('aria-label', g ? `Grade ${g.letter}, ${g.rating} out of 100` : 'Not enough pads to grade');
  $('scGrade').dataset.band = g ? g.letter[0] : 'none';
  $('scTitle').textContent = g ? g.title : 'No contest';

  // Score and the best to beat.
  $('scScore').textContent = fmt(r.score);
  $('scBest').hidden = !isBest;
  let toBeat = '';
  if (isBest && prevBest > 0) toBeat = `Old best ${fmt(prevBest)}, beaten by ${fmt(r.score - prevBest)}`;
  else if (!isBest && prevBest > 0) toBeat = `Best to beat ${fmt(prevBest)}. ${fmt(prevBest - r.score)} short.`;
  $('scToBeat').textContent = toBeat;

  // Place on the board.
  const board = getBoard(key);
  const place$ = $('scPlace');
  const nameRow = $('scNameRow');
  if (place) {
    place$.textContent = `#${place} on the ${modeName}${tapMode ? (IS_DESK ? ' mouse' : ' taps') : ''} leaderboard`;
    $('scName').value = entry.name === 'You' ? '' : entry.name;
    $('scName').placeholder = 'Your name';
    nameRow.hidden = false;
  } else {
    const last = board[board.length - 1];
    place$.textContent = r.score > 0 && last ? `Score ${fmt(last.score + 1)} to make the top ${board.length}.` : '';
    nameRow.hidden = true;
  }

  $('stLanded').textContent = `${r.hits} / ${r.total}`;
  $('stAcc').textContent = `${Math.round(r.accuracy * 100)}%`;
  $('stPerfect').textContent = String(r.perfect);
  $('stCombo').textContent = String(r.bestCombo);
  $('stSlips').textContent = tapMode || settings.dodges !== 'on' ? 'Off' : `${r.slips} / ${r.ducks}`;
  $('stClean').textContent = r.hits ? `${(r.reaction / 1000).toFixed(2)} s` : 'n/a';
  $('stTime').textContent = fmtTime(r.time);
  $('stSpeed').textContent = String(r.level);

  // From your corner: what worked and what to work on.
  const notes = cornerNotes(r, { tapMode, dodges: settings.dodges === 'on' });
  const fill = (el, items) => el.replaceChildren(...items.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
  if (!notes.good.length && !notes.work.length) notes.work.push('Throw a few more rounds and your corner will have notes for you.');
  fill($('cornerGood'), notes.good);
  fill($('cornerWork'), notes.work);
  $('cornerGood').hidden = !notes.good.length;
  $('cornerWork').hidden = !notes.work.length;

  $('shareMsg').hidden = true;
  els.hud.hidden = true;
  els.banner.hidden = true;
  els.call.hidden = true;
  showScreen('results');
}

// Saving a name renames this round's entry and becomes the default for the next ones.
function saveName() {
  const name = cleanName($('scName').value);
  setName(name);
  if (lastEntry) renameEntry(lastEntry.key, lastEntry.id, name);
}
$('scName').addEventListener('change', saveName);
$('scName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.currentTarget.blur();
  }
});

// ---------------------------------------------------------------- leaderboard screen

const boardView = { mode: 60, input: 'cam', back: 'menu' };

function openBoard(from) {
  boardView.back = from;
  boardView.mode = settings.mode;
  boardView.input = from === 'results' && tapMode ? 'tap' : 'cam';
  state = 'board';
  renderBoard();
  showScreen('board');
}

function closeBoard() {
  state = boardView.back;
  showScreen(boardView.back);
}

function renderBoard() {
  document.querySelectorAll('[data-board-mode]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.boardMode) === boardView.mode)));
  document.querySelectorAll('[data-board-input]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.boardInput === boardView.input)));
  const key = boardKey(boardView.mode, boardView.input === 'tap');
  const list = getBoard(key);
  const mine = lastEntry && lastEntry.key === key ? lastEntry.id : null;
  const dateText = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
  const row = (e, i, tag) => {
    const li = document.createElement('li');
    li.className = tag;
    if (e.id === mine) li.classList.add('mine');
    const rank = Object.assign(document.createElement('span'), { className: 'rk', textContent: String(i + 1) });
    const name = Object.assign(document.createElement('span'), { className: 'nm', textContent: e.name || 'You' });
    const grade = Object.assign(document.createElement('span'), { className: 'gr', textContent: e.letter || '–' });
    const score = Object.assign(document.createElement('span'), { className: 'sc', textContent: fmt(e.score) });
    const date = Object.assign(document.createElement('span'), { className: 'dt', textContent: dateText(e.date) });
    li.append(rank, name, grade, score, date);
    return li;
  };
  $('podium').replaceChildren(...list.slice(0, 3).map((e, i) => row(e, i, `pod p${i + 1}`)));
  $('boardList').replaceChildren(...list.slice(3).map((e, i) => row(e, i + 3, 'line')));
  $('boardEmpty').hidden = list.length > 0;
}

document.querySelectorAll('[data-board-mode]').forEach((b) => b.addEventListener('click', (e) => {
  boardView.mode = Number(b.dataset.boardMode);
  renderBoard();
  blurAfterPointer(e);
}));
document.querySelectorAll('[data-board-input]').forEach((b) => b.addEventListener('click', (e) => {
  boardView.input = b.dataset.boardInput;
  renderBoard();
  blurAfterPointer(e);
}));
$('boardBtn').addEventListener('click', (e) => {
  blurAfterPointer(e);
  openBoard('menu');
});
$('resBoardBtn').addEventListener('click', (e) => {
  blurAfterPointer(e);
  saveName();
  openBoard('results');
});
$('boardBack').addEventListener('click', closeBoard);

// The start screen shows the score to beat for the chosen round length.
function updateMenuBest() {
  const best = bestFor(boardKey(settings.mode, false));
  $('targetLbl').textContent = `Best to beat · ${MODE_NAMES[settings.mode] || ''}`;
  $('bestScore').textContent = best ? fmt(best) : 'none yet';
}

async function shareScore() {
  const r = lastResult;
  if (!r) return;
  const grade = r.grade ? `a ${r.grade.letter} (${r.grade.rating}/100) and ` : '';
  const text = `I got ${grade}${fmt(r.score)} points in a ${MODE_NAMES[settings.mode] || ''} round of Mitt Rush, with ${Math.round(r.accuracy * 100)}% accuracy. Beat that.`;
  const url = location.href.split('#')[0].split('?')[0];
  const msg = $('shareMsg');
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Mitt Rush', text, url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    msg.textContent = 'Copied. Paste it anywhere.';
  } catch (e) {
    msg.textContent = `${text} ${url}`;
  }
  msg.hidden = false;
}

// ---------------------------------------------------------------- buttons

let camRequest = 0;

els.startBtn.addEventListener('click', async () => {
  sfx.unlock();
  coach.unlock();
  tapMode = false;
  els.startBtn.disabled = true;
  const mine = ++camRequest;
  try {
    await startCamera();
  } catch (err) {
    if (mine !== camRequest) return;
    console.error(err);
    refreshLoadStatus(cameraErrorText(err), true);
    els.startBtn.disabled = false;
    return;
  }
  els.startBtn.disabled = false;
  // The player chose to play with taps or the mouse while the camera prompt was open.
  if (mine !== camRequest) {
    stopCamera();
    return;
  }
  requestWakeLock();
  enterSetup();
});

$('tapBtn').addEventListener('click', () => {
  sfx.unlock();
  coach.unlock();
  camRequest++;
  els.startBtn.disabled = false;
  stopCamera();
  tapMode = true;
  requestWakeLock();
  beginCountdown(performance.now());
});

$('setupBack').addEventListener('click', goMenu);
$('pauseBtn').addEventListener('click', pause);
$('resumeBtn').addEventListener('click', resume);
$('restartBtn').addEventListener('click', () => {
  sfx.unlock();
  game.running = false;
  if (tapMode) beginCountdown(performance.now());
  else enterSetup();
});
$('quitBtn').addEventListener('click', goMenu);
$('againBtn').addEventListener('click', () => {
  saveName();
  sfx.unlock();
  coach.unlock();
  requestWakeLock();
  if (tapMode) beginCountdown(performance.now());
  else enterSetup();
});
$('menuBtn').addEventListener('click', () => {
  saveName();
  goMenu();
});
$('shareBtn').addEventListener('click', (e) => {
  shareScore();
  blurAfterPointer(e);
});

els.stage.addEventListener('pointerdown', (e) => {
  if (!tapMode || state !== 'play') return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest('button')) return;
  const r = els.stage.getBoundingClientRect();
  game.tapAt(e.clientX - r.left, e.clientY - r.top);
});

els.stage.addEventListener('contextmenu', (e) => {
  if (state === 'play' || state === 'countdown') e.preventDefault();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  else if (state === 'setup' || state === 'paused') requestWakeLock();
});

// Laptop keys: Space or P pauses and resumes, Escape pauses, F toggles full screen,
// Enter starts from the menu or runs it back from the scorecard.
window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  // Typing a name must not pause the game, toggle full screen or start a round.
  if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
  const key = e.key;
  if (e.repeat) {
    // Holding a key must not flip pause on and off or flicker full screen.
    if (key === ' ' || key === 'Spacebar' || key === 'Enter') e.preventDefault();
    return;
  }
  const onButton = !!(e.target && e.target.closest && e.target.closest('button'));
  if (key === ' ' || key === 'Spacebar' || key === 'p' || key === 'P') {
    if (state === 'play' || state === 'countdown') {
      e.preventDefault();
      pause();
    } else if (state === 'paused' && !(onButton && key === ' ')) {
      e.preventDefault();
      resume();
    }
  } else if (key === 'Escape') {
    if (state === 'board') closeBoard();
    else if (state === 'play' || state === 'countdown') pause();
    else if (state === 'paused') resume();
  } else if ((key === 'f' || key === 'F') && FS_ENABLED) {
    e.preventDefault();
    toggleFullscreen();
  } else if (key === 'Enter' && !onButton) {
    if (state === 'menu' && !els.startBtn.disabled) els.startBtn.click();
    else if (state === 'results') $('againBtn').click();
  }
});

// ---------------------------------------------------------------- full screen

const FS_ENABLED = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      const p = exit && exit.call(document);
      if (p && p.catch) p.catch(() => {});
    } else {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      const p = req && req.call(el);
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) {
    /* full screen refused: carry on windowed */
  }
}

let wasFullscreen = false;
function syncFullscreen() {
  const on = isFullscreen();
  if (wasFullscreen && !on && (state === 'play' || state === 'countdown')) pause();
  wasFullscreen = on;
  const menuBtn = $('fsMenuBtn');
  const hudBtn = $('fsHudBtn');
  menuBtn.hidden = !FS_ENABLED;
  hudBtn.hidden = !FS_ENABLED;
  menuBtn.textContent = on ? 'Exit full screen' : 'Full screen';
  hudBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  hudBtn.setAttribute('aria-pressed', String(on));
  setTimeout(resize, 60);
}

$('fsMenuBtn').addEventListener('click', (e) => {
  toggleFullscreen();
  blurAfterPointer(e);
});
$('fsHudBtn').addEventListener('click', (e) => {
  toggleFullscreen();
  e.currentTarget.blur();
});
document.addEventListener('fullscreenchange', syncFullscreen);
document.addEventListener('webkitfullscreenchange', syncFullscreen);

// ---------------------------------------------------------------- install as an app

const RUNNING_AS_APP =
  (window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches)) ||
  navigator.standalone === true;
let installPrompt = null;
let installed = false;

function syncInstall() {
  const btn = $('installBtn');
  const hint = $('installHint');
  if (RUNNING_AS_APP || installed) {
    btn.hidden = true;
    hint.hidden = true;
    return;
  }
  if (installPrompt) {
    btn.hidden = false;
    btn.textContent = `Install on this ${IS_DESK ? 'computer' : 'phone'}`;
    hint.hidden = true;
    return;
  }
  btn.hidden = true;
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const macSafari = !iOS && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua);
  const safariVersion = Number((ua.match(/Version\/(\d+)/) || [])[1] || 0);
  const iosVersion = Number((ua.match(/OS (\d+)_/) || [])[1] || 0);
  const iosSafari = iOS && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  let text = '';
  const iosInApp = iOS && !/Safari\//.test(ua); // e.g. a link opened inside a social app
  if (iOS && !iosInApp && (iosSafari || iosVersion >= 17)) text = 'Keep it on your home screen: tap Share, then Add to Home Screen.';
  else if (iOS) text = 'To keep it on your home screen, open this page in Safari, then tap Share, then Add to Home Screen.';
  else if (macSafari && safariVersion >= 17) text = 'Keep it in your Dock: in Safari choose File, then Add to Dock.';
  hint.textContent = text;
  hint.hidden = !text;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  syncInstall();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installed = true;
  syncInstall();
});
$('installBtn').addEventListener('click', async (e) => {
  blurAfterPointer(e);
  const promptEvent = installPrompt;
  if (!promptEvent) return;
  installPrompt = null;
  try {
    await promptEvent.prompt();
    await promptEvent.userChoice;
  } catch (e) {
    /* prompt dismissed or unavailable */
  }
  syncInstall();
});

// Offline support: the service worker keeps the game, tracking model and fonts
// on this device after the first visit.
// Registered once tracking has loaded, so the worker's downloads come from the
// browser cache instead of competing with the page's own first download.
if ('serviceWorker' in navigator && window.isSecureContext) {
  trackerLoading.finally(() => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Offline support unavailable', err));
  });
}

// ---------------------------------------------------------------- setup check

function updateSetup(now) {
  const p = body.parts;
  $('ckHead').classList.toggle('ok', !!p.head);
  $('ckShoulders').classList.toggle('ok', !!p.shoulders);
  $('ckLeft').classList.toggle('ok', !!p.left);
  $('ckRight').classList.toggle('ok', !!p.right);
  const all = p.head && p.shoulders && p.left && p.right;
  // Leave room for hooks out to the side and for pads above the head.
  const tooClose = body.S > Math.min(view.W * 0.34, view.H * 0.36);
  const room = framing();
  let title = 'Step into the shot';
  let hint;
  if (trackerState === 'loading') hint = 'Loading body tracking…';
  else if (trackerState === 'failed') hint = 'Body tracking could not start in this browser. Try Safari or Chrome.';
  else if (!body.hasPose) hint = `Stand about 6 feet from your ${DEVICE_NAME}, facing the screen.`;
  else if (!p.shoulders || !p.head) hint = 'Get your head and both shoulders in the shot.';
  else if (tooClose) hint = 'Step back a little so there is room for hooks.';
  else if (!room.above) hint = `Tilt the ${IS_DESK ? 'screen' : 'phone'} back a little, or step back, so there is room above your head.`;
  else if (!room.below) hint = `Tilt the ${IS_DESK ? 'screen' : 'phone'} forward a little so your chest is in the shot.`;
  else if (!p.left || !p.right) hint = 'Bring both fists up to your chin.';
  else {
    title = 'Hold your guard';
    hint = 'Round starts in a moment.';
  }
  setText(els.setupTitle, 'setupTitle', title);
  setText(els.setupHint, 'setupHint', hint);

  const ok = trackerState === 'ready' && all && !tooClose && room.above && room.below;
  if (ok) {
    if (setupOkSince === null) setupOkSince = now;
    const k = Math.min(1, (now - setupOkSince) / 1000);
    els.holdFill.style.width = `${Math.round(k * 100)}%`;
    if (k >= 1) beginCountdown(now);
  } else {
    setupOkSince = null;
    els.holdFill.style.width = '0%';
  }
}

// Pads sit at fixed spots around the body. If the head is near the top of the
// screen, the high pads get squeezed down onto the low ones, so make sure the
// jab and hook pads fit above and the uppercut pads fit below.
function framing() {
  if (!body.anchor || !body.S) return { above: true, below: true };
  const S = body.S;
  const r = Math.min(Math.max(S * PAD.size, PAD.min), Math.max(PAD.min, Math.min(view.W, view.H) * PAD.maxShare));
  const slack = 0.15 * S;
  const highest = body.anchor.y + Math.min(PUNCHES[1].y, PUNCHES[3].y) * S - r;
  const lowest = body.anchor.y + PUNCHES[5].y * S + r;
  return {
    above: highest >= game.view.top - slack,
    below: lowest <= view.H - game.view.bottom + slack,
  };
}

// Pause the round while the player is out of the shot.
function updateLost(now) {
  if (body.present(now)) {
    lostSince = null;
    if (isLost) {
      if (foundSince === null) foundSince = now;
      if (now - foundSince > 500) {
        isLost = false;
        els.lost.hidden = true;
      }
    }
  } else {
    foundSince = null;
    if (lostSince === null) lostSince = now;
    if (!isLost && now - lostSince > 300) {
      isLost = true;
      els.lost.hidden = false;
      coach.stop();
    }
  }
}

// ---------------------------------------------------------------- main loop

let last = performance.now();
let fpsFrames = 0;
let fpsPose = 0;
let fpsT = last;
let fpsText = '';

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, view.W, view.H);
  if (state === 'menu') return;
  ctx.save();
  if (game.shake) ctx.translate((Math.random() * 2 - 1) * game.shake, (Math.random() * 2 - 1) * game.shake);
  if (tapMode) drawGhost(ctx, game.frameOf());
  if (camOn) drawBody(ctx, body, settings.skeleton === 'on');
  if (state !== 'setup') game.draw(ctx);
  ctx.restore();
  if (game.flash > 0) {
    const g = ctx.createRadialGradient(view.W / 2, view.H / 2, Math.min(view.W, view.H) * 0.3, view.W / 2, view.H / 2, Math.max(view.W, view.H) * 0.75);
    g.addColorStop(0, 'rgba(255,79,106,0)');
    g.addColorStop(1, `rgba(255,79,106,${0.55 * game.flash})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.W, view.H);
  }
}

function frame(now) {
  // Real elapsed time keeps pad timing honest on slower phones; the cap only
  // guards against huge jumps (a stalled tab is paused separately).
  const dt = Math.min(100, now - last);
  last = now;

  if (camOn && trackerState === 'ready') {
    const lms = tracker.detect(els.video, now);
    if (lms !== undefined) {
      body.update(lms, now, map);
      fpsPose++;
    }
  }

  if (state === 'setup') updateSetup(now);
  else if (state === 'countdown') updateCountdown(now);
  else if (state === 'play') {
    if (!tapMode) updateLost(now);
    if (isLost) game.updateFx(dt);
    else game.step(dt);
    updateHud();
  } else if (state === 'over') {
    game.updateFx(dt);
    updateHud();
  }

  render();

  if (DEBUG) {
    fpsFrames++;
    if (now - fpsT >= 1000) {
      fpsText = `${tracker.delegate || '-'} ${tracker.model} ${tracker.avgMs.toFixed(0)} ms · draw ${fpsFrames} fps · pose ${fpsPose} fps · ${els.video.videoWidth}x${els.video.videoHeight} · S ${Math.round(body.S)}`;
      fpsFrames = 0;
      fpsPose = 0;
      fpsT = now;
    }
    els.debug.hidden = false;
    els.debug.textContent = `${fpsText} · ${state}`;
  }
  requestAnimationFrame(frame);
}

syncChips();
syncFullscreen();
syncInstall();
updateMenuBest();
if (document.fonts && document.fonts.load) {
  document.fonts.load('900 40px "Big Shoulders Display"').catch(() => {});
  document.fonts.load('700 16px "Barlow Semi Condensed"').catch(() => {});
}
if (DEBUG) window.__mitt = { game, body, tracker, settings, get state() { return state; } };
requestAnimationFrame(frame);
