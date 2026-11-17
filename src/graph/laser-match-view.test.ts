import { describe, expect, it, vi } from 'vitest';

vi.mock('konva', () => import('../screens/testing/fakeKonva'));

import Konva from 'konva';
import type { FakeNode } from '../screens/testing/fakeKonva';
import LaserMatchView from './laser-match-view';

describe('LaserMatchView', () => {
  it('fills the graph radio button when the graph itself is clicked', () => {
    const stage = new Konva.Stage({});
    const layer = new Konva.Layer();
    stage.add(layer);
    const graph = new Konva.Group();
    const view = new LaserMatchView(
      { layer, x: 0, y: 0, width: 300, height: 200 },
      [['y = 1 * x + 1', graph]],
    );

    graph.fire('click');

    const root = layer.getChildren()[0] as unknown as FakeNode;
    const graphRadio = root.getChildren().find(child => child.x() === 165);
    expect(graphRadio?.getChildren()[1].fill()).toBe('#ffffff');

    view.destroy();
  });
});
