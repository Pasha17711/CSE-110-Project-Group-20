import MultistepSolverModel from './multistep-solver-model'
import type { Term } from './types'

/** Search limits, so an unusual equation can never freeze the game. */
const MAX_STEPS = 16
const MAX_STATES = 4000

/**
 * The fewest Steps left to solve `model`'s equation. The model is not changed.
 *
 * A Step is one Answer the player gets right: picking the operation that
 * moves a term (or removes a negative sign), or one piece of arithmetic.
 * Waiting arithmetic always comes next, as the puzzle requires.
 *
 * Players may move terms in any order and some orders take longer, so this
 * is the shortest way on from where the equation is now. Returns 0 when the
 * equation is already solved.
 */
export function stepsLeft(model: MultistepSolverModel): number {
  const start = copyModel(model)
  const startArithmetic = solveArithmetic(start)
  if (startArithmetic === null) return 0

  // Uniform-cost search: a move costs 1 Step plus the arithmetic it causes.
  const queue: Array<{ state: MultistepSolverModel, steps: number }> = [{ state: start, steps: startArithmetic }]
  const best = new Map<string, number>([[keyOf(start), startArithmetic]])

  while (queue.length > 0) {
    queue.sort((a, b) => a.steps - b.steps)
    const { state, steps } = queue.shift()!
    if (isSolved(state)) return steps
    if (steps >= MAX_STEPS || best.size > MAX_STATES) break

    for (const move of possibleMoves(state)) {
      const scratch = copyModel(state)
      try {
        move(scratch)
      } catch {
        continue
      }
      const arithmetic = solveArithmetic(scratch)
      if (arithmetic === null) continue

      const total = steps + 1 + arithmetic
      const key = keyOf(scratch)
      if ((best.get(key) ?? Infinity) <= total) continue
      best.set(key, total)
      queue.push({ state: scratch, steps: total })
    }
  }

  // Nothing found within the limits: guess one more move and its arithmetic.
  return startArithmetic + 2
}

/** Every move the player could make: move any value term, or remove a negative sign. */
function possibleMoves(model: MultistepSolverModel): Array<(scratch: MultistepSolverModel) => void> {
  const moves: Array<(scratch: MultistepSolverModel) => void> = []
  model.getLeftSide().forEach((term, index) => {
    if (typeof term !== 'string') moves.push(scratch => scratch.moveLeftTerm(index))
  })
  model.getRightSide().forEach((term, index) => {
    if (typeof term !== 'string') moves.push(scratch => scratch.moveRightTerm(index))
  })
  moves.push(scratch => scratch.removeNegativeSign(true))
  moves.push(scratch => scratch.removeNegativeSign(false))
  return moves
}

/** Does all waiting arithmetic; returns how many Steps that took, or null if it failed. */
function solveArithmetic(model: MultistepSolverModel): number | null {
  let steps = 0
  try {
    while (model.arithmeticProblems().length > 0) {
      model.solve()
      steps++
      if (steps > MAX_STEPS) return null
    }
  } catch {
    return null
  }
  return steps
}

function copyModel(model: MultistepSolverModel): MultistepSolverModel {
  const copy = (term: Term): Term => (typeof term === 'string' ? term : { ...term })
  const scratch = new MultistepSolverModel()
  model.getLeftSide().forEach(term => scratch.addLeft(copy(term)))
  model.getRightSide().forEach(term => scratch.addRight(copy(term)))
  return scratch
}

function keyOf(model: MultistepSolverModel): string {
  return JSON.stringify([model.getLeftSide(), model.getRightSide()])
}

/** True for `x = n` or `n = x` (a lone positive variable against a lone constant). */
function isSolved(model: MultistepSolverModel): boolean {
  const left = model.getLeftSide()
  const right = model.getRightSide()
  const isVariable = (side: Array<Term>): boolean =>
    side.length === 1 && typeof side[0] !== 'string' && !side[0].constant && side[0].positive
  const isConstant = (side: Array<Term>): boolean =>
    side.length === 1 && typeof side[0] !== 'string' && side[0].constant
  return (isVariable(left) && isConstant(right)) || (isConstant(left) && isVariable(right))
}

/** The solved equation as the player should read it, e.g. `x = 7` or `x = -3/4`. */
export function answerText(model: MultistepSolverModel): string {
  const sides = [model.getLeftSide(), model.getRightSide()]
  const variable = sides.find(side => side.length === 1 && typeof side[0] !== 'string' && !side[0].constant)
  const constant = sides.find(side => side.length === 1 && typeof side[0] !== 'string' && side[0].constant)
  if (!variable || !constant) return ''
  const v = variable[0] as Exclude<Term, string>
  const c = constant[0] as Exclude<Term, string>
  return `${v.term} = ${c.positive ? '' : '-'}${c.term}`
}
