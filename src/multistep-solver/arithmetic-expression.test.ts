import { describe, expect, it } from 'vitest'

import { canonicalizeArithmeticExpression, equivalentArithmeticExpressions } from './arithmetic-expression'

describe('arithmetic expression canonicalization', () => {
  it.each([
    ['x * 3', '3 * x'],
    ['x * 3', '3*x'],
    ['x * 3', '3x'],
    ['3/2 * x', 'x * 1.5'],
    ['x / 2', '0.5x'],
    ['x + 7/4 * x', 'x + 1.75x'],
  ])('recognizes equivalent forms: %s and %s', (left, right) => {
    expect(equivalentArithmeticExpressions(left, right)).toBe(true)
  })

  it('canonicalizes multiplication order and numeric factors', () => {
    expect(canonicalizeArithmeticExpression(' 3 / 2 * x ')).toBe('3/2*x')
    expect(canonicalizeArithmeticExpression('3x + x')).toBe('4*x')
  })

  it.each(['', 'x / y', 'x +', 'x ** 3', 'x + unknown!'])('rejects unsupported or malformed input: %s', input => {
    expect(equivalentArithmeticExpressions(input, 'x')).toBe(false)
  })
})
