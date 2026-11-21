# Score system (PingShu)

Everything lives in `src/score/`. Import from the folder:

```ts
import { ScoreModel, ScoreController, Leaderboard, Difficulty, DIFFICULTY_LABEL, formatTime, formatMoney } from "./score";
```

## Setup (once per Heist, done by Game)

`src/game/Game.ts` creates one ScoreModel + ScoreController per Heist and connects it:

```ts
// Difficulty uses the same numbers as getQuestion(): 0 = Easy, 1 = Medium, 2 = Hard
const score = new ScoreController(new ScoreModel({ difficulty }));
score.listenTo(notifications);   // the score changes only through events (below)
score.onChange((m) => /* both HUDs: */ screen.setHud(m.getTimeRemainingMs(), m.getTimeLimitMs(), m.getMoney()));
score.onTimeUp(() => /* end the Heist as Caught */);
```

Display labels: `DIFFICULTY_LABEL[difficulty]` gives `"Easy"`, `"Medium"` or `"Hard"`.

## Events the score listens to

Nobody calls the ScoreController directly any more. Modules send events
through the `NotificationManager`, and `score.listenTo(notifications)` turns
them into score changes:

| Who sends it | When | Event | What the score does |
|---|---|---|---|
| **MapController** | Player enters a Room | `RoomEntered` | `enterRoom()`: clock runs |
| **MapController** | Player goes back to the map | `ReturnedToMap` | `returnToMap()`: clock pauses |
| **AnswerValidator** | Any Step's Answer is **wrong** (operation picks included) | `Incorrect` | `answerIncorrect()`: −60 s |
| **AnswerValidator** | A Step is right but the Room isn't finished | `Correct` | nothing |
| **AnswerValidator** | The **last** Step is right (Room Solved) | `RoomSolved` `{ roomKind }`, then `Correct` | `roomSolved(roomKind)`: money + correct answer |

Other modules (the Room Screen's feedback, audio later) can listen to the same events.
`score.dispose()` unsubscribes from all of them.

## Who else uses the score

| Who | When | Call |
|---|---|---|
| **Game** | Every score change | `setHud(remaining, limit, money)` on the Map and Room Screens |
| **Game** | Vault Solved, or time up | `score.dispose()`, then freezes `score.getModel().snapshot()` into the HeistResult |
| **Hud** | Show time / money | `formatTime(timeRemainingMs)`, `formatMoney(money)` |
| **EndScreen** | Show results | the `snapshot` in the HeistResult (below) |

## Things to watch out for

- **The clock only runs inside Rooms.** MapController sends `RoomEntered` / `ReturnedToMap` every time.
- **One Room = one Question, but it has several Steps.** Every wrong Step sends `Incorrect`, which costs time and rules out Flawless. `RoomSolved` is sent only once, when the last Step is right.
- **Events are delivered right away** (unless one is already being handled, then it waits its turn), so Game can read the score straight after `validateAnswer()`.
- **Rooms can't be solved after time is up** (`roomSolved()` returns 0 and nothing is counted). Game then ends the Heist as Caught.
- **Don't change money or time directly.** Send the event, so the score and the HUD stay in step.
- **Two endings:** `onTimeUp` only fires when the player is Caught. Escaping is decided by Game when the Vault is Solved. The End Screen reads the outcome from `HeistResult.outcome`, not from `snapshot.caught`.

## End Screen data — `HeistResult.snapshot` (from `score.getModel().snapshot()`)

```ts
{
  caught,            // true = time ran out (score is 0, not flawless)
  score,             // final score
  money,             // money earned
  flawless,          // no wrong answers (show an achievement?)
  roomsSolved, bonusRoomsSolved, incorrectAnswers,
  timeSpentMs,       // show with formatTime()
  difficulty,        // Difficulty.Easy / Medium / Hard (0 / 1 / 2)
}
```

## Leaderboard — online, one ranking per difficulty

The Leaderboard is shared online (Supabase, see `supabase/README.md`) and **split by difficulty**,
because hard questions take longer and a single ranking isn't fair. Terms are in `GLOSSARY.md`:
each browser is a **Player**; every Escaped Heist they save is stored, but only their
**Personal Best** per Difficulty is on the board, and every Player who saved has a **Rank**.

Every call is async and never throws on a network problem: the result says what happened.

```ts
const board = new Leaderboard(store);                  // main.ts picks the store (below)

await board.getEntries(Difficulty.Hard);
// { status: "loaded", entries }  top 10 Personal Bests, best first; entry.isMine marks your own
// { status: "loadFailed" }

await board.getPersonalBest(Difficulty.Hard);
// { status: "loaded", best: { entry, rank } | null }   null = you never saved on Hard
// { status: "loadFailed" }

const result = await board.addEntry({ playerName, difficulty, score, timeSpentMs });
// { status: "saved", rank, isNewBest, best }  rank and best are your Personal Best after the save
// { status: "savedUnranked" }                 saved, but the rank couldn't load
// { status: "saveFailed" }                    not saved (offline, not configured, refused)
endScreen.showSaveResult(result);              // main.ts does this: one line on the End Screen
```

- Order: highest score, then faster time, then earlier save (then lower id). `compareEntries` and the database use the same order.
- Names are trimmed, blank becomes `"Anonymous"`, longer than `PLAYER_NAME_MAX_LENGTH` (20) is cut down.
- Invalid input (NaN score, negative time, unknown difficulty) rejects with a `TypeError`: that's a bug, not a network problem.
- Only an Escaped Heist can be saved (`main.ts` offers the name box only then).

### Stores

`Leaderboard` talks to a `LeaderboardStore`, so tests never touch the network:

| Store | Used by |
|---|---|
| `SupabaseLeaderboardStore` | the game, when `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` are set. Signs in anonymously on first use. Import it from its own file, not from `./score`, so tests don't load supabase-js. |
| `UnavailableLeaderboardStore` | the game, when those env vars are missing: boards fail to load, saves fail |
| `MemoryLeaderboardStore` | tests. `setPlayer(id)` switches Players, `seed(...)` adds runs, `failNext(op)` / `respondNext(op, value)` fake failures and bad rows |

## Rules (for reference)

- 1 hour per Heist, only counts down inside Rooms. Every wrong Step: −60 s.
- Difficulty multiplier: easy ×1, medium ×3, hard ×6.
- Money: main room $100 × multiplier, bonus room $300 × multiplier. Money does **not** affect score (for skins later).
- Score = multiplier × correct answers × seconds left. Bonus rooms count as **3** correct answers.
- No wrong answers: score ×1.2. Time runs out: score = 0.

All numbers are constants at the top of `ScoreModel.ts` / `ScoreController.ts` — ask PingShu before changing them.
Time constants are written in the unit that reads best (`DEFAULT_TIME_LIMIT_MINUTES = 60`) and converted
with the helpers in `time.ts` (`secondsToMs`, `minutesToMs`, `hoursToMs`, `msToWholeSeconds`).

Run the tests: `npm test`
