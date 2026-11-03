/**
 * HapticFeedback & Micro-Interactions Service
 * Provides physical tactile feedback via Navigator Vibrate API and
 * subtle, luxury mechanical audio micro-ticks via Web Audio API.
 * Ensures every touch, tap, toggle, and scroll tick feels responsive and premium
 * across Android, iOS, and Web.
 */

class HapticFeedbackService {
  private audioCtx: AudioContext | null = null;
  private hapticsEnabled: boolean = true;
  private audioClicksEnabled: boolean = true;

  constructor() {
    try {
      const storedHaptics = localStorage.getItem('rise_haptics_enabled');
      if (storedHaptics !== null) {
        this.hapticsEnabled = storedHaptics === 'true';
      }
      const storedAudio = localStorage.getItem('rise_audio_clicks_enabled');
      if (storedAudio !== null) {
        this.audioClicksEnabled = storedAudio === 'true';
      }
    } catch {}
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.audioCtx = new AudioCtx();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  public isHapticsEnabled(): boolean {
    return this.hapticsEnabled;
  }

  public setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
    try {
      localStorage.setItem('rise_haptics_enabled', String(enabled));
    } catch {}
  }

  public isAudioClicksEnabled(): boolean {
    return this.audioClicksEnabled;
  }

  public setAudioClicksEnabled(enabled: boolean): void {
    this.audioClicksEnabled = enabled;
    try {
      localStorage.setItem('rise_audio_clicks_enabled', String(enabled));
    } catch {}
  }

  private vibrate(pattern: number | number[]): void {
    if (!this.hapticsEnabled) return;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  /**
   * Generates an ultra-crisp, physical mechanical micro-tick
   * reminiscent of a luxury camera dial or Apple Watch crown.
   */
  private playMicroTick(frequency: number = 2200, duration: number = 0.007, gainLevel: number = 0.035): void {
    if (!this.audioClicksEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.exponentialRampToValueAtTime(frequency * 0.4, now + duration);

      gain.gain.setValueAtTime(gainLevel, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch {}
  }

  /**
   * Subtle soft pop sound for toggle switches and selections
   */
  private playPopSound(freq: number = 580): void {
    if (!this.audioClicksEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.025);

      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.03);
    } catch {}
  }

  /**
   * Extremely light tick for scrolling dials, wheel detents, number changes.
   */
  public tick(): void {
    this.vibrate(4);
    this.playMicroTick(2400, 0.006, 0.028);
  }

  /**
   * Selection feedback for day chips, segmented tabs, switch toggles.
   */
  public selection(): void {
    this.vibrate(8);
    this.playPopSound(620);
  }

  /**
   * Light button press, card tap, navigation tap.
   */
  public light(): void {
    this.vibrate(10);
    this.playMicroTick(1800, 0.01, 0.03);
  }

  /**
   * Medium action feedback: alarm save, challenge select, primary buttons.
   */
  public medium(): void {
    this.vibrate(18);
    this.playPopSound(740);
  }

  /**
   * Heavy feedback: delete, modal close, long press trigger.
   */
  public heavy(): void {
    this.vibrate(32);
    this.playPopSound(420);
  }

  /**
   * Success sequence: alarm saved, wake-up task completed.
   */
  public success(): void {
    this.vibrate([10, 40, 20]);
    const ctx = this.getAudioContext();
    if (ctx && this.audioClicksEnabled) {
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now); // E5
        osc.frequency.setValueAtTime(880, now + 0.07); // A5
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
      } catch {}
    }
  }

  /**
   * Warning feedback: unsaved changes, background reliability warning.
   */
  public warning(): void {
    this.vibrate([18, 50, 18]);
  }

  /**
   * Error buzz: invalid action, deletion.
   */
  public error(): void {
    this.vibrate([28, 40, 28, 40, 40]);
  }
}

export const Haptics = new HapticFeedbackService();

