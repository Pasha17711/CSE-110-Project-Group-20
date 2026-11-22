interface Fraction {
  numerator: number
  denominator: number
}

interface Polynomial {
  terms: Map<string, Fraction>
}

type Token = { kind: 'number' | 'identifier' | 'operator' | 'leftParen' | 'rightParen', text: string }

const gcd = (left: number, right: number): number => {
  left = Math.abs(left)
  right = Math.abs(right)
  while (right !== 0) [left, right] = [right, left % right]
  return left || 1
}

const fraction = (numerator: number, denominator = 1): Fraction => {
  if (denominator === 0) throw Error('Cannot divide by zero.')
  if (denominator < 0) [numerator, denominator] = [-numerator, -denominator]
  const divisor = gcd(numerator, denominator)
  return { numerator: numerator / divisor, denominator: denominator / divisor }
}

const add = (left: Fraction, right: Fraction): Fraction => fraction(
  left.numerator * right.denominator + right.numerator * left.denominator,
  left.denominator * right.denominator,
)

const multiply = (left: Fraction, right: Fraction): Fraction => fraction(
  left.numerator * right.numerator,
  left.denominator * right.denominator,
)

const divide = (left: Fraction, right: Fraction): Fraction => fraction(
  left.numerator * right.denominator,
  left.denominator * right.numerator,
)

const negate = (value: Fraction): Fraction => ({ numerator: -value.numerator, denominator: value.denominator })

const zero = (): Polynomial => ({ terms: new Map([['', fraction(0)]]) })
const constant = (value: Fraction): Polynomial => ({ terms: new Map([['', value]]) })
const variable = (name: string): Polynomial => ({ terms: new Map([[name, fraction(1)]]) })

const clean = (polynomial: Polynomial): Polynomial => {
  const terms = new Map<string, Fraction>()
  for (const [key, value] of polynomial.terms) {
    if (value.numerator !== 0) terms.set(key, value)
  }
  if (terms.size === 0) terms.set('', fraction(0))
  return { terms }
}

const addPolynomials = (left: Polynomial, right: Polynomial, rightSign = 1): Polynomial => {
  const terms = new Map(left.terms)
  for (const [key, value] of right.terms) {
    const signed = rightSign < 0 ? negate(value) : value
    terms.set(key, add(terms.get(key) ?? fraction(0), signed))
  }
  return clean({ terms })
}

const multiplyPolynomials = (left: Polynomial, right: Polynomial): Polynomial => {
  const terms = new Map<string, Fraction>()
  for (const [leftKey, leftValue] of left.terms) {
    for (const [rightKey, rightValue] of right.terms) {
      const factors = [...leftKey.split('*'), ...rightKey.split('*')].filter(Boolean).sort()
      const key = factors.join('*')
      terms.set(key, add(terms.get(key) ?? fraction(0), multiply(leftValue, rightValue)))
    }
  }
  return clean({ terms })
}

const dividePolynomial = (left: Polynomial, right: Polynomial): Polynomial => {
  if (right.terms.size !== 1 || !right.terms.has('')) {
    throw Error('Division by a variable expression is not supported.')
  }
  const divisor = right.terms.get('')!
  return clean({
    terms: new Map([...left.terms].map(([key, value]) => [key, divide(value, divisor)])),
  })
}

class Parser {
  private index = 0

  constructor(private readonly tokens: Token[]) {}

  parse(): Polynomial {
    const result = this.parseExpression()
    if (this.index !== this.tokens.length) throw Error('Unexpected token.')
    return result
  }

  private parseExpression(): Polynomial {
    let result = this.parseTerm()
    while (this.index < this.tokens.length && (this.peek('+') || this.peek('-'))) {
      const operator = this.tokens[this.index++].text
      result = addPolynomials(result, this.parseTerm(), operator === '+' ? 1 : -1)
    }
    return result
  }

  private parseTerm(): Polynomial {
    let result = this.parseUnary()
    while (this.index < this.tokens.length) {
      if (this.peek('*') || this.peek('/')) {
        const operator = this.tokens[this.index++].text
        const right = this.parseUnary()
        result = operator === '*' ? multiplyPolynomials(result, right) : dividePolynomial(result, right)
      } else if (this.isPrimaryStart(this.tokens[this.index])) {
        result = multiplyPolynomials(result, this.parseUnary())
      } else {
        break
      }
    }
    return result
  }

  private parseUnary(): Polynomial {
    if (this.peek('+') || this.peek('-')) {
      const negative = this.tokens[this.index++].text === '-'
      const result = this.parseUnary()
      return negative ? multiplyPolynomials(constant(fraction(-1)), result) : result
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Polynomial {
    const token = this.tokens[this.index++]
    if (!token) throw Error('Expected an expression.')
    if (token.kind === 'number') {
      const decimal = token.text.split('.')
      const denominator = decimal[1] ? 10 ** decimal[1].length : 1
      return constant(fraction(Number(token.text) * denominator, denominator))
    }
    if (token.kind === 'identifier') return variable(token.text)
    if (token.kind === 'leftParen') {
      const result = this.parseExpression()
      if (!this.peek(')')) throw Error('Missing closing parenthesis.')
      this.index++
      return result
    }
    throw Error('Expected a value.')
  }

  private peek(text: string): boolean {
    return this.tokens[this.index]?.text === text
  }

  private isPrimaryStart(token: Token): boolean {
    return token.kind === 'number' || token.kind === 'identifier' || token.kind === 'leftParen'
  }
}

const tokenize = (input: string): Token[] => {
  const tokens: Token[] = []
  for (let index = 0; index < input.length;) {
    const character = input[index]
    if (/\s/.test(character)) {
      index++
      continue
    }
    if (/\d|\./.test(character)) {
      const match = input.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/)
      if (!match) throw Error('Invalid number.')
      tokens.push({ kind: 'number', text: match[0] })
      index += match[0].length
      continue
    }
    if (/[A-Za-z]/.test(character)) {
      const match = input.slice(index).match(/^[A-Za-z]+/)! 
      tokens.push({ kind: 'identifier', text: match[0] })
      index += match[0].length
      continue
    }
    if ('+-*/'.includes(character)) {
      tokens.push({ kind: 'operator', text: character })
      index++
      continue
    }
    if (character === '(' || character === ')') {
      tokens.push({ kind: character === '(' ? 'leftParen' : 'rightParen', text: character })
      index++
      continue
    }
    throw Error(`Unexpected character: ${character}`)
  }
  if (tokens.length === 0) throw Error('Expression is empty.')
  return tokens
}

const fractionText = (value: Fraction): string => value.denominator === 1
  ? `${value.numerator}`
  : `${value.numerator}/${value.denominator}`

export const canonicalizeArithmeticExpression = (input: string): string => {
  const polynomial = new Parser(tokenize(input)).parse()
  return [...polynomial.terms.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${fractionText(value)}${key ? `*${key}` : ''}`)
    .join('+')
}

export const equivalentArithmeticExpressions = (left: string, right: string): boolean => {
  try {
    return canonicalizeArithmeticExpression(left) === canonicalizeArithmeticExpression(right)
  } catch {
    return false
  }
}
