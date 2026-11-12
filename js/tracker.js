// Wraps MediaPipe's pose landmarker. Everything it needs (runtime + model) ships
// with the game, so it works from any static host without third-party CDNs.
import { FilesetResolver, PoseLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';

const WASM_DIR = new URL('../vendor/mediapipe/wasm', import.meta.url).href;
const MODEL = new URL('../models/pose_landmarker_lite.task', import.meta.url).href;

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
  }

  async load() {
    this.fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    try {
      await this._create('GPU');
    } catch (err) {
      console.warn('GPU tracking unavailable, falling back to CPU.', err);
      await this._create('CPU');
    }
    this.ready = true;
  }

  async _create(delegate) {
    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch (e) {
        /* already closed */
      }
      this.landmarker = null;
    }
    this.landmarker = await PoseLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    this.delegate = delegate;
    this.failures = 0;
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
      const res = this.landmarker.detectForVideo(video, stamp);
      this.failures = 0;
      const lms = res && res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;
      // Some mobile GPUs fail silently: no error, just never a person. If the GPU
      // path has not found anyone in ~300 frames (about 10 s), try the CPU path once.
      if (lms) this.emptyStreak = 0;
      else if (this.delegate === 'GPU' && !this.triedCpu && ++this.emptyStreak > 300) {
        this.triedCpu = true;
        this.busy = true;
        console.warn('No pose found on GPU, retrying on CPU.');
        this._create('CPU')
          .catch((e) => console.error('CPU tracking failed', e))
          .finally(() => {
            this.busy = false;
          });
      }
      return lms;
    } catch (err) {
      this.failures++;
      console.warn('Pose detection failed', err);
      if (this.failures > 3 && this.delegate === 'GPU') {
        this.busy = true;
        this._create('CPU')
          .catch((e) => console.error('CPU tracking failed too', e))
          .finally(() => {
            this.busy = false;
          });
      }
      return null;
    }
  }
}
