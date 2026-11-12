// Wraps MediaPipe's pose landmarker. Everything it needs (runtime + models) ships
// with the game, so it works from any static host without third-party CDNs.
//
// It starts on the "full" pose model, which places wrists and hands noticeably
// better than "lite". If this device can't run it fast enough to keep up with the
// camera, it switches to "lite" by itself. Add ?model=lite or ?model=full to the
// URL to force one.
import { FilesetResolver, PoseLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';

const WASM_DIR = new URL('../vendor/mediapipe/wasm', import.meta.url).href;
const MODELS = {
  full: new URL('../models/pose_landmarker_full.task', import.meta.url).href,
  lite: new URL('../models/pose_landmarker_lite.task', import.meta.url).href,
};

const SLOW = {
  warmup: 8,   // frames ignored while the GPU warms up
  quick: 10,   // after this many frames, switch at once if it is far too slow
  frames: 45,  // after this many, switch if it is too slow on average
  ms: 30,      // "too slow": the camera delivers a frame about every 33 ms
};

export class Tracker {
  constructor() {
    this.landmarker = null;
    this.ready = false;
    this.busy = false;
    this.delegate = null;
    this.lastVideoTime = -1;
    this.lastStamp = 0;
    this.failures = 0;
    this.emptyStreak = 0;
    this.triedCpu = false;
    const forced = new URLSearchParams(location.search).get('model');
    this.forced = forced in MODELS ? forced : null;
    this.model = this.forced || 'full';
    this.frames = 0;
    this.avgMs = 0;
  }

  async load() {
    this.fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    try {
      await this._create('GPU', this.model);
    } catch (err) {
      // Without the GPU the full model is too slow, so drop to lite as well.
      console.warn('GPU tracking unavailable, falling back to CPU.', err);
      await this._create('CPU', this.forced || 'lite');
    }
    this.ready = true;
  }

  async _create(delegate, model) {
    const next = await PoseLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: MODELS[model], delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      // Slightly lower than the defaults so the pose is kept through fast,
      // blurry punches instead of being dropped and searched for again.
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch (e) {
        /* already closed */
      }
    }
    this.landmarker = next;
    this.delegate = delegate;
    this.model = model;
    this.failures = 0;
    this.frames = 0;
    this.avgMs = 0;
  }

  // Swap models. Detection pauses for the second or so this takes; it normally
  // happens during the setup screen, before the round starts.
  _switch(delegate, model, why) {
    if (this.busy) return;
    this.busy = true;
    console.warn(why);
    this._create(delegate, model)
      .catch((e) => console.error('Could not switch tracking model', e))
      .finally(() => {
        this.busy = false;
      });
  }

  // Returns the 33 landmarks of the first person, null when nobody is found,
  // or undefined when there is no new camera frame since the last call.
  detect(video, now) {
    if (!this.ready || this.busy || !this.landmarker || video.readyState < 2) return undefined;
    if (video.currentTime === this.lastVideoTime) return undefined;
    this.lastVideoTime = video.currentTime;
    // Timestamps must strictly increase.
    const stamp = Math.max(now, this.lastStamp + 1);
    this.lastStamp = stamp;
    try {
      const t0 = performance.now();
      const res = this.landmarker.detectForVideo(video, stamp);
      this.measure(performance.now() - t0);
      this.failures = 0;
      const lms = res && res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;
      // Some mobile GPUs fail silently: no error, just never a person. If the GPU
      // path has not found anyone in ~300 frames (about 10 s), try the CPU path once.
      if (lms) this.emptyStreak = 0;
      else if (this.delegate === 'GPU' && !this.triedCpu && ++this.emptyStreak > 300) {
        this.triedCpu = true;
        this._switch('CPU', this.forced || 'lite', 'No pose found on GPU, retrying on CPU.');
      }
      return lms;
    } catch (err) {
      this.failures++;
      console.warn('Pose detection failed', err);
      if (this.failures > 3 && this.delegate === 'GPU') {
        this._switch('CPU', this.forced || 'lite', 'GPU tracking keeps failing, switching to CPU.');
      }
      return null;
    }
  }

  // Average time per frame; drop to the lite model if the full one can't keep up.
  measure(ms) {
    this.frames++;
    if (this.frames <= SLOW.warmup) return;
    const n = this.frames - SLOW.warmup;
    this.avgMs += (ms - this.avgMs) / Math.min(n, SLOW.frames);
    const tooSlow = (n >= SLOW.quick && this.avgMs > SLOW.ms * 2) || (n >= SLOW.frames && this.avgMs > SLOW.ms);
    if (this.model === 'full' && !this.forced && tooSlow) {
      this._switch(this.delegate, 'lite', `Full pose model averages ${this.avgMs.toFixed(0)} ms per frame here; switching to lite.`);
    }
  }
}
