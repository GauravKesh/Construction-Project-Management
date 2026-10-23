"use client";

export type NotificationSoundType = "critical" | "warning" | "info" | "success";

const STORAGE_KEY_ENABLED = "buildtrack_audio_enabled";
const STORAGE_KEY_VOLUME = "buildtrack_audio_volume";

class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.7; // 0.0 to 1.0
  private lastViolationSoundTime: number = 0;

  constructor() {
    if (typeof window !== "undefined") {
      const storedEnabled = localStorage.getItem(STORAGE_KEY_ENABLED);
      if (storedEnabled !== null) {
        this.enabled = storedEnabled === "true";
      }

      const storedVol = localStorage.getItem(STORAGE_KEY_VOLUME);
      if (storedVol !== null) {
        const parsed = parseFloat(storedVol);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          this.volume = parsed;
        }
      }

      // Auto-unlock AudioContext on first user interaction
      const unlock = () => {
        if (this.ctx && this.ctx.state === "suspended") {
          this.ctx.resume().catch(() => {});
        }
        window.removeEventListener("click", unlock);
        window.removeEventListener("keydown", unlock);
        window.removeEventListener("touchstart", unlock);
      };
      window.addEventListener("click", unlock, { passive: true });
      window.addEventListener("keydown", unlock, { passive: true });
      window.addEventListener("touchstart", unlock, { passive: true });
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_ENABLED, String(enabled));
      window.dispatchEvent(new CustomEvent("buildtrack:audio_settings_changed", { detail: { enabled } }));
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_VOLUME, String(this.volume));
      window.dispatchEvent(new CustomEvent("buildtrack:audio_settings_changed", { detail: { volume: this.volume } }));
    }
  }

  /**
   * Play synthesized distinctive sound effect for the given notification type.
   */
  public play(type: NotificationSoundType, force: boolean = false): void {
    if (!this.enabled && !force) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      switch (type) {
        case "critical":
          this.playCriticalAlarm(ctx);
          break;
        case "warning":
          this.playWarningChime(ctx);
          break;
        case "info":
          this.playInfoPing(ctx);
          break;
        case "success":
          this.playSuccessChime(ctx);
          break;
      }
    } catch (e) {
      console.warn("Failed to play notification audio:", e);
    }
  }

  /**
   * Throttled play for high-frequency events like CV live detection violations
   */
  public playViolationWarning(): void {
    const now = Date.now();
    // Throttle to at most once every 6 seconds to prevent sound fatigue
    if (now - this.lastViolationSoundTime > 6000) {
      this.lastViolationSoundTime = now;
      this.play("warning");
    }
  }

  /**
   * 🚨 Critical: Urgent dual-tone pulsating siren (880Hz -> 660Hz rapid pulses)
   */
  private playCriticalAlarm(ctx: AudioContext): void {
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.volume * 0.9, ctx.currentTime);
    masterGain.connect(ctx.destination);

    const now = ctx.currentTime;
    // 3 rapid alternating bursts: High - Low - High
    const pulses = [
      { start: 0.0, freq: 880, dur: 0.12 },
      { start: 0.15, freq: 659.25, dur: 0.12 },
      { start: 0.30, freq: 880, dur: 0.18 },
    ];

    pulses.forEach(({ start, freq, dur }) => {
      // Sawtooth for piercing industrial presence
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.7, now + start + 0.02);
      gain.gain.setValueAtTime(0.7, now + start + dur - 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now + start);
      osc.stop(now + start + dur);
    });
  }

  /**
   * ⚠️ Warning: Sharp dual-tone cautionary chime (440Hz -> 587Hz)
   */
  private playWarningChime(ctx: AudioContext): void {
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.volume * 0.75, ctx.currentTime);
    masterGain.connect(ctx.destination);

    const now = ctx.currentTime;
    const tones = [
      { start: 0.0, freq: 440, dur: 0.14 },
      { start: 0.15, freq: 587.33, dur: 0.26 },
    ];

    tones.forEach(({ start, freq, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.65, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now + start);
      osc.stop(now + start + dur);
    });
  }

  /**
   * ℹ️ Info: Soft modern bubble chime (523Hz -> 659Hz smooth sine drop)
   */
  private playInfoPing(ctx: AudioContext): void {
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.volume * 0.6, ctx.currentTime);
    masterGain.connect(ctx.destination);

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.25);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * ✅ Success: Ascending melodic triad arpeggio (C5 -> E5 -> G5)
   */
  private playSuccessChime(ctx: AudioContext): void {
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.volume * 0.7, ctx.currentTime);
    masterGain.connect(ctx.destination);

    const now = ctx.currentTime;
    const chord = [
      { start: 0.0, freq: 523.25, dur: 0.12 }, // C5
      { start: 0.08, freq: 659.25, dur: 0.14 }, // E5
      { start: 0.16, freq: 783.99, dur: 0.38 }, // G5
    ];

    chord.forEach(({ start, freq, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.6, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now + start);
      osc.stop(now + start + dur);
    });
  }
}

export const soundManager = new SoundManager();

export function playNotificationSound(type: NotificationSoundType, force: boolean = false): void {
  soundManager.play(type, force);
}
