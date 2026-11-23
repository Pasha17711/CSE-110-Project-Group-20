import { describe, it, expect } from "vitest";
import { compareEntries, type LeaderboardEntry } from "./Leaderboard";
import { aheadConditions, aheadFilter, rowToEntry, type AheadCondition } from "./SupabaseLeaderboardStore.helpers";
import { Difficulty } from "./ScoreModel";

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    id: "7",
    playerName: "Ana",
    difficulty: Difficulty.Hard,
    score: 500,
    timeSpentMs: 90_000,
    date: "2026-11-20T12:00:00.123456+00:00",
    isMine: false,
    ...overrides,
  };
}

describe("rowToEntry", () => {
  const row = {
    id: 7,
    player_id: "uuid-me",
    player_name: "Ana",
    difficulty: 2,
    score: 500,
    time_spent_ms: 90_000,
    created_at: "2026-11-20T12:00:00.123456+00:00",
  };

  it("maps snake_case columns to a LeaderboardEntry, with the id as a string", () => {
    expect(rowToEntry(row, "uuid-other")).toEqual(entry());
  });

  it("sets isMine from the current Player's id", () => {
    expect(rowToEntry(row, "uuid-me")).toMatchObject({ isMine: true });
  });

  it("keeps the server's date string exactly, so rank counts compare the same instant", () => {
    expect(rowToEntry(row, "x")).toMatchObject({ date: row.created_at });
  });

  it("passes malformed rows through for Leaderboard to drop", () => {
    expect(rowToEntry(null, "x")).toBeNull();
    expect(rowToEntry("junk", "x")).toBe("junk");
    expect(rowToEntry({ id: { nested: true } }, "x")).toMatchObject({ id: { nested: true }, playerName: undefined });
  });
});

describe("aheadFilter", () => {
  it("builds the PostgREST or filter for rows strictly ahead", () => {
    expect(aheadFilter(entry())).toBe(
      "score.gt.500," +
        "and(score.eq.500,time_spent_ms.lt.90000)," +
        'and(score.eq.500,time_spent_ms.eq.90000,created_at.lt."2026-11-20T12:00:00.123456+00:00"),' +
        'and(score.eq.500,time_spent_ms.eq.90000,created_at.eq."2026-11-20T12:00:00.123456+00:00",id.lt.7)',
    );
  });
});

describe("aheadConditions", () => {
  /** Evaluates the conditions the way Postgres would, on millisecond dates. */
  function matches(row: LeaderboardEntry, groups: AheadCondition[][]): boolean {
    const value = (column: AheadCondition["column"], e: LeaderboardEntry): bigint | number => {
      switch (column) {
        case "score":
          return e.score;
        case "time_spent_ms":
          return e.timeSpentMs;
        case "created_at":
          return Date.parse(e.date);
        case "id":
          return BigInt(e.id);
      }
    };
    const parse = (column: AheadCondition["column"], raw: string): bigint | number =>
      column === "created_at" ? Date.parse(raw) : column === "id" ? BigInt(raw) : Number(raw);

    return groups.some((group) =>
      group.every(({ column, op, value: raw }) => {
        const a = value(column, row);
        const b = parse(column, raw);
        return op === "gt" ? a > b : op === "lt" ? a < b : a === b;
      }),
    );
  }

  it("matches exactly the entries compareEntries puts ahead", () => {
    const t = (ms: number) => new Date(Date.UTC(2026, 10, 20, 12, 0, 0, ms)).toISOString();
    const samples: LeaderboardEntry[] = [];
    let id = 1;
    for (const score of [400, 500, 600]) {
      for (const timeSpentMs of [80_000, 90_000]) {
        for (const date of [t(0), t(1)]) {
          samples.push(entry({ id: String(id++), score, timeSpentMs, date }));
        }
      }
    }
    // Same score, time and save time: only the id decides. Includes "9" vs "10".
    samples.push(entry({ id: "9", score: 700, timeSpentMs: 1, date: t(5) }));
    samples.push(entry({ id: "10", score: 700, timeSpentMs: 1, date: t(5) }));

    for (const target of samples) {
      const groups = aheadConditions(target);
      for (const row of samples) {
        expect(matches(row, groups), `${row.id} ahead of ${target.id}?`).toBe(compareEntries(row, target) < 0);
      }
    }
  });
});
