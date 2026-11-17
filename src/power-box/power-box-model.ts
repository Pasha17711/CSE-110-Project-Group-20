import type { Question, StepAnswer } from "../questions/Question";
import type { PowerBoxPair } from "./power-box-generator";

/** What each wire asks, shown with a wrong wire on the Review Answers screen. */
export const POWER_BOX_STEP_PROMPT = "Wire the equation to its value of x";

/** What happened when the player connected a wire. */
export interface MatchResult {
  correct: boolean;
  /** Sent on to AnswerValidator (via onAnswer), like every other puzzle's Step. */
  answer: StepAnswer;
  /** The Question the player was trying to answer (the left side of the wire). */
  question: Question;
}

/**
 * The state of one power box: which equation goes with which answer, and
 * which wires are already connected. No drawing here (see PowerBoxView).
 *
 * Left side = each Question's equation (prompt), in `pairs` order.
 * Right side = each Question's answer, in `rightOrder` order (indexes into `pairs`).
 * Each connection attempt is one Step, and each wire is a Question of one
 * Step, so every Answer is that Question's last Step (`isLastStep`). The
 * Answer that connects the last wire also solves the Room (`solvesRoom`).
 */
export class PowerBoxModel {
  private readonly pairs: readonly PowerBoxPair[];
  private readonly rightOrder: readonly number[];
  private readonly matchedLeft = new Set<number>();

  constructor(pairs: readonly PowerBoxPair[], rightOrder: readonly number[]) {
    if (pairs.length === 0) throw new RangeError("A power box needs at least one pair");
    const answers = pairs.map((pair) => pair.question.answer.trim());
    if (new Set(answers).size !== answers.length) {
      throw new RangeError("Every pair needs a different answer, so each equation has one match");
    }
    const sorted = [...rightOrder].sort((a, b) => a - b);
    if (sorted.length !== pairs.length || sorted.some((value, index) => value !== index)) {
      throw new RangeError("rightOrder must list every pair exactly once");
    }
    this.pairs = pairs;
    this.rightOrder = rightOrder;
  }

  get size(): number {
    return this.pairs.length;
  }

  /** Left column, top to bottom: the equations. */
  equations(): string[] {
    return this.pairs.map((pair) => pair.question.prompt);
  }

  /** Right column, top to bottom: the answers, shuffled. */
  answers(): string[] {
    return this.rightOrder.map((pairIndex) => this.pairs[pairIndex].question.answer.trim());
  }

  /** The Question on left-side row `left`. */
  questionAt(left: number): Question {
    this.checkIndex(left);
    return this.pairs[left].question;
  }

  /** The right-side row that holds the answer for left-side row `left`. */
  correctRightFor(left: number): number {
    this.checkIndex(left);
    return this.rightOrder.indexOf(left);
  }

  isLeftMatched(left: number): boolean {
    this.checkIndex(left);
    return this.matchedLeft.has(left);
  }

  isRightMatched(right: number): boolean {
    this.checkIndex(right);
    return this.matchedLeft.has(this.rightOrder[right]);
  }

  get matchedCount(): number {
    return this.matchedLeft.size;
  }

  /** All wires connected: the security system is off. */
  isFinished(): boolean {
    return this.matchedCount === this.size;
  }

  /**
   * Tries to connect left row `left` to right row `right`. A correct match
   * stays connected; a wrong one changes nothing (the time penalty comes from
   * AnswerValidator). Connecting a wire that is already connected is a bug in
   * the caller, so it throws.
   */
  match(left: number, right: number): MatchResult {
    if (this.isLeftMatched(left) || this.isRightMatched(right)) {
      throw new Error("That wire is already connected");
    }
    const correct = this.rightOrder[right] === left;
    // Only a correct match can finish the box. (With one wire left, the only
    // free left and right rows belong together, so a wrong try can't happen
    // there anyway; checking `correct` keeps that from depending on it.)
    const solvesRoom = correct && this.matchedCount === this.size - 1;
    if (correct) this.matchedLeft.add(left);

    const question = this.pairs[left].question;
    return {
      correct,
      question,
      answer: {
        playerAnswer: this.answers()[right],
        correctAnswer: question.answer.trim(),
        isLastStep: true,
        stepPrompt: POWER_BOX_STEP_PROMPT,
        question,
        solvesRoom,
      },
    };
  }

  private checkIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) {
      throw new RangeError(`No row ${index} on this power box`);
    }
  }
}
