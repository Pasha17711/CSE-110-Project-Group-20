import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaderboardEntry } from "./Leaderboard";
import type { LeaderboardStore, NewEntry } from "./LeaderboardStore";
import type { Difficulty } from "./ScoreModel";
import { ENTRY_COLUMNS, aheadFilter, rowToEntry } from "./SupabaseLeaderboardStore.helpers";

/**
 * The online store (tables in supabase/migrations). Each browser signs in
 * anonymously the first time any method runs, and that user is the Player.
 * supabase-js keeps the session in localStorage, so the same browser stays the
 * same Player. Any error from Supabase becomes a rejected promise.
 */
export class SupabaseLeaderboardStore implements LeaderboardStore {
  private readonly client: SupabaseClient;
  private player: Promise<string> | null = null;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async fetchTop(difficulty: Difficulty, limit: number): Promise<unknown[]> {
    const me = await this.ensurePlayer();
    const { data, error } = await this.bests(difficulty).limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => rowToEntry(row, me));
  }

  async fetchBest(difficulty: Difficulty): Promise<unknown | null> {
    const me = await this.ensurePlayer();
    const { data, error } = await this.bests(difficulty).eq("player_id", me).maybeSingle();
    if (error) throw error;
    return data === null ? null : rowToEntry(data, me);
  }

  async insert(entry: NewEntry): Promise<{ id: string }> {
    // Signs in first: player_id is filled in from the session.
    await this.ensurePlayer();
    const { data, error } = await this.client
      .from("leaderboard_entries")
      .insert({ player_name: entry.playerName, difficulty: entry.difficulty, score: entry.score, time_spent_ms: entry.timeSpentMs })
      .select("id")
      .single();
    if (error) throw error;
    return { id: String(data.id) };
  }

  async countAhead(entry: LeaderboardEntry): Promise<number> {
    await this.ensurePlayer();
    const { count, error } = await this.client
      .from("leaderboard_bests")
      .select("id", { count: "exact", head: true })
      .eq("difficulty", entry.difficulty)
      .or(aheadFilter(entry));
    if (error) throw error;
    if (count === null) throw new Error("Supabase returned no count");
    return count;
  }

  /** One Difficulty's Personal Bests, in Leaderboard order. */
  private bests(difficulty: Difficulty) {
    return this.client
      .from("leaderboard_bests")
      .select(ENTRY_COLUMNS)
      .eq("difficulty", difficulty)
      .order("score", { ascending: false })
      .order("time_spent_ms", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
  }

  /** The current Player's id, signing in anonymously once if needed. A failed sign-in is retried next time. */
  private ensurePlayer(): Promise<string> {
    this.player ??= this.signIn().catch((err: unknown) => {
      this.player = null;
      throw err;
    });
    return this.player;
  }

  private async signIn(): Promise<string> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    if (data.session) return data.session.user.id;

    const signedIn = await this.client.auth.signInAnonymously();
    if (signedIn.error) throw signedIn.error;
    if (!signedIn.data.user) throw new Error("Anonymous sign-in returned no user");
    return signedIn.data.user.id;
  }
}
