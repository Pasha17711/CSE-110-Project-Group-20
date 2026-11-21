import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("konva", () => import("./testing/fakeKonva"));

import type Konva from "konva";
import { Hud, HUD_BAR_WIDTH } from "./Hud";
import { COLORS } from "./theme";
import { formatMoney, formatTime, WRONG_ANSWER_PENALTY_SECONDS } from "../score";

const HOUR = 60 * 60 * 1000;

function parts(hud: Hud) {
  const barGroup = hud.findOne<Konva.Group>(".hud-bar")!;
  return {
    money: hud.findOne<Konva.Text>(".hud-money")!.text(),
    timeNode: hud.findOne<Konva.Text>(".hud-time")!,
    time: hud.findOne<Konva.Text>(".hud-time")!.text(),
    bar: hud.findOne<Konva.Group>(".hud-bar")!.clipWidth(),
    barFill: barGroup.findOne<Konva.Rect>("Rect")!,
    barOutline: hud.findOne<Konva.Rect>(".hud-bar-outline")!,
    penalty: hud.findOne<Konva.Text>(".hud-penalty")!,
  };
}

describe("Hud", () => {
  it("shows the time with formatTime and the money with formatMoney", () => {
    const hud = new Hud();

    hud.setHud(HOUR - 5000, HOUR, 1800);

    expect(parts(hud).time).toBe(formatTime(HOUR - 5000));
    expect(parts(hud).money).toBe(formatMoney(1800));
  });

  it("sizes the bar by the remaining / limit ratio", () => {
    const hud = new Hud();

    hud.setHud(HOUR / 4, HOUR, 0);

    expect(parts(hud).bar).toBe(HUD_BAR_WIDTH / 4);
  });

  it("clamps the bar between empty and full", () => {
    const hud = new Hud();

    hud.setHud(2 * HOUR, HOUR, 0);
    expect(parts(hud).bar).toBe(HUD_BAR_WIDTH);

    hud.setHud(-1000, HOUR, 0);
    expect(parts(hud).bar).toBe(0);

    hud.setHud(1000, 0, 0);
    expect(parts(hud).bar).toBe(0);
  });

  it("colors the bar and time text based on percentage thresholds (>=50% green, <50% amber, <20% red)", () => {
    const hud = new Hud();
    const { barFill, timeNode } = parts(hud);

    // At 50% remaining: green bar, white text
    hud.setHud(HOUR * 0.5, HOUR, 0);
    expect(barFill.fill()).toBe(COLORS.green);
    expect(timeNode.fill()).toBe(COLORS.white);

    // Below 50% (e.g., 49%): amber warning color
    hud.setHud(HOUR * 0.49, HOUR, 0);
    expect(barFill.fill()).toBe("#f59e0b");
    expect(timeNode.fill()).toBe("#f59e0b");

    // Below 20% (e.g., 19%): critical red color
    hud.setHud(HOUR * 0.19, HOUR, 0);
    expect(barFill.fill()).toBe(COLORS.red);
    expect(timeNode.fill()).toBe(COLORS.red);
  });

  it("flashes the penalty badge, timer text, and bar outline red on showPenalty() and resets after timeout", () => {
    vi.useFakeTimers();
    const hud = new Hud();
    hud.setHud(HOUR * 0.8, HOUR, 0);

    const { penalty, timeNode, barOutline } = parts(hud);
    expect(penalty.visible()).toBe(false);
    expect(barOutline.stroke()).toBe("black");

    hud.showPenalty();

    expect(penalty.visible()).toBe(true);
    expect(penalty.text()).toBe(`-${WRONG_ANSWER_PENALTY_SECONDS}s`);
    expect(timeNode.fill()).toBe(COLORS.red);
    expect(barOutline.stroke()).toBe(COLORS.red);
    expect(barOutline.strokeWidth()).toBe(5);

    vi.advanceTimersByTime(900);

    expect(penalty.visible()).toBe(false);
    expect(timeNode.fill()).toBe(COLORS.white);
    expect(barOutline.stroke()).toBe("black");
    expect(barOutline.strokeWidth()).toBe(3);
  });

  it("does not trigger a false penalty flash when time drops by 60s+ without showPenalty()", () => {
    const hud = new Hud();
    hud.setHud(HOUR, HOUR, 0);

    // Simulate a throttled background tab catch-up of 2 minutes
    hud.setHud(HOUR - 120_000, HOUR, 0);

    const { penalty, barOutline } = parts(hud);
    expect(penalty.visible()).toBe(false);
    expect(barOutline.stroke()).toBe("black");
  });
});
