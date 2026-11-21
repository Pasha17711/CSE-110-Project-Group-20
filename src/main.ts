import Konva from "konva";
import { NotificationManager } from "./notification-manager/NotificationManager";
import { AudioManager } from "./audio/AudioManager";
import { EventType } from "./notification-manager/GameEvent";
import { Leaderboard, UnavailableLeaderboardStore, type Difficulty } from "./score";
import { getSupabase } from "./score/supabaseClient";
import { SupabaseLeaderboardStore } from "./score/SupabaseLeaderboardStore";
import { ScreenController } from "./screens/ScreenController";
import { StartScreen } from "./screens/StartScreen";
import { MapScreen } from "./screens/MapScreen";
import { RoomScreen } from "./screens/RoomScreen";
import { EndScreen } from "./screens/EndScreen";
import { Game, type HeistResult } from "./game/Game";

/**
 * The only place that creates app-scoped objects and connects the Heist
 * lifecycle: Start Screen → Map Screen ⇄ Room Screen → End Screen → Start Screen
 * (or straight into a new Heist).
 */

// Force-load fonts in before creating StartScreen
await Promise.all([
  document.fonts.load('400 82px "Gasoek One"'),
]);
await document.fonts.ready;

const stage = new Konva.Stage({
  container: "container",
  width: window.innerWidth,
  height: window.innerHeight,
});
const notifications = new NotificationManager();
// One app-scoped subscriber; all sounds react to the same events as the score/HUD.
const audio = new AudioManager(notifications);
// Online only. Without the Supabase env vars, boards fail to load and saves fail.
const supabase = getSupabase();
if (!supabase) console.warn("VITE_SUPABASE_URL / VITE_SUPABASE_KEY not set: the leaderboard is offline.");
const leaderboard = new Leaderboard(supabase ? new SupabaseLeaderboardStore(supabase) : new UnavailableLeaderboardStore());
const screens = new ScreenController(stage);

const startScreen = new StartScreen(stage.width(), stage.height(), leaderboard);
const mapScreen = new MapScreen(stage.width(), stage.height());
const roomScreen = new RoomScreen(stage.width(), stage.height(), notifications);
const endScreen = new EndScreen(stage.width(), stage.height());

screens.register("start", startScreen);
screens.register("map", mapScreen);
screens.register("room", roomScreen);
screens.register("end", endScreen);
screens.show("start");

// Safety net: if a font finishes downloading after startup, re-center all Konva.Text nodes
document.fonts.addEventListener("loadingdone", () => {
  stage.find("Text").forEach((node) => node.clearCache());
  stage.batchDraw();
});

let game: Game | null = null;
let lastResult: HeistResult | null = null;
let scoreSaved = false;
/** Bumped by each End Screen board load, so a slower, older load can't overwrite a newer one. */
let boardRequest = 0;

// A convenience only: the name box starts with the last name saved in this browser.
const PLAYER_NAME_KEY = "heist-player-name";
try {
  endScreen.suggestName(localStorage.getItem(PLAYER_NAME_KEY) ?? "");
} catch {
  // Storage blocked: start with an empty name box.
}

function startHeist(difficulty: Difficulty): void {
  game?.dispose();
  game = new Game(difficulty, { notifications, screens, mapScreen, roomScreen });
  game.start();
}

startScreen.onStart((difficulty) => startHeist(difficulty));
startScreen.onAudioMuteChange((muted) => audio.setMuted(muted));

notifications.subscribe(EventType.GameOver, () => {
  if (!game) return;
  const result = game.getResult();
  game.dispose();
  game = null;
  lastResult = result;
  scoreSaved = false;
  endScreen.setResult(result);
  screens.show("end");
  void refreshEndLeaderboard(result);
});

/** Loads the End Screen's Leaderboard, unless another Heist ended or a newer load started meanwhile. */
async function refreshEndLeaderboard(result: HeistResult): Promise<void> {
  const request = ++boardRequest;
  const loaded = await leaderboard.getEntries(result.snapshot.difficulty);
  if (lastResult !== result || request !== boardRequest) return;
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
  try {
    localStorage.setItem(PLAYER_NAME_KEY, playerName);
  } catch {
    // Storage blocked: the name just isn't remembered.
  }
  endScreen.suggestName(playerName);
  await refreshEndLeaderboard(result);
});

endScreen.onPlayAgain(() => {
  if (lastResult) startHeist(lastResult.snapshot.difficulty);
});

endScreen.onBackToStart(() => {
  screens.show("start");
});
