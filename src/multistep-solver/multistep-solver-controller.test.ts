import { describe, expect, it } from 'vitest'

import MultistepSolverController from './multistep-solver-controller'
import MultistepSolverModel from './multistep-solver-model'
import { Term, variableTerm } from './types'

const numberTerm = (term: string, positive = true): Term => ({
  term,
  positive,
  constant: true,
})

const fakeView = () => ({
  update: () => undefined,
  showDropzone: () => undefined,
  hideDropzone: () => undefined,
  clearDropzone: () => undefined,
}) as any

describe('MultistepSolverController', () => {
  it.each([
    [
      'x * 5 + 3 = 8',
      [
        { term: 'x', positive: true, constant: false }, '*',
        numberTerm('5'), numberTerm('3'),
      ],
      [numberTerm('8')],
    ],
    [
      '-x * 5 = -5',
      [
        { term: 'x', positive: false, constant: false }, '*', numberTerm('5'),
      ],
      [numberTerm('5', false)],
    ],
    [
      '3 - 8 = -x * 5',
      [numberTerm('3'), numberTerm('8', false)],
      [
        { term: 'x', positive: false, constant: false }, '*', numberTerm('5'),
      ],
    ],
    [
      'x / 2 - 3/5 = 4',
      [
        { term: 'x', positive: true, constant: false }, '/', numberTerm('2'),
        numberTerm('3/5', false),
      ],
      [numberTerm('4')],
    ],
  ])('parses %s into normalized model sides', (equation, expectedLeft, expectedRight) => {
    const model = new MultistepSolverModel()
    const controller = new MultistepSolverController(model, fakeView())

    controller.setEquation(equation)

    expect(model.getLeftSide()).toEqual(expectedLeft)
    expect(model.getRightSide()).toEqual(expectedRight)
  })

  it.each([
    '',
    'x * 5',
    'x =',
    '= 5',
    'x ** 5 = 5',
    'x + = 5',
    'x * 5a = 5',
    'x * 5 = 5 = 5',
  ])('rejects invalid equation %s', equation => {
    const model = new MultistepSolverModel()
    const controller = new MultistepSolverController(model, fakeView())

    expect(() => controller.setEquation(equation)).toThrow()
  })

  it.each([
    'x = 5',
    '5 = x',
  ])('starts solved equations in Finished state: %s', equation => {
    const controller = new MultistepSolverController(new MultistepSolverModel(), fakeView())

    controller.setEquation(equation)

    expect(controller.getState()).toBe('Finished')
  })

  it('does not treat a negative variable equation as solved', () => {
    const controller = new MultistepSolverController(new MultistepSolverModel(), fakeView())

    controller.setEquation('-x = -5')

    expect(controller.getState()).not.toBe('Finished')
  })

  it('adds a negative divided variable term when it is moved across the equation', () => {
    const model = new MultistepSolverModel()
    const controller = new MultistepSolverController(model, fakeView())
    const submissions: Array<[string, string]> = []
    controller.onAnswerSubmit = (_question, answer, correct) => {
      submissions.push([answer as string, correct as string])
    }

    controller.setEquation('-x / 5 = 10')
    expect(model.getLeftSide()).toEqual([
      variableTerm('x', false), '/', numberTerm('5'),
    ])
    controller.operation(0, true)
    controller.moveRequest('+')

    expect(submissions.at(-1)).toEqual(['+', '+'])
    controller.step()
    expect(model.getRightSide()).toEqual([
      numberTerm('10'),
      variableTerm('x', true), '/', numberTerm('5'),
    ])
  })

  it('keeps the variable sign and uses the whole negative product for -2 * x', () => {
    const model = new MultistepSolverModel()
    const controller = new MultistepSolverController(model, fakeView())
    const submissions: Array<[string, string]> = []
    controller.onAnswerSubmit = (_question, answer, correct) => {
      submissions.push([answer as string, correct as string])
    }

    controller.setEquation('-2 * x = 10')

    expect(model.getLeftSide()).toEqual([
      numberTerm('2', false), '*', variableTerm('x', true),
    ])
    expect(model.getDisplaySide(true).map(({ modelIndex, term }) => ({ modelIndex, term }))).toEqual([
      { modelIndex: 0, term: numberTerm('2', false) },
      { modelIndex: 0, term: '*'},
      { modelIndex: 0, term: variableTerm('x', true) },
    ])

    controller.operation(0, true)
    controller.moveRequest('+')
    expect(submissions.at(-1)).toEqual(['+', '+'])
  })

  it('uses multiplication when dragging a divisor coefficient', () => {
    const model = new MultistepSolverModel()
    const controller = new MultistepSolverController(model, fakeView())
    const submissions: Array<[string, string]> = []
    controller.onAnswerSubmit = (_question, answer, correct) => {
      submissions.push([answer as string, correct as string])
    }

    controller.setEquation('x / 2 = 10')
    controller.operation(2, true, true)
    controller.moveRequest('*')
    expect(submissions.at(-1)).toEqual(['*', '*'])
    controller.step()

    expect(model.getLeftSide()).toEqual([
      variableTerm('x', true),
    ])
    expect(model.getRightSide()).toEqual([
      numberTerm('10'), '*', numberTerm('2'),
    ])
  })

  it('uses division when dragging a leading coefficient', () => {
    const model = new MultistepSolverModel()
    const controller = new MultistepSolverController(model, fakeView())
    const submissions: Array<[string, string]> = []
    controller.onAnswerSubmit = (_question, answer, correct) => {
      submissions.push([answer as string, correct as string])
    }

    controller.setEquation('3 * x = 10')
    controller.operation(0, true, true)
    controller.moveRequest('/')
    expect(submissions.at(-1)).toEqual(['/', '/'])
    controller.step()

    expect(model.getLeftSide()).toEqual([variableTerm('x', true)])
    expect(model.getRightSide()).toEqual([
      numberTerm('10'), '/', numberTerm('3'),
    ])
  })

  describe('isLastStep', () => {
    const solveWithSubmissions = (equation: string) => {
      const submissions: Array<[string, string, boolean]> = []
      const model = new MultistepSolverModel()
      const controller = new MultistepSolverController(model, fakeView())
      controller.onAnswerSubmit = (_q, playerAnswer, correctAnswer, isLastStep) => {
        submissions.push([playerAnswer, correctAnswer, isLastStep])
        if (playerAnswer === correctAnswer) controller.step()
      }
      controller.setEquation(equation)
      return { controller, submissions }
    }

    it('is true only for the arithmetic that leaves x = n', () => {
      const { controller, submissions } = solveWithSubmissions('x * 5 + 3 = 8')

      controller.operation(3, true) // + 3
      controller.moveRequest('-')
      controller.arithmetic('5') // 8 - 3
      controller.operation(2, true) // * 5
      controller.moveRequest('/')
      controller.arithmetic('1') // 5 / 5

      expect(submissions).toEqual([
        ['-', '-', false],
        ['5', '5', false],
        ['/', '/', false],
        ['1', '1', true],
      ])
      expect(controller.getState()).toBe('Finished')
    })

    it('reports the last Step the same way when the Answer is wrong', () => {
      const { controller, submissions } = solveWithSubmissions('x * 5 = 10')

      controller.operation(2, true)
      controller.moveRequest('/')
      controller.arithmetic('3')

      expect(submissions.at(-1)).toEqual(['3', '2', true])
      expect(controller.getState()).toBe('Arithmetic')
    })

    it('is false for removing a negative sign, which still leaves a product', () => {
      const { controller, submissions } = solveWithSubmissions('-x * 5 = -10')

      controller.removeNegativeSign(true)
      controller.moveRequest('*')

      expect(submissions).toEqual([['*', '*', false]])
      expect(controller.getState()).not.toBe('Finished')
    })

    it('does not change the real equation while checking', () => {
      const model = new MultistepSolverModel()
      const controller = new MultistepSolverController(model, fakeView())
      controller.setEquation('x * 5 + 3 = 8')
      const before = JSON.stringify([model.getLeftSide(), model.getRightSide()])

      controller.operation(3, true)
      controller.moveRequest('-')

      expect(JSON.stringify([model.getLeftSide(), model.getRightSide()])).toBe(before)
    })
  })

  describe('onArithmeticStep', () => {
    const watch = (equation: string) => {
      const expressions: string[] = []
      const controller = new MultistepSolverController(new MultistepSolverModel(), fakeView())
      controller.onArithmeticStep = expression => expressions.push(expression)
      controller.onAnswerSubmit = (_q, playerAnswer, correctAnswer) => {
        if (playerAnswer === correctAnswer) controller.step()
      }
      controller.setEquation(equation)
      return { controller, expressions }
    }

    it('fires with the expression when an Arithmetic Step begins', () => {
      const { controller, expressions } = watch('x + 3 = 8')

      controller.operation(1, true) // + 3
      controller.moveRequest('-')

      expect(controller.getState()).toBe('Arithmetic')
      expect(expressions).toEqual(['8 - 3'])
    })

    it('fires again for an Arithmetic Step that directly follows another', () => {
      const { controller, expressions } = watch('x + 3 = 8 + 4')

      controller.operation(1, true) // + 3
      controller.moveRequest('-')
      controller.arithmetic('12') // 8 + 4

      expect(controller.getState()).toBe('Arithmetic')
      expect(expressions).toEqual(['8 + 4', '12 - 3'])
    })

    it('does not fire for an Operation Step', () => {
      const { controller, expressions } = watch('x + 3 = 8')

      controller.operation(1, true)
      controller.moveRequest('+') // wrong, so the Step stays open

      expect(controller.getState()).toBe('Operation')
      expect(expressions).toEqual([])
    })

    it('does not fire again after an incorrect Answer', () => {
      const { controller, expressions } = watch('x + 3 = 8')

      controller.operation(1, true)
      controller.moveRequest('-')
      controller.arithmetic('4')

      expect(expressions).toEqual(['8 - 3'])
    })

    it('does not fire when the Step leaves the equation solved', () => {
      const { controller, expressions } = watch('x + 3 = 8')

      controller.operation(1, true)
      controller.moveRequest('-')
      controller.arithmetic('5')

      expect(controller.getState()).toBe('Finished')
      expect(expressions).toEqual(['8 - 3'])
    })
  })

  describe('arithmetic answer matching', () => {
    it.each(['x * 4', '4 * x', '4*x', '4x'])('accepts equivalent answer notation: %s', answer => {
      const model = new MultistepSolverModel()
      const controller = new MultistepSolverController(model, fakeView())
      let submitted: [string, string] | undefined
      controller.onAnswerSubmit = (_question, playerAnswer, correctAnswer) => {
        submitted = [playerAnswer, correctAnswer]
      }

      controller.setEquation('x * 3 + x = 10 + 1')
      controller.operation(1, false)
      controller.moveRequest('-')
      controller.step()
      submitted = undefined
      controller.arithmetic(answer)

      expect(submitted).toEqual([answer, '4 * x'])
      controller.step()
      expect(controller.getState()).toBe('Idle')
    })

    it('does not accept a mathematically different expression', () => {
      const controller = new MultistepSolverController(new MultistepSolverModel(), fakeView())
      controller.setEquation('x * 3 + x = 10 + 1')
      controller.operation(1, false)
      controller.moveRequest('-')
      controller.step()
      controller.arithmetic('x * 5')
      controller.step()

      expect(controller.getState()).toBe('Arithmetic')
    })
  })
})
