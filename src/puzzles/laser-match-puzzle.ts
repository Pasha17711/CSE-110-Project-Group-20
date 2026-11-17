import Konva from 'konva';

import GraphMatchModel from '../graph/graph-match-model';
import LaserMatchView from '../graph/laser-match-view';

import type { Question, StepAnswer } from '../questions/Question';
import type Puzzle from './puzzle';

export interface LaserMatchPuzzleOptions {
  layer: Konva.Layer;
  x: number;
  y: number;
  width: number;
  height: number;
  panelColor?: string;
}

/** What each pair asks, shown with a wrong match on the Review Answers screen. */
export const LASER_STEP_PROMPT = 'Pick the graph of this equation';

/**
 * The Laser Match minigame: equations on the left, their graphs shuffled on
 * the right. Like PowerBoxPuzzle it doesn't make its own Questions: they are
 * made once per Heist with `generateLaserQuestions(difficulty)` and passed in,
 * so leaving and re-entering the Room shows the same equations.
 *
 * Each pair is its own Question of one Step. Each Question's `answer` is the
 * equation `parseEquation` reads; its `prompt` is that equation as shown.
 */
class LaserMatchPuzzle implements Puzzle {
  private readonly questions: readonly Question[];
  private readonly view: LaserMatchView;
  private readonly matched = new Set<number>();
  private solvedCount: number = 0;

  /**
   * Called after each attempted equation/graph match. `answer.question` is
   * that equation's Question; `answer.solvesRoom` is true for the last pair.
   */
  public onAnswer?: (answer: StepAnswer) => void;
  /** Called after every pair has been matched and its laser has finished. */
  public onPuzzleFinished?: (solved: boolean) => void;

  /** Creates a laser matching puzzle with one row per Question. */
  public constructor(questions: readonly Question[], options: LaserMatchPuzzleOptions) {
    this.validateOptions(options);
    if (questions.length === 0) {
      throw Error('LaserMatchPuzzle needs at least one Question.');
    }
    this.questions = questions;
    const model = new GraphMatchModel();
    questions.forEach(question => model.addGraph(question.answer));
    this.view = new LaserMatchView(options, model.graphs());
    this.connectComponents();
  }

  private validateOptions(options: LaserMatchPuzzleOptions): void {
    if (!options.layer.getStage()) {
      throw Error('LaserMatchPuzzle requires a layer attached to a Konva stage.');
    }
    if (!Number.isFinite(options.width) || options.width <= 0) {
      throw Error('LaserMatchPuzzle width must be a positive number.');
    }
    if (!Number.isFinite(options.height) || options.height <= 0) {
      throw Error('LaserMatchPuzzle height must be a positive number.');
    }
  }

  private connectComponents(): void {
    this.view.onMatch = (equation, graph) => {
      const index = this.questions.findIndex(question => question.answer === equation);
      if (index < 0 || this.matched.has(index) || this.matched.has(graph)) return;

      const question = this.questions[index];
      const correct = graph === index;
      if (correct) this.matched.add(index);
      const answer: StepAnswer = {
        playerAnswer: this.questions[graph].prompt,
        correctAnswer: question.prompt,
        isLastStep: true,
        stepPrompt: LASER_STEP_PROMPT,
        question,
        solvesRoom: correct && this.matched.size === this.questions.length,
      };

      // Draw first: a solving Answer can close the Room, which destroys the view.
      if (correct) {
        this.view.solve(equation);
      } else {
        this.view.incorrect(equation, graph);
      }
      this.onAnswer?.(answer);
    };
    this.view.onSolved = () => {
      this.solvedCount++;
      if (this.solvedCount === this.questions.length) {
        this.onPuzzleFinished?.(true);
      }
    };
  }

  /** Removes the puzzle view and clears its callbacks. */
  public destroy(): void {
    this.onAnswer = undefined;
    this.onPuzzleFinished = undefined;
    this.view.onMatch = undefined;
    this.view.onSolved = undefined;
    this.view.destroy();
  }
}

export default LaserMatchPuzzle;
