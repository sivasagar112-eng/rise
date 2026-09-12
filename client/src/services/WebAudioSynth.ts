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


  // Start continuous alarm with gradual volume ramp (Single audio instance)
  public startAlarm(rampDurationSec: number = 30): void {
    // Release any previous audio instance before starting a new one
    this.stopAlarm();

    this.rampDurationSeconds = Math.max(5, rampDurationSec);
    this.isPlaying = true;

    // Check for user-selected or default smooth rise_alarm.wav audio file
    const custom = localStorage.getItem('rise_custom_ringtone_url');
    const audioUrl = custom || '/rise_alarm.wav';
    this.customRingtoneUrl = audioUrl;

    try {
      this.customAudio = new Audio(audioUrl);
      this.customAudio.loop = true;
      this.customAudio.volume = 0.05;

      const playPromise = this.customAudio.play();
      if (playPromise) {
        playPromise.catch((e) => {
          console.warn('[WebAudioSynth] Audio element playback deferred/failed:', e);
          this.fallbackSmoothSynthesizer();
        });
      }

      // Smooth volume ramp
      this.startTime = performance.now();
      this.intervalId = window.setInterval(() => {
        if (!this.customAudio || !this.isPlaying) return;
        const elapsed = (performance.now() - this.startTime) / 1000;
        const progress = Math.min(1, elapsed / this.rampDurationSeconds);
        this.customAudio.volume = Math.min(1, 0.05 + progress * 0.95);
      }, 200);
    } catch {
      this.fallbackSmoothSynthesizer();
    }
  }

  // Fallback purely synthesized smooth ambient morning chord (pure sine, zero harshness)
  private fallbackSmoothSynthesizer(): void {
    if (!this.isPlaying) return;
    const ctx = this.initContext();
    this.startTime = ctx.currentTime;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.03, ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(0.8, ctx.currentTime + this.rampDurationSeconds);
    this.masterGain.connect(ctx.destination);

    const playSmoothChord = () => {
      if (!this.isPlaying || !this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      // Warm A-major chord: A3 (220Hz), C#4 (277Hz), E4 (330Hz), A4 (440Hz)
      const freqs = [220.0, 277.18, 329.63, 440.0];
      freqs.forEach((f, i) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine'; // Pure gentle sine
        osc.frequency.setValueAtTime(f, now + i * 0.15);
        g.gain.setValueAtTime(0.001, now + i * 0.15);
        g.gain.linearRampToValueAtTime(0.2, now + i * 0.15 + 0.2); // Soft attack
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 2.5); // Warm decay
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 2.6);
      });
    };

    playSmoothChord();
    this.intervalId = window.setInterval(playSmoothChord, 3500);
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
