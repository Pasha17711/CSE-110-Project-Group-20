import Konva from 'konva';

import LaserMatchPuzzle from '../puzzles/laser-match-puzzle';
import { generateLaserQuestions } from './graph-equation-generator';
import { Difficulty } from '../score';

const stage = new Konva.Stage({
  container: 'container',
  width: window.innerWidth,
  height: window.innerHeight,
});

const layer = new Konva.Layer();
stage.add(layer);

const puzzle = new LaserMatchPuzzle(
  generateLaserQuestions(Difficulty.Medium),
  {
    layer,
    x: stage.width() / 2,
    y: stage.height() / 2,
    width: 800,
    height: 480,
    panelColor: '#4b5563',
  },
);

puzzle.onAnswer = answer => {
  console.log(`Selected graph ${answer.playerAnswer}; expected ${answer.correctAnswer}. Solves the Room? ${answer.solvesRoom}`);
};

puzzle.onPuzzleFinished = solved => {
  console.log(solved ? 'Puzzle solved!' : 'Puzzle failed.');
};
