class WebAudioSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isPlaying: boolean = false;
  private intervalId: number | null = null;
  private startTime: number = 0;
  private rampDurationSeconds: number = 30;
  private customAudio: HTMLAudioElement | null = null;
  private customRingtoneUrl: string | null = null;

  private initContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Pre-alarm subtle haptic pulse
  public triggerPreAlarmHaptic(): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([120, 300, 120, 300, 200]);
    }
  }

  // Play a single minimalist resonant bell chime
  private playChimeStrike(time: number, freq: number = 587.33): void {
    if (!this.ctx || !this.masterGain) return;

    // Harmonic 1 (Fundamental)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, time);

    // Harmonic 2 (Subtle overtone)
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 1.5, time);

    // Envelope for sharp transient and clean decay
    gain1.gain.setValueAtTime(0.7, time);
    gain1.gain.exponentialRampToValueAtTime(0.001, time + 0.9);

    gain2.gain.setValueAtTime(0.25, time);
    gain2.gain.exponentialRampToValueAtTime(0.001, time + 0.6);

    osc1.connect(gain1);
    gain1.connect(this.masterGain);

    osc2.connect(gain2);
    gain2.connect(this.masterGain);

    osc1.start(time);
    osc2.start(time);

    osc1.stop(time + 1.0);
    osc2.stop(time + 0.7);

    // Trigger phone vibration in sync with chime strike
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(80);
    }
  }

  // Start continuous alarm with gradual volume ramp
  public startAlarm(rampDurationSec: number = 30): void {
    if (this.isPlaying) return;
    this.rampDurationSeconds = Math.max(5, rampDurationSec);
    this.isPlaying = true;

    // Check for custom ringtone first
    this.customRingtoneUrl = localStorage.getItem('rise_custom_ringtone_url');

    if (this.customRingtoneUrl) {
      // Play user's custom audio file on loop
      this.customAudio = new Audio(this.customRingtoneUrl);
      this.customAudio.loop = true;
      this.customAudio.volume = 0.05;
      this.customAudio.play().catch(e => console.warn('Custom ringtone play failed:', e));

      // Gradual volume ramp for custom audio
      this.startTime = performance.now();
      this.intervalId = window.setInterval(() => {
        if (!this.customAudio || !this.isPlaying) return;
        const elapsed = (performance.now() - this.startTime) / 1000;
        const progress = Math.min(1, elapsed / this.rampDurationSeconds);
        this.customAudio.volume = Math.min(1, 0.05 + progress * 0.95);
      }, 200);

      // Vibrate in sync
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([80, 400, 80, 400, 200]);
      }
    } else {
      // Fall back to synthesized chime
      const ctx = this.initContext();
      this.startTime = ctx.currentTime;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.03, ctx.currentTime);
      this.masterGain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + this.rampDurationSeconds);
      this.masterGain.connect(ctx.destination);

      const pattern = () => {
        if (!this.isPlaying || !this.ctx) return;
        const now = this.ctx.currentTime;
        this.playChimeStrike(now, 587.33);       // D5
        this.playChimeStrike(now + 0.25, 783.99); // G5
        this.playChimeStrike(now + 0.50, 880.00); // A5
      };

      pattern();
      this.intervalId = window.setInterval(pattern, 1800);
    }
  }

  // Calculate current volume ramp percentage (0-100%)
  public getRampProgress(): number {
    if (!this.isPlaying) return 0;
    if (this.customRingtoneUrl) {
      const elapsed = (performance.now() - this.startTime) / 1000;
      return Math.min(100, Math.round((elapsed / this.rampDurationSeconds) * 100));
    }
    if (!this.ctx) return 0;
    const elapsed = this.ctx.currentTime - this.startTime;
    return Math.min(100, Math.round((elapsed / this.rampDurationSeconds) * 100));
  }

  // Play a brief positive confirmation beep
  public playSuccessTone(): void {
    const ctx = this.initContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    gain.connect(ctx.destination);
    osc.connect(gain);

    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
    osc.frequency.setValueAtTime(783.99, now + 0.24); // G5

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.start(now);
    osc.stop(now + 0.5);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([50, 50, 100]);
    }
  }

  // Play a short rep count feedback chirp for pushups
  public playRepChirp(): void {
    const ctx = this.initContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.08);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(60);
    }
  }

  // Stop the alarm audio completely
  public stopAlarm(): void {
    this.isPlaying = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Stop custom audio if playing
    if (this.customAudio) {
      try {
        this.customAudio.pause();
        this.customAudio.currentTime = 0;
        this.customAudio.src = '';
      } catch { /* ignore */ }
      this.customAudio = null;
    }

    if (this.masterGain && this.ctx) {
      try {
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.ctx.currentTime);
        this.masterGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.1);
        setTimeout(() => {
          this.masterGain?.disconnect();
          this.masterGain = null;
        }, 120);
      } catch {
        this.masterGain = null;
      }
    }
  }

  public isAlarmPlaying(): boolean {
    return this.isPlaying;
  }
}

export const synth = new WebAudioSynth();
