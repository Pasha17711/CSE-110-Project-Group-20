# Supabase

The online Leaderboard lives in a Supabase project. There is no Supabase CLI
setup: the files in `migrations/` are run by hand in the dashboard's
**SQL editor**, once each, in order.

| File | Status |
|---|---|
| `0001_leaderboard_entries.sql` | Already applied (made in the dashboard). Kept as a record. |
| `0002_players.sql` | Run once. Deletes existing test rows. |

The project also needs **Authentication → Sign In / Providers → Allow anonymous
sign-ins** turned on. Each browser signs in anonymously and becomes a Player.

The game reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (the publishable
key, never the service_role key) from `.env` (or `.env.local`).
