import { describe, expect, it, vi } from "vitest";
import { NotificationManager } from "../notification-manager/NotificationManager";
import { EventType } from "../notification-manager/GameEvent";
import { AudioManager } from "./AudioManager";

describe("AudioManager", () => {
  it("allows all gameplay events without Web Audio and supports mute", () => {
    const manager = new NotificationManager();
    const audio = new AudioManager(manager);
    expect(audio.isMuted()).toBe(false);
    audio.setMuted(true);
    expect(audio.isMuted()).toBe(true);
    for (const eventType of [EventType.Correct, EventType.Incorrect, EventType.GameOver]) {
      expect(() => manager.send({ eventType })).not.toThrow();
    }
    expect(() => manager.send({ eventType: EventType.RoomSolved, roomKind: "main" })).not.toThrow();
    expect(() => manager.send({ eventType: EventType.HintUsed, roomId: "room_a" })).not.toThrow();
    audio.dispose();
  });

  it("does not open a new audio context after dispose", () => {
    const manager = new NotificationManager();
    const audio = new AudioManager(manager);
    const context = vi.fn();
    vi.stubGlobal("AudioContext", context);
    audio.dispose();
    manager.send({ eventType: EventType.Correct });
    expect(context).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});