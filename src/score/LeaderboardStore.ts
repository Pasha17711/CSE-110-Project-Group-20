import { compareEntries, type LeaderboardEntry } from "./Leaderboard";
import type { Difficulty } from "./ScoreModel";

/** A run to save, already normalized and checked by Leaderboard. */
export interface NewEntry {
  playerName: string;
  difficulty: Difficulty;
  score: number;
  timeSpentMs: number;
}

/**
 * Talks to wherever Leaderboard Entries live. The current Player is hidden in
 * here: rows come back with `isMine` instead of a player id.
 *
 * Rows come back camelCase (the LeaderboardEntry shape) but untrusted, so
 * Leaderboard validates them. Every method rejects when the store can't be
 * reached.
 */
export interface LeaderboardStore {
  /** Up to `limit` Personal Bests for one Difficulty, in Leaderboard order. */
  fetchTop(difficulty: Difficulty, limit: number): Promise<unknown[]>;
  /** The current Player's Personal Best for one Difficulty, or null if they never saved there. */
  fetchBest(difficulty: Difficulty): Promise<unknown | null>;
  /** Saves a run as the current Player. */
  insert(entry: NewEntry): Promise<{ id: string }>;
  /** How many Personal Bests on the entry's Difficulty are strictly ahead of it. */
  countAhead(entry: LeaderboardEntry): Promise<number>;
}

/** Used when the online Leaderboard isn't configured: boards fail to load and saves fail. */
export class UnavailableLeaderboardStore implements LeaderboardStore {
  fetchTop(): Promise<unknown[]> {
    return this.unavailable();
  }

  fetchBest(): Promise<unknown | null> {
    return this.unavailable();
  }

  insert(): Promise<{ id: string }> {
    return this.unavailable();
  }

  countAhead(): Promise<number> {
    return this.unavailable();
  }

  private unavailable(): Promise<never> {
    return Promise.reject(new Error("The online leaderboard is not configured"));
  }
}

export type StoreOperation = keyof LeaderboardStore;

/** A row as MemoryLeaderboardStore keeps it: a Leaderboard Entry plus who saved it. */
export interface StoredEntry extends NewEntry {
  id: string;
  playerId: string;
  date: string;
}

/** Fields for `seed`. Anything left out gets a default; `date` defaults to the store's clock. */
export type SeedEntry = Partial<StoredEntry> & Pick<StoredEntry, "playerId" | "difficulty" | "score" | "timeSpentMs">;

/**
 * An in-memory store that behaves like the online one, for tests and offline
 * play. Each save gets the next id and a date one millisecond after the last,
 * so save order is predictable.
 *
 * Tests can switch Players (`setPlayer`), make the next call of an operation
 * fail (`failNext`), or make it return any value at all, malformed or not
 * (`respondNext`).
 */
export class MemoryLeaderboardStore implements LeaderboardStore {
  private playerId: string;
  private readonly rows: StoredEntry[] = [];
  private readonly failures = new Set<StoreOperation>();
  private readonly responses = new Map<StoreOperation, unknown>();
  private nextId = 1;
  private clock = Date.parse("2026-01-01T00:00:00.000Z");

  constructor({ playerId }: { playerId: string }) {
    this.playerId = playerId;
  }

  /** Who the "current Player" is from now on. */
  setPlayer(playerId: string): void {
    this.playerId = playerId;
  }

  /** Makes the next call of `operation` reject. */
  failNext(operation: StoreOperation): void {
    this.failures.add(operation);
  }

  /** Makes the next call of `operation` resolve with `value` instead of doing anything. */
  respondNext(operation: StoreOperation, value: unknown): void {
    this.responses.set(operation, value);
  }

  /** Adds saved runs directly, for any Player. */
  seed(...entries: SeedEntry[]): void {
    for (const entry of entries) {
      this.rows.push({
        playerName: "Player",
        ...entry,
        id: entry.id ?? this.takeId(),
        date: entry.date ?? this.tick(),
      });
    }
  }

  async fetchTop(difficulty: Difficulty, limit: number): Promise<unknown[]> {
    const override = this.before<unknown[]>("fetchTop");
    if (override.hit) return override.value;
    return this.bests(difficulty).slice(0, limit);
  }

  async fetchBest(difficulty: Difficulty): Promise<unknown | null> {
    const override = this.before<unknown | null>("fetchBest");
    if (override.hit) return override.value;
    return this.bests(difficulty).find((e) => e.isMine) ?? null;
  }

  async insert(entry: NewEntry): Promise<{ id: string }> {
    const override = this.before<{ id: string }>("insert");
    if (override.hit) return override.value;
    const id = this.takeId();
    this.rows.push({ ...entry, id, playerId: this.playerId, date: this.tick() });
    return { id };
  }

  async countAhead(entry: LeaderboardEntry): Promise<number> {
    const override = this.before<number>("countAhead");
    if (override.hit) return override.value;
    return this.bests(entry.difficulty).filter((best) => compareEntries(best, entry) < 0).length;
  }

  /** Every Player's Personal Best on one Difficulty, in Leaderboard order. */
  private bests(difficulty: Difficulty): LeaderboardEntry[] {
    const bestByPlayer = new Map<string, LeaderboardEntry>();
    for (const row of this.rows) {
      if (row.difficulty !== difficulty) continue;
      const entry = this.toEntry(row);
      const current = bestByPlayer.get(row.playerId);
      if (!current || compareEntries(entry, current) < 0) bestByPlayer.set(row.playerId, entry);
    }
    return [...bestByPlayer.values()].sort(compareEntries);
  }

  private toEntry({ playerId, ...row }: StoredEntry): LeaderboardEntry {
    return { ...row, isMine: playerId === this.playerId };
  }

  private before<T>(operation: StoreOperation): { hit: true; value: T } | { hit: false } {
    if (this.failures.delete(operation)) throw new Error(`MemoryLeaderboardStore: ${operation} failed (on purpose)`);
    if (this.responses.has(operation)) {
      const value = this.responses.get(operation) as T;
      this.responses.delete(operation);
      return { hit: true, value };
    }
    return { hit: false };
  }

  private takeId(): string {
    return String(this.nextId++);
  }

  private tick(): string {
    return new Date(this.clock++).toISOString();
  }
}
