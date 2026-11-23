import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { connectEndScreenLeaderboard, PLAYER_NAME_KEY, type NameStorage } from "./endScreenLeaderboard";
import { Difficulty, Leaderboard, MemoryLeaderboardStore, type AddEntryResult, type LoadResult, type ScoreSnapshot } from "./score";
import type { EndScreen } from "./screens/contracts";
import type { HeistResult } from "./game/Game";

/** Records what the wiring tells the End Screen, and lets tests press Save. */
class FakeEndScreen implements EndScreen {
  readonly layer = {} as EndScreen["layer"];
  results: HeistResult[] = [];
  boards: LoadResult[] = [];
  saveResults: AddEntryResult[] = [];
  suggestedNames: string[] = [];
  private saveCallback: ((playerName: string) => void) | null = null;

  setResult(result: HeistResult): void {
    this.results.push(result);
  }
  setLeaderboard(board: LoadResult): void {
    this.boards.push(board);
  }
  suggestName(name: string): void {
    this.suggestedNames.push(name);
  }
  onSaveScore(cb: (playerName: string) => void) {
    this.saveCallback = cb;
    return () => {};
  }
  showSaveResult(result: AddEntryResult): void {
    this.saveResults.push(result);
  }
  onPlayAgain() {
    return () => {};
  }
  onBackToStart() {
    return () => {};
  }
  show(): void {}
  hide(): void {}

  save(playerName: string): void {
    this.saveCallback?.(playerName);
  }

  lastBoardNames(): string[] {
    const board = this.boards.at(-1);
    return board?.status === "loaded" ? board.entries.map((e) => e.playerName) : [];
  }
}

function snapshot(overrides: Partial<ScoreSnapshot> = {}): ScoreSnapshot {
  return {
    difficulty: Difficulty.Medium,
    money: 1200,
    roomsSolved: 2,
    bonusRoomsSolved: 1,
    weightedCorrect: 4,
    incorrectAnswers: 0,
    timeLimitMs: 3_600_000,
    timeRemainingMs: 3_535_000,
    timeSpentMs: 65_000,
    caught: false,
    flawless: true,
    score: 5_000,
    ...overrides,
  };
}

function escaped(overrides: Partial<ScoreSnapshot> = {}): HeistResult {
  return { outcome: "escaped", snapshot: snapshot(overrides), history: [] };
}

function caught(): HeistResult {
  return { outcome: "caught", snapshot: snapshot({ caught: true, score: 0 }), history: [] };
}

/** Lets pending loads and saves finish. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A promise the test resolves by hand, to hold a store call open. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => { open = resolve; });
  return { wait, open };
}

class MemoryStorage implements NameStorage {
  values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("connectEndScreenLeaderboard", () => {
  let store: MemoryLeaderboardStore;
  let endScreen: FakeEndScreen;
  let storage: MemoryStorage;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  function connect(nameStorage: NameStorage | null = storage) {
    return connectEndScreenLeaderboard(endScreen, new Leaderboard(store), nameStorage);
  }

  beforeEach(() => {
    store = new MemoryLeaderboardStore({ playerId: "me" });
    endScreen = new FakeEndScreen();
    storage = new MemoryStorage();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe("loading the board", () => {
    it("shows the result right away, then the board for its Difficulty", async () => {
      store.seed({ playerId: "ana", playerName: "Ana", difficulty: Difficulty.Medium, score: 900, timeSpentMs: 1 });
      store.seed({ playerId: "bo", playerName: "Bo", difficulty: Difficulty.Hard, score: 900, timeSpentMs: 1 });
      const result = escaped();

      connect().showResult(result);
      expect(endScreen.results).toEqual([result]);
      expect(endScreen.boards).toEqual([]);

      await flush();
      expect(endScreen.lastBoardNames()).toEqual(["Ana"]);
    });

    it("passes a failed load on to the End Screen", async () => {
      store.failNext("fetchTop");

      connect().showResult(escaped());
      await flush();

      expect(endScreen.boards).toEqual([{ status: "loadFailed" }]);
    });

    it("drops a board that arrives after the next Heist ended", async () => {
      const held = gate();
      const fetchTop = store.fetchTop.bind(store);
      let calls = 0;
      store.fetchTop = async (difficulty, limit) => {
        if (calls++ === 0) await held.wait;
        return fetchTop(difficulty, limit);
      };
      const wiring = connect();

      wiring.showResult(escaped({ difficulty: Difficulty.Easy }));
      wiring.showResult(escaped({ difficulty: Difficulty.Hard }));
      await flush();
      held.open();
      await flush();

      expect(endScreen.boards).toHaveLength(1);
    });

    it("of two loads for the same Heist, shows only the newer one", async () => {
      const result = escaped();
      const held = gate();
      const fetchTop = store.fetchTop.bind(store);
      let calls = 0;
      store.fetchTop = async (difficulty, limit) => {
        if (calls++ === 0) await held.wait; // the first load (before the save) is slow
        return fetchTop(difficulty, limit);
      };
      connect().showResult(result);

      endScreen.save("Me");
      await flush();
      held.open();
      await flush();

      expect(endScreen.boards).toHaveLength(1);
      expect(endScreen.lastBoardNames()).toEqual(["Me"]);
    });
  });

  describe("saving", () => {
    it("saves the result's Difficulty, score and time, shows how it went, then reloads the board", async () => {
      const result = escaped({ difficulty: Difficulty.Hard, score: 4321, timeSpentMs: 99_000 });
      connect().showResult(result);
      await flush();

      endScreen.save("Me");
      await flush();

      expect(endScreen.saveResults).toEqual([
        expect.objectContaining({ status: "saved", rank: 1, isNewBest: true }),
      ]);
      const board = endScreen.boards.at(-1);
      expect(board).toEqual({
        status: "loaded",
        entries: [expect.objectContaining({ playerName: "Me", difficulty: Difficulty.Hard, score: 4321, timeSpentMs: 99_000, isMine: true })],
      });
    });

    it("saves only once, even when Save is pressed again before the first save finishes", async () => {
      const insert = vi.spyOn(store, "insert");
      connect().showResult(escaped());

      endScreen.save("Me");
      endScreen.save("Me");
      await flush();
      endScreen.save("Me");
      await flush();

      expect(insert).toHaveBeenCalledOnce();
      expect(endScreen.saveResults).toHaveLength(1);
    });

    it("doesn't save a Caught Heist", async () => {
      const insert = vi.spyOn(store, "insert");
      connect().showResult(caught());

      endScreen.save("Me");
      await flush();

      expect(insert).not.toHaveBeenCalled();
      expect(endScreen.saveResults).toEqual([]);
    });

    it("lets the player try again after a failed save", async () => {
      const insert = vi.spyOn(store, "insert");
      store.failNext("insert");
      connect().showResult(escaped());
      await flush();
      const boardsBefore = endScreen.boards.length;

      endScreen.save("Me");
      await flush();
      expect(endScreen.saveResults).toEqual([{ status: "saveFailed" }]);
      expect(endScreen.boards).toHaveLength(boardsBefore); // nothing new to show

      endScreen.save("Me");
      await flush();
      expect(insert).toHaveBeenCalledTimes(2);
      expect(endScreen.saveResults[1]).toEqual(expect.objectContaining({ status: "saved" }));
    });

    it("allows a new save for each new Heist", async () => {
      const insert = vi.spyOn(store, "insert");
      const wiring = connect();

      wiring.showResult(escaped());
      endScreen.save("Me");
      await flush();
      wiring.showResult(escaped({ score: 9000 }));
      endScreen.save("Me");
      await flush();

      expect(insert).toHaveBeenCalledTimes(2);
    });

    it("doesn't show a save result once the next Heist has ended", async () => {
      const held = gate();
      const insert = store.insert.bind(store);
      store.insert = async (entry) => {
        await held.wait;
        return insert(entry);
      };
      const wiring = connect();

      wiring.showResult(escaped());
      endScreen.save("Me");
      wiring.showResult(escaped({ score: 1 }));
      held.open();
      await flush();

      expect(endScreen.saveResults).toEqual([]);
    });
  });

  describe("the remembered name", () => {
    it("suggests the last saved name at startup", () => {
      storage.setItem(PLAYER_NAME_KEY, "Ana");

      connect();

      expect(endScreen.suggestedNames).toEqual(["Ana"]);
    });

    it("suggests nothing when no name was saved", () => {
      connect();

      expect(endScreen.suggestedNames).toEqual([]);
    });

    it("remembers the name after a save, but not after a failed one", async () => {
      store.failNext("insert");
      connect().showResult(escaped());

      endScreen.save("Ana");
      await flush();
      expect(storage.getItem(PLAYER_NAME_KEY)).toBeNull();

      endScreen.save("Bo");
      await flush();
      expect(storage.getItem(PLAYER_NAME_KEY)).toBe("Bo");
      expect(endScreen.suggestedNames).toEqual(["Bo"]);
    });

    it("still saves when storage is blocked or missing", async () => {
      const blocked: NameStorage = {
        getItem: () => { throw new Error("blocked"); },
        setItem: () => { throw new Error("blocked"); },
      };
      for (const nameStorage of [blocked, null]) {
        endScreen = new FakeEndScreen();
        connect(nameStorage).showResult(escaped());

        endScreen.save("Ana");
        await flush();

        expect(endScreen.saveResults.at(-1)).toEqual(expect.objectContaining({ status: "saved" }));
        expect(endScreen.suggestedNames).toEqual(["Ana"]);
      }
    });
  });
});
