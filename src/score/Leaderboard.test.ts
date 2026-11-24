import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { Leaderboard, compareEntries, LEADERBOARD_SIZE, PLAYER_NAME_MAX_LENGTH, type LeaderboardEntry } from "./Leaderboard";
import { MemoryLeaderboardStore, UnavailableLeaderboardStore } from "./LeaderboardStore";
import { Difficulty } from "./ScoreModel";

const ME = "me";

function run(score: number, timeSpentMs = 1000, playerName = "P", difficulty: Difficulty = Difficulty.Easy) {
  return { playerName, difficulty, score, timeSpentMs };
}

function names(entries: LeaderboardEntry[]): string[] {
  return entries.map((e) => e.playerName);
}

async function loaded(board: Leaderboard, difficulty: Difficulty = Difficulty.Easy): Promise<LeaderboardEntry[]> {
  const result = await board.getEntries(difficulty);
  if (result.status !== "loaded") throw new Error(`expected loaded, got ${result.status}`);
  return result.entries;
}

describe("Leaderboard", () => {
  let store: MemoryLeaderboardStore;
  let board: Leaderboard;
  let errorSpy: MockInstance;

  beforeEach(() => {
    store = new MemoryLeaderboardStore({ playerId: ME });
    board = new Leaderboard(store, 3);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe("getEntries", () => {
    it("is empty at first, without logging", async () => {
      expect(await loaded(board)).toEqual([]);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("orders by highest score, then faster time, then earlier save", async () => {
      store.seed(
        { playerId: "a", playerName: "A", difficulty: Difficulty.Easy, score: 100, timeSpentMs: 5000 },
        { playerId: "b", playerName: "B", difficulty: Difficulty.Easy, score: 300, timeSpentMs: 9000 },
        { playerId: "c", playerName: "C", difficulty: Difficulty.Easy, score: 100, timeSpentMs: 2000 },
        { playerId: "d", playerName: "D", difficulty: Difficulty.Easy, score: 100, timeSpentMs: 2000 },
      );
      expect(names(await loaded(new Leaderboard(store)))).toEqual(["B", "C", "D", "A"]);
    });

    it("shows at most its size", async () => {
      for (let i = 0; i < 5; i++) store.seed({ playerId: `p${i}`, difficulty: Difficulty.Easy, score: i, timeSpentMs: 1 });
      expect(await loaded(board)).toHaveLength(3);
      expect(await loaded(new Leaderboard(store))).toHaveLength(5);
    });

    it("defaults to LEADERBOARD_SIZE rows", async () => {
      for (let i = 0; i < LEADERBOARD_SIZE + 2; i++) store.seed({ playerId: `p${i}`, difficulty: Difficulty.Easy, score: i, timeSpentMs: 1 });
      expect(await loaded(new Leaderboard(store))).toHaveLength(LEADERBOARD_SIZE);
    });

    it("keeps each Difficulty separate", async () => {
      store.seed(
        { playerId: "a", playerName: "E1", difficulty: Difficulty.Easy, score: 900, timeSpentMs: 1 },
        { playerId: "a", playerName: "H1", difficulty: Difficulty.Hard, score: 100, timeSpentMs: 1 },
      );
      expect(names(await loaded(board, Difficulty.Easy))).toEqual(["E1"]);
      expect(names(await loaded(board, Difficulty.Hard))).toEqual(["H1"]);
      expect(await loaded(board, Difficulty.Medium)).toEqual([]);
    });

    it("shows only each Player's Personal Best", async () => {
      await board.addEntry(run(100, 1000, "First"));
      await board.addEntry(run(300, 1000, "Best"));
      await board.addEntry(run(200, 1000, "Third"));
      expect(names(await loaded(board))).toEqual(["Best"]);
    });

    it("marks the current Player's entries with isMine", async () => {
      await board.addEntry(run(100, 1000, "Mine"));
      store.setPlayer("someone-else");
      await board.addEntry(run(200, 1000, "Theirs"));

      expect((await loaded(board)).map((e) => [e.playerName, e.isMine])).toEqual([["Theirs", true], ["Mine", false]]);
      store.setPlayer(ME);
      expect((await loaded(board)).map((e) => [e.playerName, e.isMine])).toEqual([["Theirs", false], ["Mine", true]]);
    });

    it("drops and logs invalid rows but still shows the rest", async () => {
      const good: LeaderboardEntry = { id: "1", playerName: "Good", difficulty: Difficulty.Easy, score: 5, timeSpentMs: 1, date: "2026-11-20T00:00:00Z", isMine: false };
      store.respondNext("fetchTop", [
        good,
        { junk: true },
        { ...good, id: 2 },
        { ...good, id: "3", isMine: "yes" },
        { ...good, id: "4", difficulty: Difficulty.Hard },
        { ...good, id: "5", date: "not a date" },
      ]);
      expect(await loaded(board)).toEqual([good]);
      expect(errorSpy).toHaveBeenCalledOnce();
    });

    it("returns loadFailed (and logs) when the store fails", async () => {
      store.failNext("fetchTop");
      expect(await board.getEntries(Difficulty.Easy)).toEqual({ status: "loadFailed" });
      expect(errorSpy).toHaveBeenCalled();
    });

    it("returns loadFailed when the rows aren't a list", async () => {
      store.respondNext("fetchTop", { not: "a list" });
      expect(await board.getEntries(Difficulty.Easy)).toEqual({ status: "loadFailed" });
    });

    it("returns loadFailed when the online Leaderboard isn't configured", async () => {
      expect(await new Leaderboard(new UnavailableLeaderboardStore()).getEntries(Difficulty.Easy)).toEqual({ status: "loadFailed" });
    });
  });

  describe("getPersonalBest", () => {
    it("is null before any save", async () => {
      expect(await board.getPersonalBest(Difficulty.Easy)).toEqual({ status: "loaded", best: null });
    });

    it("returns the Personal Best and its Rank, even outside the top rows", async () => {
      for (let i = 0; i < 4; i++) store.seed({ playerId: `p${i}`, difficulty: Difficulty.Easy, score: 1000 + i, timeSpentMs: 1 });
      await board.addEntry(run(50, 1000, "Me"));
      await board.addEntry(run(10, 1000, "Me again"));

      const result = await board.getPersonalBest(Difficulty.Easy);
      expect(result).toMatchObject({ status: "loaded", best: { rank: 5, entry: { playerName: "Me", score: 50, isMine: true } } });
    });

    it("returns loadFailed when fetching or counting fails", async () => {
      await board.addEntry(run(50));
      store.failNext("fetchBest");
      expect(await board.getPersonalBest(Difficulty.Easy)).toEqual({ status: "loadFailed" });
      store.failNext("countAhead");
      expect(await board.getPersonalBest(Difficulty.Easy)).toEqual({ status: "loadFailed" });
    });

    it("returns loadFailed for a malformed row or count", async () => {
      store.respondNext("fetchBest", { junk: true });
      expect(await board.getPersonalBest(Difficulty.Easy)).toEqual({ status: "loadFailed" });

      await board.addEntry(run(50));
      store.respondNext("countAhead", -1);
      expect(await board.getPersonalBest(Difficulty.Easy)).toEqual({ status: "loadFailed" });
    });
  });

  describe("addEntry", () => {
    it("saves and returns the Rank of the new Personal Best", async () => {
      expect(await board.addEntry(run(50))).toMatchObject({ status: "saved", rank: 1, isNewBest: true });

      store.setPlayer("b");
      expect(await board.addEntry(run(80))).toMatchObject({ status: "saved", rank: 1, isNewBest: true });

      store.setPlayer("c");
      expect(await board.addEntry(run(60))).toMatchObject({ status: "saved", rank: 2, isNewBest: true });
    });

    it("gives a Rank outside the top rows too", async () => {
      for (let i = 0; i < 12; i++) store.seed({ playerId: `p${i}`, difficulty: Difficulty.Easy, score: 100 + i, timeSpentMs: 1 });
      const result = await board.addEntry(run(5));
      expect(result).toMatchObject({ status: "saved", rank: 13, isNewBest: true });
      expect(names(await loaded(board))).not.toContain("P");
    });

    it("a tie goes to whoever saved first", async () => {
      store.seed({ playerId: "early", difficulty: Difficulty.Easy, score: 50, timeSpentMs: 1000 });
      expect(await board.addEntry(run(50, 1000))).toMatchObject({ status: "saved", rank: 2 });
    });

    it("keeps the old Personal Best when the new run is worse", async () => {
      await board.addEntry(run(300, 1000, "Best"));
      const result = await board.addEntry(run(100, 1000, "Worse"));
      expect(result).toMatchObject({ status: "saved", rank: 1, isNewBest: false, best: { playerName: "Best", score: 300, isMine: true } });
    });

    it("a faster time with the same score is a new Personal Best", async () => {
      await board.addEntry(run(300, 5000, "Slow"));
      expect(await board.addEntry(run(300, 4000, "Fast"))).toMatchObject({ isNewBest: true, best: { playerName: "Fast" } });
    });

    it("returns `best` with the server's id and date", async () => {
      const result = await board.addEntry(run(10));
      expect(result.status).toBe("saved");
      if (result.status !== "saved") return;
      expect(result.best).toEqual({ id: expect.any(String), playerName: "P", difficulty: Difficulty.Easy, score: 10, timeSpentMs: 1000, date: expect.any(String), isMine: true });
    });

    it("returns saveFailed (and logs) when the insert fails, and saves nothing", async () => {
      store.failNext("insert");
      expect(await board.addEntry(run(10))).toEqual({ status: "saveFailed" });
      expect(errorSpy).toHaveBeenCalled();
      expect(await loaded(board)).toEqual([]);
    });

    it("returns saveFailed when the online Leaderboard isn't configured", async () => {
      expect(await new Leaderboard(new UnavailableLeaderboardStore()).addEntry(run(10))).toEqual({ status: "saveFailed" });
    });

    it("returns savedUnranked when the Rank can't be worked out, but keeps the save", async () => {
      store.failNext("fetchBest");
      expect(await board.addEntry(run(10, 1000, "A"))).toEqual({ status: "savedUnranked" });

      store.failNext("countAhead");
      expect(await board.addEntry(run(20, 1000, "B"))).toEqual({ status: "savedUnranked" });

      store.respondNext("fetchBest", { junk: true });
      expect(await board.addEntry(run(30, 1000, "C"))).toEqual({ status: "savedUnranked" });

      store.respondNext("fetchBest", null);
      expect(await board.addEntry(run(40, 1000, "D"))).toEqual({ status: "savedUnranked" });

      expect(names(await loaded(board))).toEqual(["D"]);
    });

    it("uses 'Anonymous' for a blank name", async () => {
      await board.addEntry(run(1, 1, "   "));
      expect(names(await loaded(board))).toEqual(["Anonymous"]);
    });

    it("trims the name and cuts it down to the maximum length", async () => {
      await board.addEntry(run(1, 1, "  Ana  "));
      expect(names(await loaded(board))).toEqual(["Ana"]);

      store.setPlayer("long");
      await board.addEntry(run(2, 1, "x".repeat(PLAYER_NAME_MAX_LENGTH + 5)));
      expect((await loaded(board))[0].playerName).toBe("x".repeat(PLAYER_NAME_MAX_LENGTH));
    });

    it("cuts names by character, not by UTF-16 unit", async () => {
      await board.addEntry(run(1, 1, "😀".repeat(PLAYER_NAME_MAX_LENGTH + 1)));
      expect((await loaded(board))[0].playerName).toBe("😀".repeat(PLAYER_NAME_MAX_LENGTH));
    });

    it("rounds the time to whole milliseconds", async () => {
      await board.addEntry(run(1, 1234.6));
      expect((await loaded(board))[0].timeSpentMs).toBe(1235);
    });

    it("rejects invalid input with a TypeError", async () => {
      await expect(board.addEntry(run(NaN))).rejects.toThrow(TypeError);
      await expect(board.addEntry(run(-1))).rejects.toThrow(TypeError);
      await expect(board.addEntry(run(1, -1))).rejects.toThrow(TypeError);
      await expect(board.addEntry(run(1, Infinity))).rejects.toThrow(TypeError);
      await expect(board.addEntry(run(1, 1, "A", 7 as Difficulty))).rejects.toThrow(TypeError);
      expect(await loaded(board)).toEqual([]);
    });
  });
});

describe("compareEntries", () => {
  const base: LeaderboardEntry = { id: "1", playerName: "A", difficulty: Difficulty.Easy, score: 10, timeSpentMs: 100, date: "2026-11-20T00:00:00.000Z", isMine: false };

  it("puts the higher score, then faster time, then earlier save, then lower id first", () => {
    expect(compareEntries({ ...base, score: 20 }, base)).toBeLessThan(0);
    expect(compareEntries({ ...base, timeSpentMs: 50 }, base)).toBeLessThan(0);
    expect(compareEntries({ ...base, date: "2026-11-19T00:00:00.000Z" }, { ...base, id: "0" })).toBeLessThan(0);
    expect(compareEntries(base, { ...base, id: "2" })).toBeLessThan(0);
    expect(compareEntries(base, base)).toBe(0);
  });

  it("compares numeric ids as numbers", () => {
    expect(compareEntries({ ...base, id: "9" }, { ...base, id: "10" })).toBeLessThan(0);
  });

  it("compares dates as times, not text", () => {
    expect(compareEntries({ ...base, date: "2026-11-20T00:00:00+01:00" }, { ...base, date: "2026-11-20T00:00:00.000Z" })).toBeLessThan(0);
  });
});
