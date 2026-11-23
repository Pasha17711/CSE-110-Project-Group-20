/**
 * Pure helpers for SupabaseLeaderboardStore. Kept apart from the store so tests
 * can import them without loading @supabase/supabase-js.
 */
import type { LeaderboardEntry } from "./Leaderboard";

/** The columns the store selects from leaderboard_bests. */
export const ENTRY_COLUMNS = "id, player_id, player_name, difficulty, score, time_spent_ms, created_at";

/**
 * Maps a database row (snake_case) to the LeaderboardEntry shape. `me` is the
 * current Player's id. It doesn't validate: Leaderboard checks the result and
 * drops anything malformed.
 */
export function rowToEntry(row: unknown, me: string): unknown {
  if (typeof row !== "object" || row === null) return row;
  const r = row as Record<string, unknown>;
  return {
    id: typeof r.id === "number" || typeof r.id === "string" || typeof r.id === "bigint" ? String(r.id) : r.id,
    playerName: r.player_name,
    difficulty: r.difficulty,
    score: r.score,
    timeSpentMs: r.time_spent_ms,
    date: r.created_at,
    isMine: r.player_id === me,
  };
}

export type AheadColumn = "score" | "time_spent_ms" | "created_at" | "id";

/** One comparison in a PostgREST filter, like `score.gt.5`. */
export interface AheadCondition {
  column: AheadColumn;
  op: "gt" | "lt" | "eq";
  value: string;
}

/**
 * The rows strictly ahead of `entry` in Leaderboard order (higher score, then
 * faster time, then earlier save, then lower id), as a list of alternatives:
 * a row is ahead if it matches every condition in any one of them.
 */
export function aheadConditions(entry: LeaderboardEntry): AheadCondition[][] {
  const score = String(entry.score);
  const time = String(entry.timeSpentMs);
  const sameScore: AheadCondition = { column: "score", op: "eq", value: score };
  const sameTime: AheadCondition = { column: "time_spent_ms", op: "eq", value: time };
  const sameSave: AheadCondition = { column: "created_at", op: "eq", value: entry.date };
  return [
    [{ column: "score", op: "gt", value: score }],
    [sameScore, { column: "time_spent_ms", op: "lt", value: time }],
    [sameScore, sameTime, { column: "created_at", op: "lt", value: entry.date }],
    [sameScore, sameTime, sameSave, { column: "id", op: "lt", value: entry.id }],
  ];
}

/**
 * aheadConditions as a PostgREST `or` filter, e.g.
 * `score.gt.5,and(score.eq.5,time_spent_ms.lt.900),...`. Dates are quoted
 * because they contain `:` and `+`.
 */
export function aheadFilter(entry: LeaderboardEntry): string {
  return aheadConditions(entry)
    .map((group) => {
      const parts = group.map(({ column, op, value }) => `${column}.${op}.${column === "created_at" ? `"${value}"` : value}`);
      return parts.length === 1 ? parts[0] : `and(${parts.join(",")})`;
    })
    .join(",");
}
