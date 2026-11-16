/**
 * A fake BasicMultistepPuzzle for screen tests, used with
 * `vi.mock("../puzzles/basic-multistep-puzzle", () => import("./testing/fakePuzzle"))`.
 */
import type { StepAnswer } from "../../questions/Question";

export const created: FakePuzzle[] = [];

export class FakePuzzle {
  destroyed = false;
  interactionEnabled = true;
  onAnswer?: (answer: StepAnswer) => void;
  onPuzzleFinished?: (solved: boolean) => void;

  constructor(readonly equation: string, readonly options: Record<string, unknown>) {
    created.push(this);
  }

  destroy(): void {
    this.destroyed = true;
  }

  setInteractionEnabled(enabled: boolean): void {
    this.interactionEnabled = enabled;
  }

  /** Simulates the player answering a Step. */
  answer(answer: StepAnswer): void {
    this.onAnswer?.(answer);
  }
}

export default FakePuzzle;
