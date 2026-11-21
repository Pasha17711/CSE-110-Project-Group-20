import { beforeEach, describe, expect, it, vi } from 'vitest'

// The real model and controller run; the Konva-drawn parts are fakes that
// record what the puzzle does to them and expose the callbacks it assigns.
const fakes = vi.hoisted(() => ({
  view: null as any,
  actionMenu: null as any,
  input: null as any,
}))

vi.mock('konva', () => {
  class FakeText {
    attrs: Record<string, any>
    destroyed = false
    constructor(config: Record<string, any> = {}) {
      this.attrs = { ...config }
    }
    text(value?: string) {
      if (value !== undefined) this.attrs.text = value
      return this.attrs.text ?? ''
    }
    // Like Konva.Text with no fixed width: sized from its text.
    width() { return this.text().length * 10 }
    height() { return 20 }
    x(value?: number) {
      if (value !== undefined) this.attrs.x = value
      return this.attrs.x ?? 0
    }
    y(value?: number) {
      if (value !== undefined) this.attrs.y = value
      return this.attrs.y ?? 0
    }
    position(value: { x: number, y: number }) {
      this.attrs.x = value.x
      this.attrs.y = value.y
    }
    visible(value?: boolean) {
      if (value !== undefined) this.attrs.visible = value
      return this.attrs.visible ?? true
    }
    destroy() { this.destroyed = true }
  }
  return { default: { Text: FakeText } }
})

vi.mock('../multistep-solver/multistep-solver-view', () => ({
  default: class {
    onTargetDropped?: (index: number, left: boolean) => void
    onNegativeSignDropped?: (left: boolean) => void
    constructor() { fakes.view = this }
    setPosition() {}
    update() {}
    showDropzone() {}
    hideDropzone() {}
    clearDropzone() {}
    destroy() {}
  },
}))

vi.mock('../multistep-solver/action-menu', () => ({
  default: class {
    onAdditionClicked?: () => void
    onSubtractionClicked?: () => void
    onMultiplicationClicked?: () => void
    onDivisionClicked?: () => void
    shown = false
    constructor() { fakes.actionMenu = this }
    show() { this.shown = true }
    hide() { this.shown = false }
    destroy() {}
  },
}))

vi.mock('../text-input/text-input', () => ({
  default: class {
    onTextEntered?: (text: string) => void
    onTextFocused?: () => void
    shown = false
    options: Record<string, any>
    constructor(options: Record<string, any>) {
      this.options = options
      fakes.input = this
    }
    show() { this.shown = true }
    hide() { this.shown = false }
    outlineColor() {}
    clear() {}
    destroy() {}
  },
}))

vi.mock('../text-input/keypad-input', () => ({
  default: class {
    show() {}
    hide() {}
    setAnswer() {}
    position() {}
    moveToTop() {}
    destroy() {}
  },
}))

import BasicMultistepPuzzle from './basic-multistep-puzzle'

const makeLayer = () => {
  const children: any[] = []
  return {
    children,
    getStage: () => ({}),
    add: (...nodes: any[]) => { children.push(...nodes) },
  } as any
}

const OPTIONS = { x: 500, y: 300, width: 700, height: 400, spacing: 24, blockSize: 40 }

describe('BasicMultistepPuzzle arithmetic label', () => {
  let layer: any
  let puzzle: BasicMultistepPuzzle
  const label = () => layer.children.find((node: any) => typeof node.text === 'function')

  // x + 3 = 8 + 4: moving the 3 starts two back-to-back Arithmetic Steps,
  // 8 + 4 and then 12 - 3.
  const startArithmetic = () => {
    fakes.view.onTargetDropped(1, true) // + 3
    fakes.actionMenu.onSubtractionClicked()
  }

  beforeEach(() => {
    layer = makeLayer()
    puzzle = new BasicMultistepPuzzle('x + 3 = 8 + 4', { layer, ...OPTIONS })
  })

  it('starts hidden', () => {
    expect(label().visible()).toBe(false)
  })

  it('shows the expression with the input when an Arithmetic Step begins', () => {
    startArithmetic()

    expect(fakes.input.shown).toBe(true)
    expect(label().visible()).toBe(true)
    expect(label().text()).toBe('8 + 4 =')
  })

  it('sits to the left of the input, vertically centred on it', () => {
    startArithmetic()

    const inputWidth = 100
    const inputY = OPTIONS.y + 100 / 2 + OPTIONS.spacing + 50 / 2
    const rightEdge = label().x() + label().width()
    expect(rightEdge).toBeLessThan(OPTIONS.x - inputWidth / 2)
    expect(label().y() + label().height() / 2).toBe(inputY)
  })

  it('updates for an Arithmetic Step that directly follows another', () => {
    startArithmetic()
    fakes.input.onTextEntered('12')

    expect(label().visible()).toBe(true)
    expect(label().text()).toBe('12 - 3 =')
  })

  it('keeps the expression after an incorrect Answer', () => {
    startArithmetic()
    fakes.input.onTextEntered('11')

    expect(label().text()).toBe('8 + 4 =')
  })

  it('hides with the input when the puzzle finishes', () => {
    startArithmetic()
    fakes.input.onTextEntered('12')
    fakes.input.onTextEntered('9')

    expect(fakes.input.shown).toBe(false)
    expect(label().visible()).toBe(false)
  })

  it('stays hidden during an Operation Step', () => {
    fakes.view.onTargetDropped(1, true)

    expect(fakes.actionMenu.shown).toBe(true)
    expect(label().visible()).toBe(false)
  })

  it('uses ? as the placeholder', () => {
    expect(fakes.input.options.ghostText).toBe('?')
  })

  it('destroys the label with the puzzle', () => {
    const node = label()
    puzzle.destroy()

    expect(node.destroyed).toBe(true)
  })
})
