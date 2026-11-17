import type { NotificationManager } from "../notification-manager/NotificationManager";
import { EventType } from "../notification-manager/GameEvent";

/**
 * Small synthesized sound effects, without external audio files or licensing.
 * Subscribes to the game's existing NotificationManager, so screens and
 * controllers do not need to know anything about sound playback.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private readonly unsubscribers: Array<() => void> = [];
  private muted = false;

  constructor(notifications: NotificationManager) {
    this.unsubscribers.push(
      notifications.subscribe(EventType.Correct, () => this.tone(740, 0.12)),
      notifications.subscribe(EventType.Incorrect, () => this.tone(210, 0.24, "sawtooth")),
      notifications.subscribe(EventType.RoomSolved, () => this.tone(980, 0.22)),
      notifications.subscribe(EventType.HintUsed, () => this.tone(540, 0.10, "triangle")),
      notifications.subscribe(EventType.GameOver, () => this.tone(520, 0.38, "triangle")),
    );
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  dispose(): void {
    this.unsubscribers.splice(0).forEach((stop) => stop());
    const context = this.context;
    this.context = null;
    if (context) void context.close().catch(() => {});
  }

  private tone(frequency: number, duration: number, waveform: OscillatorType = "sine"): void {
    if (this.muted || typeof AudioContext === "undefined") return;
    try {
      const ctx = this.context ?? new AudioContext();
      this.context = ctx;
      // Browsers often suspend audio until the player interacts with the page.
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const oscillator = ctx.createOscillator();
      const volume = ctx.createGain();
      const start = ctx.currentTime;
      oscillator.type = waveform;
      oscillator.frequency.setValueAtTime(frequency, start);
      volume.gain.setValueAtTime(0.0001, start);
      volume.gain.exponentialRampToValueAtTime(0.08, start + 0.018);
      volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(volume);
      volume.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    } catch {
      // Unsupported or restricted audio must never interrupt gameplay.
    }
  }
}
