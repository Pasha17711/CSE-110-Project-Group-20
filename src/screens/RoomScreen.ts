import Konva from "konva";
import BasicMultistepPuzzle from "../puzzles/basic-multistep-puzzle";
import type { PuzzleInputType } from "../puzzles/basic-multistep-puzzle";
import PowerBoxPuzzle from "../puzzles/power-box-puzzle";
import LaserMatchPuzzle from "../puzzles/laser-match-puzzle";
import type Puzzle from "../puzzles/puzzle";
import type { Room } from "../map/Room";
import type { NotificationManager } from "../notification-manager/NotificationManager";
import { EventType } from "../notification-manager/GameEvent";
import type { StepAnswer } from "../questions/Question";
import { WRONG_ANSWER_PENALTY_SECONDS } from "../score";
import type { RoomScreen as RoomScreenContract, Unsubscribe } from "./contracts";
import { Hud } from "./Hud";
import { DESIGN_HEIGHT, DESIGN_WIDTH, fitLayer } from "./layout";
import { Listeners } from "./listeners";
import { COLORS, createBackground, createButton, createText } from "./theme";

/** The puzzle panel, centered at (x, y). */
const PUZZLE = { x: DESIGN_WIDTH / 2, y: 470, width: 960, height: 480, spacing: 24, blockSize: 40 };
const PANEL_COLOR = "#4b5563";
/** How long the Correct / Incorrect line stays up. */
export const FEEDBACK_MS = 1000;

/**
 * The screen inside a Room: the Room name, the Room's puzzle (multistep,
 * Power Box or Laser Match), an Exit button and the HUD. Forwards every
 * Step's Answer to `onAnswer`, and shows a short Correct / Incorrect line
 * when the Answer is judged.
 */
export class RoomScreen implements RoomScreenContract {
  readonly layer = new Konva.Layer();

  private readonly answers = new Listeners<[StepAnswer]>();
  private readonly exits = new Listeners<[]>();
  private readonly hud = new Hud();
  private readonly roomName: Konva.Text;
  private readonly feedback: Konva.Text;
  private puzzle: Puzzle | null = null;
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(stageWidth: number, stageHeight: number, notifications: NotificationManager) {
    fitLayer(this.layer, stageWidth, stageHeight);
    this.layer.add(createBackground());
    this.layer.add(this.hud);

    this.roomName = createText({
      y: 100, width: DESIGN_WIDTH,
      align: "center",
      fontSize: 40,
      fill: COLORS.gold,
      name: "room-name",
    });
    this.layer.add(this.roomName);

    this.layer.add(createButton({
      x: 20, y: 100,
      width: 140, height: 43,
      label: "Exit",
      name: "exit",
      onClick: () => this.exits.emit(),
    }));

    this.feedback = createText({
      y: PUZZLE.y + PUZZLE.height / 2 + 24, width: DESIGN_WIDTH,
      align: "center",
      fontSize: 36,
      visible: false,
      listening: false,
      name: "feedback",
    });
    this.layer.add(this.feedback);

    // App-scoped, like the screen itself, so these are never unsubscribed.
    notifications.subscribe(EventType.Correct, () => this.showFeedback("Correct!", COLORS.green));
    notifications.subscribe(EventType.Incorrect, () =>
      this.showFeedback(`Incorrect: −${WRONG_ANSWER_PENALTY_SECONDS} s`, COLORS.red));
  }

  /**
   * Shows the Room and builds a fresh puzzle of the Room's kind, replacing
   * any previous one, so the Room restarts from Step 1.
   */
  setRoom(room: Room): void {
    this.destroyPuzzle();
    this.clearFeedback();
    this.roomName.text(room.name);

    const puzzle = this.buildPuzzle(room);
    puzzle.onAnswer = (answer) => this.answers.emit(answer);
    this.puzzle = puzzle;
    this.feedback.moveToTop();
    this.layer.batchDraw();
  }

  setHud(timeRemainingMs: number, timeLimitMs: number, money: number): void {
    this.hud.setHud(timeRemainingMs, timeLimitMs, money);
  }

  onAnswer(cb: (answer: StepAnswer) => void): Unsubscribe {
    return this.answers.add(cb);
  }

  onExit(cb: () => void): Unsubscribe {
    return this.exits.add(cb);
  }

  show(): void {
    this.layer.show();
    this.layer.batchDraw();
  }

  /** Leaving the Room drops the puzzle (and its text box) along with its progress. */
  hide(): void {
    this.destroyPuzzle();
    this.clearFeedback();
    this.layer.hide();
  }

  private buildPuzzle(room: Room): Puzzle {
    const panel = {
      layer: this.layer,
      x: PUZZLE.x,
      y: PUZZLE.y,
      width: PUZZLE.width,
      height: PUZZLE.height,
    };
    const { puzzle } = room;
    switch (puzzle.type) {
      case "multistep": {
        const inputType: PuzzleInputType = Math.random() < 0.5 ? "keypad" : "typed";
        return new BasicMultistepPuzzle(room.question.prompt, {
          ...panel,
          spacing: PUZZLE.spacing,
          blockSize: PUZZLE.blockSize,
          panelColor: PANEL_COLOR,
          inputType,
        });
      }
      case "powerBox":
        return new PowerBoxPuzzle(puzzle.pairs, {
          ...panel,
          backdrop: { width: DESIGN_WIDTH, height: DESIGN_HEIGHT },
        });
      case "laser":
        return new LaserMatchPuzzle(puzzle.questions, { ...panel, panelColor: PANEL_COLOR });
      default: {
        const unknown: never = puzzle;
        throw new Error(`Unknown Room puzzle: ${JSON.stringify(unknown)}`);
      }
    }
  }

  private destroyPuzzle(): void {
    this.puzzle?.destroy();
    this.puzzle = null;
  }

  private showFeedback(text: string, color: string): void {
    this.clearFeedback();
    this.feedback.text(text);
    this.feedback.fill(color);
    this.feedback.visible(true);
    this.layer.batchDraw();
    this.feedbackTimer = setTimeout(() => this.clearFeedback(), FEEDBACK_MS);
  }

  private clearFeedback(): void {
    if (this.feedbackTimer !== null) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = null;
    this.feedback.visible(false);
    this.layer.batchDraw();
  }
}
