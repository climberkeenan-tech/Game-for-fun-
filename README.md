# Mitt Rush

A boxing pad-work game that runs in a phone browser. Prop your phone up, step back, and punch the pads that appear around you on screen. The front camera tracks your body on the device itself. No app install, no account, and no video leaves the phone.

## How to play

1. Lean your phone against something at about chest height with the screen facing you.
2. Step back about 6 feet (2 m) so your head, shoulders and both fists are in the shot.
3. Hit each pad as its white ring closes onto it.

Pads use the trainer's number system and are colored by the hand that should throw them:

| Pad | Punch | Hand (orthodox) |
| --- | --- | --- |
| 1 | Jab | Left (blue) |
| 2 | Cross | Right (red) |
| 3 | Lead hook | Left (blue) |
| 4 | Rear hook | Right (red) |
| 5 | Lead uppercut | Left (blue), drive upward through it |
| 6 | Rear uppercut | Right (red), drive upward through it |

Southpaw mode swaps lead and rear.

**Timing.** Hitting as the ring lands scores PERFECT (300), close to it GREAT (200), otherwise GOOD (100). The wrong hand still counts but only scores 50.

**Combo.** Every 5 hits in a row adds x0.25 to your multiplier, up to x4. A miss resets it.

**Health.** A missed pad costs 8, getting caught by a duck bar costs 15. Clean hits win a little back. At zero you are knocked down and the round ends.

**Ducks.** From speed 3 on, a striped bar swings in at head height. Get your head below the dashed line before it lands.

**Speed.** Scoring unlocks 8 speed levels with faster pads and longer combinations (1-2, 1-2-3, 1-6-3-2 and so on). The coach calls each combination out loud.

**Modes.** 1-minute round, 3-minute round, or survival until your health runs out. No camera? "Play with taps" works on any screen.

## Hosting it (GitHub Pages)

The camera only works over https, and GitHub Pages provides that for free:

1. Open the repository on GitHub, then **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Pick the branch that holds this code and the **/ (root)** folder, then **Save**.
4. After a minute the game is live at `https://<your-user>.github.io/<repo-name>/`.

Open that link on your phone, tap **Glove up**, and allow the camera.

## Running locally

Any static file server works, for example:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. Browsers allow the camera on `localhost`. A phone on the same Wi-Fi needs https, so use GitHub Pages for phone testing.

Add `?debug` to the URL to show tracking speed (pose frames per second, GPU or CPU) in the corner.

## Project layout

```
index.html          screens and HUD markup
css/style.css       all styling
js/main.js          camera, screens, main loop, HUD, results
js/game.js          pads, timing, scoring, ducks, drawing
js/body.js          turns pose landmarks into fist positions and speeds
js/tracker.js       MediaPipe pose landmarker wrapper (GPU with CPU fallback)
js/config.js        every tuning number: punch positions, speed levels, timing windows, health
js/sfx.js           synthesized sound effects (no audio files)
js/coach.js         spoken combination calls
models/             pose_landmarker_lite.task
vendor/mediapipe/   MediaPipe Tasks Vision runtime
```

Gameplay feel lives in `js/config.js`. If punches are not registering, lower `HIT.minSpeed`. If pads feel too easy to clip, lower `HIT.reach`.

## Credits

- Body tracking: [MediaPipe Tasks Vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) 0.10.21 and the Pose Landmarker Lite model, both Apache 2.0. See `vendor/mediapipe/NOTICE.md`.
- Fonts: Big Shoulders Display and Barlow Semi Condensed from Google Fonts (SIL Open Font License).
