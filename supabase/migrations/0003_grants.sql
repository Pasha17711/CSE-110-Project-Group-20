-- Table privileges for signed-in Players. RLS policies only narrow what a role
-- may already do, so `authenticated` (anonymous sign-ins) also needs these grants.
-- The leaderboard_bests view runs as the caller (security_invoker), so reading it
-- needs select on the table too. Still no update or delete for anyone.

grant select, insert on leaderboard_entries to authenticated;
grant select on leaderboard_entries to anon;
grant select on leaderboard_bests to anon, authenticated;
