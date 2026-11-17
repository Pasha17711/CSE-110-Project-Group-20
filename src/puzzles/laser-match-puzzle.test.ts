import { describe, expect, it, vi } from 'vitest';

vi.mock('konva', () => import('../screens/testing/fakeKonva'));

type MockView = {
  onMatch?: (equation: string, graph: number) => void;
  onSolved?: (equation: string) => void;
  solve: ReturnType<typeof vi.fn>;
  incorrect: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

const views = vi.hoisted(() => [] as MockView[]);

vi.mock('../graph/laser-match-view', () => ({
  default: class MockLaserMatchView {
    public onMatch?: (equation: string, graph: number) => void;
    public onSolved?: (equation: string) => void;
    public solve = vi.fn();
    public incorrect = vi.fn();
    public destroy = vi.fn();

    public constructor() {
      views.push(this);
    }
  },
}));

import Konva from 'konva';
import LaserMatchPuzzle, { LASER_STEP_PROMPT } from './laser-match-puzzle';
import type { Question, StepAnswer } from '../questions/Question';

const QUESTIONS: Question[] = [
  { prompt: 'y = x + 1', answer: 'y = 1 * x + 1' },
  { prompt: 'y = 2x + 1', answer: 'y = 2 * x + 1' },
  { prompt: 'y = 3x + 1', answer: 'y = 3 * x + 1' },
];

function createPuzzle(): { puzzle: LaserMatchPuzzle; view: MockView; answers: StepAnswer[] } {
  const stage = new Konva.Stage({});
  const layer = new Konva.Layer();
  stage.add(layer);

  const puzzle = new LaserMatchPuzzle(QUESTIONS, { layer, x: 0, y: 0, width: 300, height: 200 });
  const answers: StepAnswer[] = [];
  puzzle.onAnswer = answer => answers.push(answer);

  return { puzzle, view: views.pop() as MockView, answers };
}

describe('LaserMatchPuzzle', () => {
  it('reports a wrong match as a Step of that equation\'s Question, with the shown equations', () => {
    const { view, answers } = createPuzzle();

    view.onMatch?.('y = 2 * x + 1', 0);

    expect(view.incorrect).toHaveBeenCalledWith('y = 2 * x + 1', 0);
    expect(answers).toEqual([{
      playerAnswer: 'y = x + 1',
      correctAnswer: 'y = 2x + 1',
      isLastStep: true,
      stepPrompt: LASER_STEP_PROMPT,
      question: QUESTIONS[1],
      solvesRoom: false,
    }]);
  });

  it('only the match that completes every pair solves the Room', () => {
    const { view, answers } = createPuzzle();

    view.onMatch?.('y = 1 * x + 1', 0);
    view.onMatch?.('y = 3 * x + 1', 1); // wrong
    view.onMatch?.('y = 2 * x + 1', 1);
    view.onMatch?.('y = 3 * x + 1', 2);

    expect(answers.map(a => a.solvesRoom)).toEqual([false, false, false, true]);
    expect(answers.map(a => a.question)).toEqual([QUESTIONS[0], QUESTIONS[2], QUESTIONS[1], QUESTIONS[2]]);
    expect(view.solve).toHaveBeenCalledTimes(3);
  });

  it('ignores a pair that is already matched (e.g. picked again while its laser blinks)', () => {
    const { view, answers } = createPuzzle();

    view.onMatch?.('y = 1 * x + 1', 0);
    view.onMatch?.('y = 1 * x + 1', 0);
    view.onMatch?.('y = 2 * x + 1', 0);

    expect(answers).toHaveLength(1);
    expect(view.solve).toHaveBeenCalledTimes(1);
  });

  it('draws the laser before reporting the Answer, so a solving Answer can close the Room', () => {
    const { puzzle, view } = createPuzzle();
    puzzle.onAnswer = () => puzzle.destroy();

    view.onMatch?.('y = 1 * x + 1', 0);

    expect(view.solve.mock.invocationCallOrder[0]).toBeLessThan(view.destroy.mock.invocationCallOrder[0]);
  });

  it('finishes after every pair\'s laser has finished', () => {
    const { puzzle, view } = createPuzzle();
    const onPuzzleFinished = vi.fn();
    puzzle.onPuzzleFinished = onPuzzleFinished;

    view.onSolved?.('y = 1 * x + 1');
    expect(onPuzzleFinished).not.toHaveBeenCalled();
    view.onSolved?.('y = 2 * x + 1');
    expect(onPuzzleFinished).not.toHaveBeenCalled();
    view.onSolved?.('y = 3 * x + 1');

    expect(onPuzzleFinished).toHaveBeenCalledTimes(1);
    expect(onPuzzleFinished).toHaveBeenCalledWith(true);
  });

  it('rejects an empty Question list', () => {
    const stage = new Konva.Stage({});
    const layer = new Konva.Layer();
    stage.add(layer);
    expect(() => new LaserMatchPuzzle([], { layer, x: 0, y: 0, width: 300, height: 200 })).toThrow();
  });
});
