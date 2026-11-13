# Mitt Rush

A boxing pad-work game that runs in the browser on a phone or a laptop. Set the device up, step back, and punch the pads that appear around you on screen. The camera tracks your body on the device itself. No account, and no video leaves the device.

## How to play

1. **Phone:** lean it against something at about chest height with the screen facing you.
   **Laptop:** set it on a table or counter and tilt the screen so the camera faces the spot where you will stand.
2. Step back about 6 feet (2 m) so your head, shoulders and both fists are in the shot.
3. Keep your fists up by your chin and punch each pad as soon as it shows up, then bring the fist back. Any real punch counts, including one thrown straight at the camera: you don't have to reach the pad on screen.

Pads use the trainer's number system and are colored by the hand that should throw them:

| Pad | Punch | Hand (orthodox) |
| --- | --- | --- |
| 1 | Jab | Left (blue) |
| 2 | Cross | Right (red) |
| 3 | Lead hook | Left (blue) |
| 4 | Rear hook | Right (red) |
| 5 | Lead uppercut | Left (blue), low by your stomach: drive upward through it |
| 6 | Rear uppercut | Right (red), low by your stomach: drive upward through it |

Southpaw mode swaps lead and rear.

**Speed.** A pad can be hit the moment it shows up, and the faster you hit it the more it scores: within about two thirds of a second is PERFECT (300), within a second GREAT (200), later GOOD (100). From speed 6 on, pads stay up for less time and those cut-offs tighten with them, down to about 0.45 s for PERFECT and 0.75 s for GREAT at speed 8. The ring around it is a countdown: it drains away, turning gold and then orange, and when it runs out the pad is missed. The next set comes a moment after you finish the current one, so quick hands get more pads.

**One hand, one pad.** Each hand has one pad on screen at a time: the next blue pad appears once the current one is hit or missed, and the same for red, so pads never stack up. Blue pads are for your left, red pads for your right. One punch takes one pad: combos go in order, pulling your fist back never counts, and a fist that just landed has to stop or pull back before it can land again. Single-frame tracking glitches, including the tracker briefly swapping your left and right wrists, are ignored.

**Every punch lands.** A pad goes down the moment your fist is on it (the colored dot on your fist inside the circle), however slowly it got there, or the moment you throw a punch while it's up, however close it gets. A pad that pops up right where your fist already is waits until you move off it and come back. Nothing counts in the first 0.15 s after a pad shows up: that's too soon to be a reaction to it, so it's a hand that happened to be moving. Every pad sits clear of where your fists rest in your guard (the uppercut pads are down by your stomach), so a resting guard never sets one off. A punch is a quick move of the fist out to that hand's side or up (an uppercut), and it counts while it's still on its way out, so the pad pops without waiting for the punch to finish. A punch thrown straight at the camera counts too: the tracker's 3D estimate sees the arm straighten, and on screen the arm looks shorter as it points at the camera. A punch with the other hand counts too, out to its own side or across your body at the pad, once the pad has been up for a quarter of a second. There is no good or bad punch: every hit scores PERFECT, GREAT or GOOD by how fast it came. Only a punch thrown after the pad showed up counts for it. Moving your whole body (bouncing, swaying, stepping), resting your fists, and lowering your arms don't set pads off.

**Combo.** Every 5 hits in a row adds x0.25 to your multiplier, up to x4. A miss resets it.

**Health.** A missed pad costs 8, getting caught by a counter punch costs 15. Every hit wins a little back. At zero you are knocked down and the round ends.

**Slips and ducks.** From speed 3 on, the coach throws punches back at you, with less warning as the speed goes up. The coach calls "duck" for a hook swinging in from the side: roll under it by dropping your head. "Slip" means a straight coming at your face: move your head to either side, or duck. The ring around your head turns white once you're out of the way. Turn these off with **Dodges: Off** on the start screen.

**Speed levels.** The game speeds up as you go: every 6 to 18 pads you land (dodges count too) takes you up a level, 8 in all, with less time per pad, a shorter rest between sets, and longer combinations (1-2, 1-2-3, 1-6-3-2 and so on). A good 1-minute round gets to about speed 6 or 7, and a 3-minute round to the top. The coach calls each combination out loud.

**Grade.** Every round of 8 pads or more gets a letter grade from A+ down to F, with a rating out of 100 and a title from Champion to Tomato can. The grade measures how well you boxed, not how long the round was: accuracy counts about 60% and speed about 40% (PERFECT counts fully, GREAT 70%, GOOD 40%). When the coach threw punches back, dodging counts about a fifth and the other two share the rest.

**From your corner.** The scorecard ends with what went well and what to work on next, based on that round. For example, which punch type missed most, one hand landing much less than the other, how quickly you reacted, getting caught by the hook, or short combos.

**Best to beat and the leaderboard.** The start screen shows the score to beat for the round length you picked, and the score tape shows it during the round, flashing NEW BEST when you pass it. The top 10 rounds for each round length are kept on a leaderboard with name, grade and date. Camera rounds and tap or mouse rounds have separate boards. The leaderboard is stored on this device only.

**Modes.** 1-minute round, 3-minute round, or survival until your health runs out. No camera? "Play with taps" (or "Play with your mouse" on a laptop) works on any screen.

**Laptop keys.** Space or P pauses and resumes, Escape pauses (in full screen it leaves full screen and pauses), F toggles full screen, Enter starts a round from the menu or runs it back from the scorecard.

**Body tracking.** The game uses MediaPipe's full pose model, which places wrists and fists more accurately than the lite one. If a device can't run it at camera speed, the game switches to the lite model by itself. Tracking is sharpest with light in front of you and no bright window behind you.

## Install it as an app

Once the game is hosted (below), you can install it so it gets its own icon and window and keeps working offline after the first load:

- **Chrome or Edge (Windows, Mac, Chromebook, Android):** use the **Install on this computer** button on the start screen, or the install icon at the right end of the address bar.
- **Safari on a Mac (macOS Sonoma or later):** File, then Add to Dock.
- **iPhone or iPad:** Share, then Add to Home Screen.
- **Firefox:** no app install. Bookmark the page instead.

The first visit downloads about 20 MB (the body-tracking model and runtime). After that it loads from the device.

## Hosting it (GitHub Pages)

The camera only works over https, and GitHub Pages provides that for free:

1. Open the repository on GitHub, then **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Pick the branch that holds this code and the **/ (root)** folder, then **Save**.
4. After a minute the game is live at `https://<your-user>.github.io/<repo-name>/`.

Open that link on your phone or laptop, tap **Glove up**, and allow the camera.

## Running locally

Any static file server works, for example:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. Browsers allow the camera on `localhost`. A phone on the same Wi-Fi needs https, so use GitHub Pages for phone testing.

Add `?debug` to the URL to show tracking speed in the corner: GPU or CPU, which pose model, milliseconds per frame, and pose frames per second. Add `?model=lite` or `?model=full` to force a pose model.

## Project layout

```
index.html          screens and HUD markup
manifest.webmanifest, icons/   app install metadata and icons
sw.js               offline support (caches the game, model and fonts)
css/style.css       all styling
js/main.js          camera, screens, main loop, HUD, results
js/game.js          pads, hit detection, timing, scoring, counter punches, drawing
js/body.js          smooths pose landmarks and turns them into fist positions and speeds
js/tracker.js       MediaPipe pose landmarker wrapper (full model, lite fallback, GPU with CPU fallback)
js/config.js        every tuning number: punch positions, speed levels, timing windows, health
js/sfx.js           synthesized sound effects (no audio files)
js/coach.js         spoken combination calls
js/records.js       grades, the leaderboard and the corner's notes (kept in localStorage)
models/             pose_landmarker_full.task and pose_landmarker_lite.task
vendor/mediapipe/   MediaPipe Tasks Vision runtime
```

After replacing anything in `vendor/` or `models/`, bump `ASSET_CACHE` in `sw.js` so installed copies pick up the new files.

Gameplay feel lives in `js/config.js`. `PUNCH` decides what counts as a punch: if real punches are not registering, lower `PUNCH.speed` or `PUNCH.travel` (punches on screen) or `PUNCH.rise3` and `PUNCH.shorten` (punches at the camera). If pads go off when you didn't mean to hit them, do the opposite. `HIT` covers a fist reaching or resting on a pad on screen (`HIT.over`, `HIT.moveMin`, and `HIT.minReact`, the time after a pad shows up before anything counts). `LEVELS[].at` sets how many pads you land before each speed level, and `LEVELS[].window` how long each pad stays up. `PAD.size` sets how big pads are next to your body.

## Credits

- Body tracking: [MediaPipe Tasks Vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) 0.10.21 and the Pose Landmarker Full and Lite models, all Apache 2.0. See `vendor/mediapipe/NOTICE.md`.
- Fonts: Big Shoulders Display and Barlow Semi Condensed from Google Fonts (SIL Open Font License).
