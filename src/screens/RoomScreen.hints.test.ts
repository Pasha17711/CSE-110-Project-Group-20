import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("konva", () => import("./testing/fakeKonva"));
vi.mock("../puzzles/basic-multistep-puzzle", () => import("./testing/fakePuzzle"));

import { RoomScreen } from "./RoomScreen";
import { NotificationManager } from "../notification-manager/NotificationManager";
import type Konva from "konva";

const question = { prompt: "x / 3 = 5", answer: "15" };

describe("RoomScreen hint modal", () => {
  let screen: RoomScreen;
  beforeEach(() => {
    vi.useFakeTimers();
    screen = new RoomScreen(1440, 900, new NotificationManager());
    screen.setQuestion(question, "Room A");
  });
  afterEach(() => vi.useRealTimers());

  function clickHint(): void {
    screen.layer.findOne(".hint-button")!.fire("click");
  }
  function closeHint(): void {
    screen.layer.findOne(".hint-back")!.fire("click");
  }

  it("opens the Figma-inspired modal and emits the hint request", () => {
    const requested = vi.fn();
    screen.onHint(requested);
    clickHint();
    expect(screen.layer.findOne(".hint-modal")!.visible()).toBe(true);
    expect((screen.layer.findOne(".hint-message")! as Konva.Text).text()).toContain("multiply");
    expect(requested).toHaveBeenCalledOnce();
    closeHint();
    expect(screen.layer.findOne(".hint-modal")!.visible()).toBe(false);
  });

  it("limits hints to two, including after re-entering a room", () => {
    const requested = vi.fn();
    screen.onHint(requested);
    clickHint(); closeHint();
    clickHint(); closeHint();
    clickHint();
    expect(requested).toHaveBeenCalledTimes(2);
    expect((screen.layer.findOne(".hint-message")! as Konva.Text).text()).toContain("both hints");
    screen.setQuestion(question, "Room A", 2);
    closeHint();
    clickHint();
    expect(requested).toHaveBeenCalledTimes(2);
  });

  it("closes the modal when the room is hidden", () => {
    clickHint();
    screen.hide();
    expect(screen.layer.findOne(".hint-modal")!.visible()).toBe(false);
  });
});