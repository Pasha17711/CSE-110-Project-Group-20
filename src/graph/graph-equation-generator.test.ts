import { describe, expect, it } from "vitest";
import { Difficulty } from "../score";
import { formatGraphEquation, parseEquation } from "./graph";
import { generateLaserQuestions, LASER_PAIR_COUNT, QUADRATIC_COUNT } from "./graph-equation-generator";

const DIFFICULTIES = [Difficulty.Easy, Difficulty.Medium, Difficulty.Hard];

/** A repeatable stand-in for Math.random. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

describe("generateLaserQuestions", () => {
  it.each(DIFFICULTIES)("makes %s's mix of lines and parabolas", (difficulty) => {
    const questions = generateLaserQuestions(difficulty, seeded(7));

    expect(questions).toHaveLength(LASER_PAIR_COUNT);
    const parabolas = questions.filter((q) => parseEquation(q.answer).a !== undefined);
    expect(parabolas).toHaveLength(QUADRATIC_COUNT[difficulty]);
  });

  it("answers are equations parseEquation reads; prompts are how they're shown", () => {
    for (const question of generateLaserQuestions(Difficulty.Hard, seeded(3))) {
      expect(() => parseEquation(question.answer)).not.toThrow();
      expect(question.prompt).toBe(formatGraphEquation(question.answer));
    }
  });

  it("never repeats an equation or a line's slope", () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const difficulty of DIFFICULTIES) {
        const questions = generateLaserQuestions(difficulty, seeded(seed));
        expect(new Set(questions.map((q) => q.answer)).size).toBe(LASER_PAIR_COUNT);
        const slopes = questions.map((q) => parseEquation(q.answer).slope).filter((s) => s !== undefined);
        expect(new Set(slopes).size).toBe(slopes.length);
      }
    }
  });

  it("gives up instead of looping forever when random can't vary", () => {
    expect(() => generateLaserQuestions(Difficulty.Easy, () => 0)).toThrow(/different graph equations/);
  });
});
