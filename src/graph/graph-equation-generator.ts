import { Difficulty } from "../score";
import type { Question } from "../questions/Question";
import { equationFromConfig, formatGraphEquation } from "./graph";

/** Returns a number in [0, 1), like Math.random. Passed in so tests can be repeatable. */
export type RandomFn = () => number;

/** How many equation/graph pairs a Laser Match Room has. */
export const LASER_PAIR_COUNT = 3;

/** How many of the pairs are parabolas (the rest are lines) at each Difficulty. */
export const QUADRATIC_COUNT: Record<Difficulty, number> = {
  [Difficulty.Easy]: 0,
  [Difficulty.Medium]: 1,
  [Difficulty.Hard]: 2,
};

// Coefficients small enough that every graph crosses the default −3…3 window
// in a way the player can read off the axis ticks.
const SLOPES = [-2, -1, 1, 2];
const INTERCEPTS = [-2, -1, 0, 1, 2];
const LEADING = [-1, 1];
const LINEAR = [-1, 0, 1];

/** Gives up after this many tries if it still can't find different graphs. */
const MAX_ATTEMPTS = 1000;

function pick<T>(values: readonly T[], random: RandomFn): T {
  return values[Math.floor(random() * values.length)];
}

/**
 * The Questions for one Laser Match Room: one per equation/graph pair. Each
 * Question's `answer` is the equation in the form `parseEquation` reads (the
 * graph is drawn from it), and its `prompt` is that equation as shown to the
 * player (`formatGraphEquation`).
 *
 * No two equations are the same, and no two lines share a slope, so every
 * graph can be told apart by reading it.
 */
export function generateLaserQuestions(
  difficulty: Difficulty,
  random: RandomFn = Math.random,
): Question[] {
  const quadratics = QUADRATIC_COUNT[difficulty];
  const equations = new Set<string>();
  const slopes = new Set<number>();

  for (let attempt = 0; equations.size < LASER_PAIR_COUNT; attempt++) {
    if (attempt >= MAX_ATTEMPTS) {
      throw new Error(`Could not make ${LASER_PAIR_COUNT} different graph equations`);
    }
    const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 };
    let equation: string;
    if (equations.size < quadratics) {
      equation = equationFromConfig({
        ...bounds,
        a: pick(LEADING, random),
        b: pick(LINEAR, random),
        c: pick(INTERCEPTS, random),
      });
    } else {
      const slope = pick(SLOPES, random);
      if (slopes.has(slope)) continue;
      equation = equationFromConfig({ ...bounds, slope, yOffset: pick(INTERCEPTS, random) });
      if (!equations.has(equation)) slopes.add(slope);
    }
    equations.add(equation);
  }

  return [...equations].map((equation) => ({
    prompt: formatGraphEquation(equation),
    answer: equation,
  }));
}
