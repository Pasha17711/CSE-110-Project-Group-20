import type { StepAnswer } from '../questions/Question'

export default interface Puzzle {
  onAnswer?: (answer: StepAnswer) => void;
  onPuzzleFinished?: (solved: boolean) => void;
  /** Suspend external controls (such as HTML inputs) while a screen modal covers the canvas. */
  setInteractionEnabled?(enabled: boolean): void;
  destroy(): void;
}
