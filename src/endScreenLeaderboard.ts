import type { Leaderboard } from "./score";
import type { EndScreen } from "./screens/contracts";
import type { HeistResult } from "./game/Game";

/** Where the last saved name is remembered. A convenience only. */
export const PLAYER_NAME_KEY = "heist-player-name";

export interface NameStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Connects the End Screen to the Leaderboard: loads the board for each
 * result, saves an Escaped score once, and drops anything that arrives late.
 *  - A board load or save for an older Heist is ignored once a new one ended.
 *  - Of two board loads for the same Heist, only the newer one is shown.
 *  - A failed save can be tried again; a successful one can't be repeated.
 *  - The name box starts with the last name saved (if storage allows it).
 */
export function connectEndScreenLeaderboard(
  endScreen: EndScreen,
  leaderboard: Leaderboard,
  storage: NameStorage | null = defaultStorage(),
): { showResult(result: HeistResult): void } {
  let lastResult: HeistResult | null = null;
  let scoreSaved = false;
  let boardRequest = 0;

  const remembered = tryStorage(() => storage?.getItem(PLAYER_NAME_KEY));
  if (remembered) endScreen.suggestName(remembered);

  async function refreshBoard(result: HeistResult): Promise<void> {
    // Every new Heist and every save starts a newer load, which supersedes this one.
    const request = ++boardRequest;
    const loaded = await leaderboard.getEntries(result.snapshot.difficulty);
    if (request !== boardRequest) return;
    endScreen.setLeaderboard(loaded);
  }

  endScreen.onSaveScore(async (playerName) => {
    if (!lastResult || lastResult.outcome !== "escaped" || scoreSaved) return;
    // Set before the first await so a second submit can't save twice.
    scoreSaved = true;
    const result = lastResult;
    const { difficulty, score, timeSpentMs } = result.snapshot;
    const saveResult = await leaderboard.addEntry({ playerName, difficulty, score, timeSpentMs });
    if (lastResult !== result) return;
    endScreen.showSaveResult(saveResult);
    if (saveResult.status === "saveFailed") {
      scoreSaved = false; // the End Screen offers the name box again
      return;
    }
    tryStorage(() => storage?.setItem(PLAYER_NAME_KEY, playerName));
    endScreen.suggestName(playerName);
    await refreshBoard(result);
  });

  return {
    showResult(result) {
      lastResult = result;
      scoreSaved = false;
      endScreen.setResult(result);
      void refreshBoard(result);
    },
  };
}

function defaultStorage(): NameStorage | null {
  return tryStorage(() => globalThis.localStorage) ?? null;
}

/** Storage can be missing or throw (blocked, private mode); the name just isn't remembered then. */
function tryStorage<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}
