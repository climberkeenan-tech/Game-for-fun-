// The coach calls combinations out loud using the browser's built-in speech.
// Silently does nothing where speech synthesis is missing.

export class Coach {
  constructor() {
    this.enabled = true;
    this.synth = window.speechSynthesis || null;
    this.voice = null;
    if (this.synth) {
      const pick = () => {
        const voices = this.synth.getVoices();
        this.voice =
          voices.find((v) => /en[-_]US/i.test(v.lang) && /Daniel|Alex|Fred|Google US/i.test(v.name)) ||
          voices.find((v) => /^en/i.test(v.lang)) ||
          null;
      };
      pick();
      if ('onvoiceschanged' in this.synth) this.synth.onvoiceschanged = pick;
    }
  }

  // iOS only allows speech after a gesture; speaking an empty line inside one unlocks it.
  unlock() {
    if (!this.synth) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      this.synth.speak(u);
    } catch (e) {
      /* speech unavailable */
    }
  }

  say(text, rate = 1.35) {
    if (!this.enabled || !this.synth) return;
    try {
      this.synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate;
      u.pitch = 0.85;
      if (this.voice) u.voice = this.voice;
      this.synth.speak(u);
    } catch (e) {
      /* speech unavailable */
    }
  }

  stop() {
    if (this.synth) this.synth.cancel();
  }
}
