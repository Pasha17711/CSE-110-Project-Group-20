import { isDifficultyType, type Difficulty } from "./ScoreModel";
import type { LeaderboardStore, NewEntry } from "./LeaderboardStore";

/**
 * The shared online Leaderboard (see GLOSSARY.md: Player, Leaderboard Entry,
 * Personal Best, Leaderboard, Rank).
 *
 * Every Escaped Heist a Player saves is stored, but only each Player's
 * Personal Best counts. Where entries live is up to the LeaderboardStore, so
 * tests use MemoryLeaderboardStore and never touch the network.
 *
 * Nothing here throws on a network or server problem: each method's result
 * says what happened, so callers never have to guess.
 */

/** How many rows the screens show. */
export const LEADERBOARD_SIZE = 10;
/** Longer names are cut down to this many characters. The database checks the same limit. */
export const PLAYER_NAME_MAX_LENGTH = 20;

const ANONYMOUS = "Anonymous";

export interface LeaderboardEntry {
  /** The row id, kept as a string whatever the column type. */
  id: string;
  playerName: string;
  difficulty: Difficulty;
  score: number;
  timeSpentMs: number;
  /** When it was saved (ISO string, set by the server). */
  date: string;
  /** Saved by the current Player. Screens never see player ids. */
  isMine: boolean;
}

export type LoadResult =
  /** Personal Bests, at most LEADERBOARD_SIZE, in Leaderboard order. */
  | { status: "loaded"; entries: LeaderboardEntry[] }
  | { status: "loadFailed" };

export type PersonalBestResult =
  /** `best` is null when the Player never saved on this Difficulty. */
  | { status: "loaded"; best: { entry: LeaderboardEntry; rank: number } | null }
  | { status: "loadFailed" };

/** What happened when a run was saved. See Leaderboard.addEntry. */
export type AddEntryResult =
  | { status: "saved"; rank: number; isNewBest: boolean; best: LeaderboardEntry }
  | { status: "savedUnranked" }
  | { status: "saveFailed" };

export class Leaderboard {
  private readonly store: LeaderboardStore;
  private readonly size: number;

  constructor(store: LeaderboardStore, size: number = LEADERBOARD_SIZE) {
    this.store = store;
    this.size = size;
  }

  /** One Difficulty's Leaderboard: the top Personal Bests, best first. */
  async getEntries(difficulty: Difficulty): Promise<LoadResult> {
    let rows: unknown;
    try {
      rows = await this.store.fetchTop(difficulty, this.size);
    } catch (err) {
      console.error("Could not load the leaderboard:", err);
      return { status: "loadFailed" };
    }
    if (!Array.isArray(rows)) {
      console.error("Leaderboard rows are not a list:", rows);
      return { status: "loadFailed" };
    }

    const entries = rows.filter((row): row is LeaderboardEntry => isEntry(row) && row.difficulty === difficulty);
    if (entries.length < rows.length) {
      console.error(`Dropped ${rows.length - entries.length} invalid leaderboard row(s).`);
    }
    return { status: "loaded", entries: entries.sort(compareEntries).slice(0, this.size) };
  }

  /** The current Player's Personal Best on one Difficulty, and its Rank. */
  async getPersonalBest(difficulty: Difficulty): Promise<PersonalBestResult> {
    try {
      const best = await this.fetchRankedBest(difficulty);
      return { status: "loaded", best };
    } catch (err) {
      console.error("Could not load your personal best:", err);
      return { status: "loadFailed" };
    }
  }

  /**
   * Saves an Escaped Heist as the current Player. The name is trimmed, blank
   * becomes "Anonymous", and it is cut down to PLAYER_NAME_MAX_LENGTH.
   *  - "saved": saved; `rank` and `best` are the Player's Personal Best after
   *    the save, and `isNewBest` says whether this run is it
   *  - "savedUnranked": saved, but the Rank couldn't be worked out
   *  - "saveFailed": not saved (network, sign-in, or the server refused it)
   *
   * Rejects with a TypeError for invalid input (a programmer error, not a
   * network one).
   */
  async addEntry(entry: NewEntry): Promise<AddEntryResult> {
    const run = normalize(entry);

    let inserted: { id: string };
    try {
      inserted = await this.store.insert(run);
    } catch (err) {
      console.error("Could not save the score:", err);
      return { status: "saveFailed" };
    }

    let best: { entry: LeaderboardEntry; rank: number } | null;
    try {
      best = await this.fetchRankedBest(run.difficulty);
    } catch (err) {
      console.error("Saved the score, but could not work out its rank:", err);
      return { status: "savedUnranked" };
    }
    if (!best) {
      console.error("Saved the score, but it has no personal best to rank.");
      return { status: "savedUnranked" };
    }
    return { status: "saved", rank: best.rank, isNewBest: best.entry.id === inserted.id, best: best.entry };
  }

  /** Throws if anything fails or comes back malformed. */
  private async fetchRankedBest(difficulty: Difficulty): Promise<{ entry: LeaderboardEntry; rank: number } | null> {
    const row = await this.store.fetchBest(difficulty);
    if (row === null) return null;
    if (!isEntry(row) || row.difficulty !== difficulty) throw new Error(`Invalid personal best row: ${JSON.stringify(row)}`);

    const ahead = await this.store.countAhead(row);
    if (!Number.isInteger(ahead) || ahead < 0) throw new Error(`Invalid count of entries ahead: ${ahead}`);
    return { entry: row, rank: ahead + 1 };
  }
}

/** Trims and shortens the name, rounds the time, and throws a TypeError for invalid input. */
function normalize(entry: NewEntry): NewEntry {
  const { difficulty, score } = entry;
  if (!isDifficultyType(difficulty)) throw new TypeError(`Invalid difficulty: ${difficulty}`);
  if (!Number.isFinite(score) || score < 0) throw new TypeError(`Invalid score: ${score}`);
  if (!Number.isFinite(entry.timeSpentMs) || entry.timeSpentMs < 0) throw new TypeError(`Invalid time: ${entry.timeSpentMs}`);
  // The database counts characters, not UTF-16 units, so cut by characters.
  const name = Array.from(entry.playerName.trim()).slice(0, PLAYER_NAME_MAX_LENGTH).join("").trimEnd();
  return { playerName: name || ANONYMOUS, difficulty, score: Math.round(score), timeSpentMs: Math.round(entry.timeSpentMs) };
}

/**
 * Leaderboard order: highest score, then faster time, then earlier save, then
 * lower id. The database view and rank count use the same four keys.
 */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return b.score - a.score || a.timeSpentMs - b.timeSpentMs || Date.parse(a.date) - Date.parse(b.date) || compareIds(a.id, b.id);
}

/** Numeric ids compare as numbers ("9" before "10"); others compare as text. */
function compareIds(a: string, b: string): number {
  const numeric = /^\d+$/;
  if (numeric.test(a) && numeric.test(b) && a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

function isEntry(value: unknown): value is LeaderboardEntry {
  const e = value as LeaderboardEntry;
  return (
    typeof e === "object" &&
    e !== null &&
    typeof e.id === "string" &&
    typeof e.playerName === "string" &&
    isDifficultyType(e.difficulty) &&
    Number.isFinite(e.score) &&
    Number.isFinite(e.timeSpentMs) &&
    e.timeSpentMs >= 0 &&
    typeof e.date === "string" &&
    !Number.isNaN(Date.parse(e.date)) &&
    typeof e.isMine === "boolean"
  );
}
