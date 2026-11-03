# Start Menu and Results Screen

This draft implements one story: choose a difficulty, start a game, inspect its
results, then replay with the same difficulty or return to the menu.

## Run locally

From the repository root, run `npm run dev` and open the Local URL printed by Vite.
The page always identifies itself as a menu demo.

1. Select easy, medium, or hard and press **Start Game**.
2. Try a wrong answer to the practice question, then enter **12**.
3. Press **Preview successful heist** to see sample results and a flawless badge.
4. Press **Play Again**. The practice question should reset and difficulty should stay the same.
5. Press **Preview caught heist** to see a zero score with no flawless escape badge.
6. Press **Back to Main Menu**, choose another difficulty, and start again.

The practice question is fixed. Its answers do not change the sample statistics.
The score and money fixtures also stay fixed across difficulty selections: they
demonstrate rendering, not scoring rules. Nothing is saved. No real map, timer,
question generator, answer validator, or score model is imported.

## Files and responsibilities

- `MenuController.ts`: owns start/playing/results state and selected difficulty;
  starts, restarts, accepts results, and returns to the menu.
- `GameResults.ts`: declares the compatible snapshot subset, checks input, and
  prepares text for the results screen. It does not calculate scores.
- `MenuView.ts`: creates DOM controls and renders the current menu screen.
- `DemoGame.ts`: contains the removable practice interaction and sample snapshots.
- `menu.css`: simple responsive styling and visible keyboard focus.
- `MenuController.test.ts` and `GameResults.test.ts`: deterministic Vitest tests.
- `../main.ts`: connects the menu, controller, and demo containers.

## How the controller works

`startGame(difficulty)` changes the state to playing and invokes the supplied
start callback. Duplicate starts are ignored. If setup throws synchronously,
the previous controller state is restored and the view shows an error message.
Callbacks are synchronous; asynchronous loading is not implemented.

`showResults(snapshot)` accepts results only while playing. Missing fields,
invalid values, and a mismatched difficulty throw an error before changing state.
The caller should catch that error and provide an appropriate game error UI.
The controller copies snapshots on receipt and when returning them so other code
cannot accidentally change the stored result. Duplicate endings are ignored.

`restartGame()` starts a new game with the previous difficulty and clears old
results. It only works from results. `backToMenu()` clears results and keeps the
previous difficulty selected. Leaving an active game calls the cleanup callback.
`onScreenChange` tells the application to update its view.

`prepareResults(snapshot)` produces display strings, including money, difficulty,
and `HH:MM:SS` time. It uses `caught` for the ending, even when an escaped run has
zero points. Zero statistics remain visible. The flawless escape badge needs
the supplied flawless flag, no incorrect answers, at least one room, and an
uncaught ending. This display condition does not change the score.

## Connecting the team's features later

The inspected score and map branches were not merged into this feature. The
snapshot subset is structurally compatible with Ping-Shu's `ScoreSnapshot`:

```ts
// Future integration only: these score and map imports do not exist here yet.
menu.showResults(score.getModel().snapshot());
```

The required fields are `difficulty`, `money`, `roomsSolved`, `bonusRoomsSolved`,
`incorrectAnswers`, `timeSpentMs`, `caught`, `flawless`, and `score`.
Extra snapshot fields are accepted. All required statistics must be supplied;
missing data is rejected rather than presented as a real zero.

- Replace the `showDemo` callback in `main.ts` with setup for a fresh score model,
  score controller, and map. Create fresh run state on every start/replay.
- Connect score's `onTimeUp` callback to `menu.showResults(snapshot)`.
- Connect map's `onScreenChange` event with `screen === "results"` to the same
  method. Other map/room transitions belong to the gameplay view.
- Provide the cleanup callback to dispose the old score controller, remove
  subscriptions, and release game resources. Disconnect previous-run callbacks
  before replay; the menu does not attach run IDs to snapshots.
- Wire `menu.onScreenChange` to render the menu and show/hide the gameplay container,
  as the demo does. `MenuView.render()` hides its own container while playing.
- Use `textContent` for result data. The only `innerHTML` here is fixed demo markup.

`roomsSolved` already includes bonus rooms. Do not add them again.
`timeSpentMs` includes penalties and room time, not total wall-clock session time.
Time rounding matches the score branch's current helper (round partial seconds
up). After that branch merges, the formatter can use its shared helper if desired.
The snapshot's `flawless` flag can be true even when caught; this UI deliberately
does not show a flawless *escape* badge for that ending.

There is no leaderboard, persistence, full gameplay integration, or asynchronous
game loading in this draft.

## Checks

```sh
npm test
npx tsc --noEmit
npm run build
```

The new tests cover transitions, callbacks, duplicate starts/endings, invalid
input, setup failures, defensive copies, restart, cleanup, supplied result values,
zero statistics, caught/successful endings, flawless badges, difficulty labels,
time boundaries, and malformed snapshots. Tests use no network or real timers.

Draft verification on November 2, 2026: `npm test` passed all 75 tests (58 new
menu/results tests and 17 existing notification tests), `npx tsc --noEmit` passed,
and `npm run build` passed. A separate Playwright browser check using existing
local tooling passed all three difficulties, wrong/correct practice answers,
success/caught screens, replay reset, back navigation, keyboard start, focus
changes, and a 320px viewport with no horizontal overflow or browser errors.
No browser tooling was added to the project's dependencies. Screen-reader
announcements and integration with the real game have not been verified.

The unit tests exercise the controller and result summaries, not actual DOM
rendering. Use the walkthrough above in a browser. Also check keyboard-only
navigation, visible focus, announcements with a screen reader, and a narrow
phone-sized viewport. Automated browser checks do not replace user usability
testing or real integration with the team's controllers.

## AI assistance

This feature was generated with Codex under Asad's direction. Asad reports that
his course permits directed Codex generation to count toward its authorship
requirement. The implementation is disclosed as AI-assisted rather than manually
typed student code. See `../../docs/results-workflow-authorship.md` for the
contribution record. Existing teammate code is not claimed as this contribution.
