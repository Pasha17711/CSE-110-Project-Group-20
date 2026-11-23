import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseLeaderboardStore } from "./SupabaseLeaderboardStore";
import { ENTRY_COLUMNS, aheadFilter } from "./SupabaseLeaderboardStore.helpers";
import { Leaderboard, type LeaderboardEntry } from "./Leaderboard";
import { Difficulty } from "./ScoreModel";

// SupabaseLeaderboardStore only imports supabase-js types, so this test runs
// against a fake client and never loads the real one or touches the network.
// If the store ever imports supabase-js at runtime, this mock makes the test fail.
vi.mock("@supabase/supabase-js", () => {
  throw new Error("Tests must not load the real Supabase client.");
});

interface Response {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}

/** A chainable query that records each call and resolves to `respond(query)` when awaited. */
class FakeQuery implements PromiseLike<Response> {
  readonly calls: unknown[][] = [];

  constructor(readonly table: string, private readonly respond: (query: FakeQuery) => Response) {
    for (const method of ["select", "eq", "order", "limit", "maybeSingle", "single", "insert", "or"]) {
      (this as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
        this.calls.push([method, ...args]);
        return this;
      };
    }
  }

  has(method: string): boolean {
    return this.calls.some(([m]) => m === method);
  }

  then<A = Response, B = never>(onFulfilled?: ((value: Response) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve({ error: null, ...this.respond(this) }).then(onFulfilled, onRejected);
  }
}

interface FakeOptions {
  /** The stored session's user id; null means no session yet. */
  sessionUser?: string | null;
  respond?: (query: FakeQuery) => Response;
}

function fakeClient({ sessionUser = "me", respond = () => ({ data: [] }) }: FakeOptions = {}) {
  const queries: FakeQuery[] = [];
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: sessionUser ? { user: { id: sessionUser } } : null }, error: null })),
    signInAnonymously: vi.fn(async () => ({ data: { user: { id: "new-player" } }, error: null })),
  };
  const client = {
    auth,
    from: (table: string) => {
      const query = new FakeQuery(table, respond);
      queries.push(query);
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, auth, queries };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    player_id: "me",
    player_name: "Ana",
    difficulty: Difficulty.Hard,
    score: 900,
    time_spent_ms: 65_000,
    created_at: "2026-11-20T10:00:00.123456+00:00",
    ...overrides,
  };
}

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    id: "7", playerName: "Ana", difficulty: Difficulty.Hard, score: 900, timeSpentMs: 65_000,
    date: "2026-11-20T10:00:00.123456+00:00", isMine: true, ...overrides,
  };
}

const LEADERBOARD_ORDER = [
  ["order", "score", { ascending: false }],
  ["order", "time_spent_ms", { ascending: true }],
  ["order", "created_at", { ascending: true }],
  ["order", "id", { ascending: true }],
];

describe("SupabaseLeaderboardStore", () => {
  describe("signing in", () => {
    it("uses the stored session's user as the Player", async () => {
      const { client, auth } = fakeClient({ sessionUser: "me", respond: () => ({ data: [row(), row({ id: 8, player_id: "bo" })] }) });

      const rows = await new SupabaseLeaderboardStore(client).fetchTop(Difficulty.Hard, 10);

      expect(auth.signInAnonymously).not.toHaveBeenCalled();
      expect(rows).toEqual([expect.objectContaining({ isMine: true }), expect.objectContaining({ isMine: false })]);
    });

    it("signs in anonymously when there's no session", async () => {
      const { client, auth } = fakeClient({ sessionUser: null, respond: () => ({ data: [row({ player_id: "new-player" })] }) });

      const rows = await new SupabaseLeaderboardStore(client).fetchTop(Difficulty.Hard, 10);

      expect(auth.signInAnonymously).toHaveBeenCalledOnce();
      expect(rows).toEqual([expect.objectContaining({ isMine: true })]);
    });

    it("signs in once, even for calls made at the same time", async () => {
      const { client, auth } = fakeClient({ sessionUser: null });
      const store = new SupabaseLeaderboardStore(client);

      await Promise.all([store.fetchTop(Difficulty.Easy, 10), store.fetchBest(Difficulty.Easy), store.fetchTop(Difficulty.Hard, 10)]);
      await store.fetchTop(Difficulty.Medium, 10);

      expect(auth.getSession).toHaveBeenCalledOnce();
      expect(auth.signInAnonymously).toHaveBeenCalledOnce();
    });

    it("signs in before inserting, so the row's player_id default has a user", async () => {
      const { client, auth, queries } = fakeClient({ sessionUser: null, respond: () => ({ data: { id: 1 } }) });
      auth.signInAnonymously.mockImplementation(async () => {
        expect(queries).toHaveLength(0);
        return { data: { user: { id: "new-player" } }, error: null };
      });

      await new SupabaseLeaderboardStore(client).insert({ playerName: "Ana", difficulty: Difficulty.Easy, score: 1, timeSpentMs: 1 });

      expect(auth.signInAnonymously).toHaveBeenCalledOnce();
    });

    it("rejects when sign-in fails, and tries again on the next call", async () => {
      const { client, auth } = fakeClient({ sessionUser: null });
      auth.signInAnonymously.mockResolvedValueOnce({ data: { user: null }, error: { message: "rate limited" } } as never);
      const store = new SupabaseLeaderboardStore(client);

      await expect(store.fetchTop(Difficulty.Easy, 10)).rejects.toEqual({ message: "rate limited" });
      await expect(store.fetchTop(Difficulty.Easy, 10)).resolves.toEqual([]);
      expect(auth.signInAnonymously).toHaveBeenCalledTimes(2);
    });

    it("rejects when sign-in returns no user", async () => {
      const { client, auth } = fakeClient({ sessionUser: null });
      auth.signInAnonymously.mockResolvedValueOnce({ data: { user: null }, error: null } as never);

      await expect(new SupabaseLeaderboardStore(client).fetchTop(Difficulty.Easy, 10)).rejects.toThrow("no user");
    });

    it("rejects when reading the session fails", async () => {
      const { client, auth } = fakeClient();
      auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: { message: "storage broken" } } as never);

      await expect(new SupabaseLeaderboardStore(client).fetchTop(Difficulty.Easy, 10)).rejects.toEqual({ message: "storage broken" });
    });
  });

  describe("fetchTop", () => {
    it("reads one Difficulty's Personal Bests in Leaderboard order, up to the limit", async () => {
      const { client, queries } = fakeClient({ respond: () => ({ data: [row()] }) });

      const rows = await new SupabaseLeaderboardStore(client).fetchTop(Difficulty.Hard, 10);

      expect(queries).toHaveLength(1);
      expect(queries[0].table).toBe("leaderboard_bests");
      expect(queries[0].calls).toEqual([
        ["select", ENTRY_COLUMNS],
        ["eq", "difficulty", Difficulty.Hard],
        ...LEADERBOARD_ORDER,
        ["limit", 10],
      ]);
      expect(rows).toEqual([entry()]);
    });

    it("treats no data as an empty board", async () => {
      const { client } = fakeClient({ respond: () => ({ data: null }) });

      await expect(new SupabaseLeaderboardStore(client).fetchTop(Difficulty.Hard, 10)).resolves.toEqual([]);
    });
  });

  describe("fetchBest", () => {
    it("reads the current Player's Personal Best on one Difficulty", async () => {
      const { client, queries } = fakeClient({ sessionUser: "me", respond: () => ({ data: row() }) });

      const best = await new SupabaseLeaderboardStore(client).fetchBest(Difficulty.Hard);

      expect(queries[0].table).toBe("leaderboard_bests");
      expect(queries[0].calls).toEqual([
        ["select", ENTRY_COLUMNS],
        ["eq", "difficulty", Difficulty.Hard],
        ...LEADERBOARD_ORDER,
        ["eq", "player_id", "me"],
        ["maybeSingle"],
      ]);
      expect(best).toEqual(entry());
    });

    it("returns null when the Player never saved there", async () => {
      const { client } = fakeClient({ respond: () => ({ data: null }) });

      await expect(new SupabaseLeaderboardStore(client).fetchBest(Difficulty.Hard)).resolves.toBeNull();
    });
  });

  describe("insert", () => {
    it("inserts the snake_case row without a player_id and returns the new id as a string", async () => {
      const { client, queries } = fakeClient({ respond: () => ({ data: { id: 42 } }) });

      const inserted = await new SupabaseLeaderboardStore(client).insert({ playerName: "Ana", difficulty: Difficulty.Medium, score: 900, timeSpentMs: 65_000 });

      expect(queries[0].table).toBe("leaderboard_entries");
      expect(queries[0].calls).toEqual([
        ["insert", { player_name: "Ana", difficulty: Difficulty.Medium, score: 900, time_spent_ms: 65_000 }],
        ["select", "id"],
        ["single"],
      ]);
      expect(inserted).toEqual({ id: "42" });
    });
  });

  describe("countAhead", () => {
    it("counts the Personal Bests ahead of the entry on its Difficulty", async () => {
      const { client, queries } = fakeClient({ respond: () => ({ count: 56 }) });
      const best = entry();

      const ahead = await new SupabaseLeaderboardStore(client).countAhead(best);

      expect(queries[0].table).toBe("leaderboard_bests");
      expect(queries[0].calls).toEqual([
        ["select", "id", { count: "exact", head: true }],
        ["eq", "difficulty", Difficulty.Hard],
        ["or", aheadFilter(best)],
      ]);
      expect(ahead).toBe(56);
    });

    it("rejects when Supabase returns no count", async () => {
      const { client } = fakeClient({ respond: () => ({ count: null }) });

      await expect(new SupabaseLeaderboardStore(client).countAhead(entry())).rejects.toThrow("no count");
    });
  });

  it.each([
    ["fetchTop", (s: SupabaseLeaderboardStore) => s.fetchTop(Difficulty.Easy, 10)],
    ["fetchBest", (s: SupabaseLeaderboardStore) => s.fetchBest(Difficulty.Easy)],
    ["insert", (s: SupabaseLeaderboardStore) => s.insert({ playerName: "Ana", difficulty: Difficulty.Easy, score: 1, timeSpentMs: 1 })],
    ["countAhead", (s: SupabaseLeaderboardStore) => s.countAhead(entry())],
  ])("%s rejects with Supabase's error", async (_name, call) => {
    const error = { message: "new row violates check constraint" };
    const { client } = fakeClient({ respond: () => ({ data: null, count: null, error }) });

    await expect(call(new SupabaseLeaderboardStore(client))).rejects.toBe(error);
  });

  describe("behind a Leaderboard", () => {
    it("saves, ranks and loads through the store", async () => {
      const { client } = fakeClient({
        respond: (query) => {
          if (query.has("insert")) return { data: { id: 7 } };
          if (query.has("maybeSingle")) return { data: row() };
          if (query.has("or")) return { count: 2 };
          return { data: [row({ id: 1, player_id: "bo", score: 2000 }), row({ id: 2, player_id: "cy", score: 1000 }), row()] };
        },
      });
      const leaderboard = new Leaderboard(new SupabaseLeaderboardStore(client));

      const saved = await leaderboard.addEntry({ playerName: "Ana", difficulty: Difficulty.Hard, score: 900, timeSpentMs: 65_000 });
      const board = await leaderboard.getEntries(Difficulty.Hard);

      expect(saved).toEqual({ status: "saved", rank: 3, isNewBest: true, best: entry() });
      expect(board.status === "loaded" && board.entries.map((e) => [e.id, e.isMine])).toEqual([["1", false], ["2", false], ["7", true]]);
    });

    it("drops malformed rows from the server and keeps the rest", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { client } = fakeClient({
        respond: () => ({ data: [row(), row({ id: 8, score: "lots" }), row({ id: 9, created_at: null }), null] }),
      });

      const board = await new Leaderboard(new SupabaseLeaderboardStore(client)).getEntries(Difficulty.Hard);

      expect(board).toEqual({ status: "loaded", entries: [entry()] });
      expect(errorSpy).toHaveBeenCalledWith("Dropped 3 invalid leaderboard row(s).");
      errorSpy.mockRestore();
    });

    it("turns a Supabase error into saveFailed", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { client } = fakeClient({ respond: () => ({ data: null, error: { message: "offline" } }) });

      const saved = await new Leaderboard(new SupabaseLeaderboardStore(client)).addEntry({ playerName: "Ana", difficulty: Difficulty.Hard, score: 1, timeSpentMs: 1 });

      expect(saved).toEqual({ status: "saveFailed" });
      errorSpy.mockRestore();
    });
  });
});
