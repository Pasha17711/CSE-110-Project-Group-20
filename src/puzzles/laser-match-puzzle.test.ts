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
import LaserMatchPuzzle from './laser-match-puzzle';

function createPuzzle(): { puzzle: LaserMatchPuzzle; view: MockView } {
  const stage = new Konva.Stage({});
  const layer = new Konva.Layer();
  stage.add(layer);

  const puzzle = new LaserMatchPuzzle(
    'y = 1 * x + 1',
    'y = 2 * x + 1',
    'y = 3 * x + 1',
    { layer, x: 0, y: 0, width: 300, height: 200 },
  );

  return { puzzle, view: views.pop() as MockView };
}

describe('LaserMatchPuzzle', () => {
  it('does not count an incorrect match toward the final step', () => {
    const { puzzle, view } = createPuzzle();
    const answers: Array<{ isLastStep: boolean }> = [];
    puzzle.onAnswer = answer => answers.push({ isLastStep: answer.isLastStep });

    view.onSolved?.('y = 1 * x + 1');
    view.onMatch?.('y = 2 * x + 1', 0);
    view.onMatch?.('y = 3 * x + 1', 2);

    expect(view.incorrect).toHaveBeenCalledWith('y = 2 * x + 1', 0);
    expect(answers).toEqual([
      { isLastStep: false },
      { isLastStep: false },
    ]);
  });

  it('finishes after three correctly solved matches', () => {
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
});
