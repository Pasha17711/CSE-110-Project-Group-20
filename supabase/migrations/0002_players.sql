-- Players (anonymous sign-ins) and Personal Bests.
-- Run once in the Supabase SQL editor, after 0001. It runs as one transaction,
-- so if any step fails, nothing changes.

begin;

-- Test rows from before Players existed.
delete from leaderboard_entries;

-- CHECK constraints pass when the value is null, so these columns need not null too.
alter table leaderboard_entries
  alter column player_name set not null,
  alter column score set not null,
  alter column time_spent_ms set not null;

-- Who saved the entry. Filled in by the database from the signed-in user.
alter table leaderboard_entries
  add column player_id uuid not null default auth.uid();

-- Anonymous sign-ins use the `authenticated` role, not `anon`. There are still
-- no update or delete policies, so nobody can change or remove entries.
drop policy "anon can insert" on leaderboard_entries;
drop policy "anon can read" on leaderboard_entries;
create policy "everyone reads entries" on leaderboard_entries
  for select to anon, authenticated using (true);
create policy "players insert their own entries" on leaderboard_entries
  for insert to authenticated with check (player_id = auth.uid());

create index leaderboard_entries_best_idx
  on leaderboard_entries (difficulty, player_id, score desc, time_spent_ms, created_at, id);

-- Each Player's Personal Best per Difficulty, in Leaderboard order: highest
-- score, then faster time, then earlier save, then lower id.
-- security_invoker makes the view follow the table's RLS policies.
create view leaderboard_bests with (security_invoker = true) as
  select distinct on (difficulty, player_id) *
  from leaderboard_entries
  order by difficulty, player_id, score desc, time_spent_ms asc, created_at asc, id asc;
grant select on leaderboard_bests to anon, authenticated;

commit;
