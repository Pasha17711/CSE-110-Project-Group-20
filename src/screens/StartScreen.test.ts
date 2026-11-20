import { describe, it, expect, vi } from "vitest";

vi.mock("konva", () => import("./testing/fakeKonva"));

import { StartScreen } from "./StartScreen";
import { Difficulty, Leaderboard, MemoryLeaderboardStore, formatTime } from "../score";
import { visibleTexts } from "./testing/fakeKonva";

function click(screen: StartScreen, name: string): void {
  screen.layer.findOne(`.${name}`)!.fire("click");
}

/** Lets the leaderboard's pending loads finish. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("StartScreen", () => {
  it("shows the primary menu buttons initially and reveals difficulties when PLAY is clicked", () => {
    const screen = new StartScreen(1440, 900);

    expect(visibleTexts(screen.layer)).toEqual(
      expect.arrayContaining(["PLAY", "TUTORIAL", "SETTINGS", "Credits  >"]),
    );
    expect(visibleTexts(screen.layer)).not.toEqual(
      expect.arrayContaining(["EASY", "MEDIUM", "HARD"]),
    );

    click(screen, "play-button");

    expect(visibleTexts(screen.layer)).toEqual(
      expect.arrayContaining(["EASY", "MEDIUM", "HARD"]),
    );
    expect(visibleTexts(screen.layer)).not.toEqual(
      expect.arrayContaining(["PLAY", "TUTORIAL", "SETTINGS"]),
    );
  });

  it.each([
    ["difficulty-easy", Difficulty.Easy],
    ["difficulty-medium", Difficulty.Medium],
    ["difficulty-hard", Difficulty.Hard],
  ])("clicking %s starts the Heist at that Difficulty", (name, difficulty) => {
    const screen = new StartScreen(1440, 900);
    const onStart = vi.fn();
    screen.onStart(onStart);

    click(screen, name);

    expect(onStart).toHaveBeenCalledExactlyOnceWith(difficulty);
  });

  it("returns to the primary menu when clicking Back from difficulty selection", () => {
    const screen = new StartScreen(1440, 900);

    click(screen, "play-button");
    expect(visibleTexts(screen.layer)).toEqual(
      expect.arrayContaining(["EASY", "MEDIUM", "HARD"]),
    );

    click(screen, "difficulty-back");
    expect(visibleTexts(screen.layer)).toEqual(
      expect.arrayContaining(["PLAY", "TUTORIAL", "SETTINGS"]),
    );
    expect(visibleTexts(screen.layer)).not.toEqual(
      expect.arrayContaining(["EASY", "MEDIUM", "HARD"]),
    );
  });

  it("emits events for secondary menu buttons (Tutorial, Settings, Leaderboard, Credits)", () => {
    const screen = new StartScreen(1440, 900);
    const onTutorial = vi.fn();
    const onSettings = vi.fn();
    const onLeaderboard = vi.fn();
    const onCredits = vi.fn();

    screen.onTutorial(onTutorial);
    screen.onSettings(onSettings);
    screen.onLeaderboard(onLeaderboard);
    screen.onCredits(onCredits);

    click(screen, "tutorial-button");
    click(screen, "settings-button");
    click(screen, "trophy-button");
    click(screen, "credits-button");

    expect(onTutorial).toHaveBeenCalledOnce();
    expect(onSettings).toHaveBeenCalledOnce();
    expect(onLeaderboard).toHaveBeenCalledOnce();
    expect(onCredits).toHaveBeenCalledOnce();
  });

  it("opens the High Scores modal on trophy click, switches difficulty tabs, and closes cleanly", async () => {
    const store = new MemoryLeaderboardStore({ playerId: "alice" });
    const board = new Leaderboard(store);
    await board.addEntry({
      playerName: "Alice",
      difficulty: Difficulty.Easy,
      score: 14000,
      timeSpentMs: 95_000,
    });
    store.setPlayer("bob");
    await board.addEntry({
      playerName: "Bob",
      difficulty: Difficulty.Hard,
      score: 21500,
      timeSpentMs: 185_000,
    });

    const screen = new StartScreen(1440, 900, board);

    // Modal is hidden initially
    expect(visibleTexts(screen.layer)).not.toContain("🏆 HIGH SCORES");

    // Open modal -> defaults to Easy tab
    click(screen, "trophy-button");
    await flush();
    expect(visibleTexts(screen.layer)).toEqual(
      expect.arrayContaining(["🏆 HIGH SCORES", "#1  Alice", `14,000  (${formatTime(95_000)})`]),
    );

    // Switch to Medium tab (empty state)
    click(screen, "leaderboard-tab-medium");
    await flush();
    expect(visibleTexts(screen.layer)).toContain(
      "No Medium scores recorded yet.\nComplete a heist to claim #1!",
    );

    // Switch to Hard tab
    click(screen, "leaderboard-tab-hard");
    await flush();
    expect(visibleTexts(screen.layer)).toEqual(
      expect.arrayContaining(["#1  Bob", `21,500  (${formatTime(185_000)})`]),
    );

    // Close modal
    click(screen, "close-leaderboard");
    expect(visibleTexts(screen.layer)).not.toContain("🏆 HIGH SCORES");
  });

  it("ignores a board that finishes loading after another tab was picked", async () => {
    const store = new MemoryLeaderboardStore({ playerId: "p" });
    store.seed({ playerId: "p", playerName: "EasyPlayer", difficulty: Difficulty.Easy, score: 1, timeSpentMs: 1 });
    // Hold the Easy load until after the Medium one has finished.
    let releaseEasy!: () => void;
    const easyGate = new Promise<void>((resolve) => { releaseEasy = resolve; });
    const fetchTop = store.fetchTop.bind(store);
    store.fetchTop = async (difficulty, limit) => {
      if (difficulty === Difficulty.Easy) await easyGate;
      return fetchTop(difficulty, limit);
    };
    const screen = new StartScreen(1440, 900, new Leaderboard(store));

    click(screen, "trophy-button");
    click(screen, "leaderboard-tab-medium");
    await flush();
    releaseEasy();
    await flush();

    expect(visibleTexts(screen.layer)).not.toContain("#1  EasyPlayer");
    expect(visibleTexts(screen.layer)).toContain("No Medium scores recorded yet.\nComplete a heist to claim #1!");
  });

  it("shows the empty board when the leaderboard can't load", async () => {
    const store = new MemoryLeaderboardStore({ playerId: "p" });
    store.failNext("fetchTop");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const screen = new StartScreen(1440, 900, new Leaderboard(store));

    click(screen, "trophy-button");
    await flush();

    expect(visibleTexts(screen.layer)).toContain("No Easy scores recorded yet.\nComplete a heist to claim #1!");
    errorSpy.mockRestore();
  });

  it("show() and hide() toggle its layer and reset both the difficulty sub-menu and modal", () => {
    const board = new Leaderboard(new MemoryLeaderboardStore({ playerId: "p" }));
    const screen = new StartScreen(1440, 900, board);

    click(screen, "trophy-button");
    expect(visibleTexts(screen.layer)).toContain("🏆 HIGH SCORES");

    screen.hide();
    expect(screen.layer.visible()).toBe(false);
    screen.show();
    expect(screen.layer.visible()).toBe(true);
    expect(visibleTexts(screen.layer)).not.toContain("🏆 HIGH SCORES");
    expect(visibleTexts(screen.layer)).toEqual(
      expect.arrayContaining(["PLAY", "TUTORIAL", "SETTINGS"]),
    );
  });

  it("stops calling a callback once unsubscribed", () => {
    const screen = new StartScreen(1440, 900);
    const onStart = vi.fn();
    const unsubscribe = screen.onStart(onStart);

    unsubscribe();
    click(screen, "play-button");
    click(screen, "difficulty-easy");

    expect(onStart).not.toHaveBeenCalled();
  });

  it("adds its layer to no Stage itself", () => {
    const screen = new StartScreen(1440, 900);

    expect(screen.layer.getStage()).toBeNull();
  });
});
