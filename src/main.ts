import Konva from "konva";
import { NotificationManager } from "./notification-manager/NotificationManager";
import { AudioManager } from "./audio/AudioManager";
import { EventType } from "./notification-manager/GameEvent";
import { Leaderboard, type Difficulty } from "./score";
import { ScreenController } from "./screens/ScreenController";
import { StartScreen } from "./screens/StartScreen";
import { MapScreen } from "./screens/MapScreen";
import { RoomScreen } from "./screens/RoomScreen";
import { EndScreen } from "./screens/EndScreen";
import { CreditsScreen } from "./screens/CreditsScreen";
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
const leaderboard = new Leaderboard();
const screens = new ScreenController(stage);

const startScreen = new StartScreen(stage.width(), stage.height(), leaderboard);
const mapScreen = new MapScreen(stage.width(), stage.height());
const roomScreen = new RoomScreen(stage.width(), stage.height(), notifications);
const endScreen = new EndScreen(stage.width(), stage.height());
const creditsScreen = new CreditsScreen(stage.width(), stage.height());

screens.register("start", startScreen);
screens.register("map", mapScreen);
screens.register("room", roomScreen);
screens.register("end", endScreen);
screens.register("credits", creditsScreen);
screens.show("start");

// Safety net: if a font finishes downloading after startup, re-center all Konva.Text nodes
document.fonts.addEventListener("loadingdone", () => {
  stage.find("Text").forEach((node) => node.clearCache());
  stage.batchDraw();
});

let game: Game | null = null;
let lastResult: HeistResult | null = null;
let scoreSaved = false;

function startHeist(difficulty: Difficulty): void {
  game?.dispose();
  game = new Game(difficulty, { notifications, screens, mapScreen, roomScreen });
  game.start();
}

startScreen.onStart((difficulty) => startHeist(difficulty));
startScreen.onAudioMuteChange((muted) => audio.setMuted(muted));
startScreen.onCredits(() => screens.show("credits"));
creditsScreen.onBack(() => screens.show("start"));

notifications.subscribe(EventType.GameOver, () => {
  if (!game) return;
  const result = game.getResult();
  game.dispose();
  game = null;
  lastResult = result;
  scoreSaved = false;
  endScreen.setResult(result, leaderboard.getEntries(result.snapshot.difficulty));
  screens.show("end");
});

endScreen.onSaveScore((playerName) => {
  if (!lastResult || lastResult.outcome !== "escaped" || scoreSaved) return;
  scoreSaved = true;
  const { difficulty, score, timeSpentMs } = lastResult.snapshot;
  const saveResult = leaderboard.addEntry({ playerName, difficulty, score, timeSpentMs });
  endScreen.setResult(lastResult, leaderboard.getEntries(difficulty));
  endScreen.showSaveResult(saveResult);
});

endScreen.onPlayAgain(() => {
  if (lastResult) startHeist(lastResult.snapshot.difficulty);
});

endScreen.onBackToStart(() => {
  screens.show("start");
});
