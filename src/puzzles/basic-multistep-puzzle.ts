import Konva from 'konva'

import ActionMenu from '../multistep-solver/action-menu'
import { equivalentArithmeticExpressions } from '../multistep-solver/arithmetic-expression'
import MultistepSolverController from '../multistep-solver/multistep-solver-controller'
import MultistepSolverModel from '../multistep-solver/multistep-solver-model'
import MultistepSolverView from '../multistep-solver/multistep-solver-view'
import { TermOp } from '../multistep-solver/types'
import type { StepAnswer } from '../questions/Question'
import type Puzzle from './puzzle'
import TextInput from '../text-input/text-input'
import KeypadInput from '../text-input/keypad-input'

export type PuzzleInputType = "typed" | "keypad";

export interface BasicMultistepPuzzleOptions {
  layer: Konva.Layer
  x: number
  y: number
  width: number
  height: number
  spacing: number
  blockSize?: number
  panelColor?: string
  actionMenuWidth?: number
  actionMenuHeight?: number
  inputWidth?: number
  inputHeight?: number
  inputType?: PuzzleInputType
}

/** Self-contained composition of the multistep solver and its input controls. */
class BasicMultistepPuzzle implements Puzzle {
  private static readonly DROP_ZONE_SIZE = 100
  private static readonly LABEL_GAP = 12

  private readonly options: BasicMultistepPuzzleOptions
  private readonly view: MultistepSolverView
  private readonly controller: MultistepSolverController
  private readonly actionMenu: ActionMenu
  private readonly textInput: TextInput
  private readonly keypad: KeypadInput
  private keypadAnswer = ''
  /** The expression an Arithmetic Step asks for, shown left of the input. */
  private readonly arithmeticLabel: Konva.Text

  /** Called when the puzzle reaches its Finished state. */
  public onPuzzleFinished?: (solved: boolean) => void

  /**
   * Called with every Step's Answer (operation picks and arithmetic), after
   * the puzzle has judged it and advanced if it was correct.
   */
  public onAnswer?: (answer: StepAnswer) => void

  /**
   * Creates and initializes a puzzle.
   * @param equation Initial equation string.
   * @param options Layer, panel, control, and spacing options.
   */
  constructor(equation: string, options: BasicMultistepPuzzleOptions) {
    this.validateOptions(options)
    this.options = options

    const model = new MultistepSolverModel()
    this.view = new MultistepSolverView(options.layer.getStage()!, options.layer, {
      panelWidth: options.width,
      panelHeight: options.height,
      blockSize: options.blockSize,
      panelColor: options.panelColor,
    })
    this.controller = new MultistepSolverController(model, this.view)
    this.actionMenu = new ActionMenu(
      options.actionMenuWidth ?? 64,
      options.actionMenuHeight ?? 64,
    )
    this.textInput = new TextInput({
      layer: options.layer,
      x: 0,
      y: 0,
      width: options.inputWidth ?? 100,
      height: options.inputHeight ?? 50,
      backgroundColor: '#eeeeee',
      foregroundColor: '#000000',
      ghostText: 'Enter an answer',
      ghostTextColor: '#aaaaaa',
    })

    this.arithmeticLabel = new Konva.Text({
      fill: '#ffffff',
      fontSize: Math.floor((options.blockSize ?? 32) / 2),
      visible: false,
      listening: false,
    })

    this.keypad = new KeypadInput();
    options.layer.add(this.keypad);

    options.layer.add(this.actionMenu)
    options.layer.add(this.arithmeticLabel)
    this.view.setPosition(options.x, options.y)
    this.hideExternalControls()
    this.connectComponents()
    this.controller.setEquation(equation)
  }

  private validateOptions(options: BasicMultistepPuzzleOptions): void {
    if (!options.layer.getStage()) {
      throw Error('BasicMultistepPuzzle requires a layer attached to a Konva stage.')
    }
    if (!Number.isFinite(options.width) || options.width <= 0) {
      throw Error('BasicMultistepPuzzle width must be a positive number.')
    }
    if (!Number.isFinite(options.height) || options.height <= 0) {
      throw Error('BasicMultistepPuzzle height must be a positive number.')
    }
    if (!Number.isFinite(options.spacing) || options.spacing < 0) {
      throw Error('BasicMultistepPuzzle spacing must be a non-negative number.')
    }
  }

  private connectComponents(): void {

    this.keypad.onKeyPressed = (key) => {
        if (key === "C"){
          this.keypadAnswer = ""
        } else if (key === "⌫") {
          this.keypadAnswer = this.keypadAnswer.slice(0, -1)
        } else if (key === "-") {
          this.keypadAnswer = this.keypadAnswer.startsWith("-")
              ? this.keypadAnswer.slice(1)
              : "-" + this.keypadAnswer
        } else if (key === "/"){
          if (this.keypadAnswer !== "" &&
            this.keypadAnswer !== "-" &&
            !this.keypadAnswer.includes("/")) {
            this.keypadAnswer += "/"
          }
        } else {
            this.keypadAnswer += key
        }
        this.keypad.setAnswer(this.keypadAnswer);
    }

    this.keypad.onSubmit = () => {
      const answer = this.keypadAnswer.trim();

      //Only allows whole number or fractions to be submitted
      if (!/^-?\d+(\/\d+)?$/.test(answer)) return;

      //Disallows division by 0
      if (answer.includes("/") && Number(answer.split("/")[1]) === 0) {
        return;
    }

      this.controller.arithmetic(answer);

    };



    this.view.onTargetDropped = (index, isLeftSide, isCoefficient) => {
      this.controller.operation(index, isLeftSide, isCoefficient)
    }
    this.view.onNegativeSignDropped = isLeftSide => {
      this.controller.removeNegativeSign(isLeftSide)
    }

    this.actionMenu.onAdditionClicked = () => this.moveRequest('+')
    this.actionMenu.onSubtractionClicked = () => this.moveRequest('-')
    this.actionMenu.onMultiplicationClicked = () => this.moveRequest('*')
    this.actionMenu.onDivisionClicked = () => this.moveRequest('/')

    this.textInput.onTextFocused = () => {
      this.textInput.outlineColor('#77aaff')
    }
    this.textInput.onTextEntered = text => {
      this.textInput.outlineColor('#aabbbb')
      const answer = text.trim()
      if (answer === '') return // an empty box (e.g. on blur) isn't an Answer
      this.controller.arithmetic(answer)
    }

    this.controller.onAnswerSubmit = (
      _question,
      playerAnswer,
      correctAnswer,
      isLastStep,
      stepPrompt) => {
      this.textInput.clear()
      this.keypadAnswer = ''
      this.keypad.setAnswer()

      if (playerAnswer === correctAnswer || equivalentArithmeticExpressions(playerAnswer, correctAnswer)) {
        this.controller.step()
      }

        this.onAnswer?.({ playerAnswer, correctAnswer, isLastStep, stepPrompt })
    }

    this.controller.onArithmeticStep = expression => {
      this.showArithmeticLabel(expression)
    }

    this.controller.onStateChange = state => {
      if (state === 'Operation') {
        this.textInput.hide()
        this.keypad.hide()
        this.arithmeticLabel.visible(false)
        this.actionMenu.show(this.actionMenuX(), this.options.y)
        return
      }

      if (state === 'Arithmetic') {
        this.actionMenu.hide()

        if (this.options.inputType === "keypad") {
        this.textInput.hide()

        this.keypad.position({
            x: this.options.x + this.options.width / 2 - 260,
            y: this.options.y - 220
        })

        this.keypad.show()
        this.keypad.moveToTop()

        }else{
          this.keypad.hide();
          this.textInput.show(this.options.x, this.inputY())
          this.textInput.outlineColor('#aabbbb')
        }
        return
      }

      this.hideExternalControls()
      if (state === 'Finished') {
        this.onPuzzleFinished?.(true)
      }
    }
  }

  /** Suspends the HTML input while a screen modal covers the canvas controls. */
  public setInteractionEnabled(enabled: boolean): void {
    if (enabled) this.textInput.enable()
    else this.textInput.disable()
  }

  /** Removes the puzzle from its layer, including the text input's HTML element. */
  public destroy(): void {
    this.onAnswer = undefined
    this.onPuzzleFinished = undefined
    this.controller.onAnswerSubmit = undefined
    this.controller.onStateChange = undefined
    this.controller.onArithmeticStep = undefined
    this.view.destroy()
    this.arithmeticLabel.destroy()
    this.actionMenu.destroy()
    this.textInput.destroy()
    this.keypad.destroy();
  }

  private moveRequest(operation: TermOp): void {
    this.controller.moveRequest(operation)
  }

  private actionMenuX(): number {
    const menuWidth = this.options.actionMenuWidth ?? 64
    return this.options.x + BasicMultistepPuzzle.DROP_ZONE_SIZE / 2 +
      this.options.spacing + menuWidth / 2
  }

  private inputY(): number {
    const inputHeight = this.options.inputHeight ?? 50
    return this.options.y + BasicMultistepPuzzle.DROP_ZONE_SIZE / 2 +
      this.options.spacing + inputHeight / 2
  }

  /** Shows `expression =` right-aligned against the input's left edge. */
  private showArithmeticLabel(expression: string): void {
    const hasVariable = /[A-Za-z]/.test(expression)
    const hasFraction = /\//.test(expression)
    const hint = hasVariable
      ? hasFraction
        ? 'e.g. 3/2*x or 1.5x; simplest fraction, decimals accepted'
        : 'e.g. 3*x, 3x, or x*3; decimals accepted'
      : hasFraction
        ? 'e.g. 3/2; simplest fraction, decimals accepted'
        : 'e.g. 12; whole number or decimal'

    this.textInput.ghostText(hint)
    const inputWidth = this.options.inputWidth ?? 100
    const rightEdge = this.options.x - inputWidth / 2 - BasicMultistepPuzzle.LABEL_GAP
    this.arithmeticLabel.text(`${expression} =`)
    this.arithmeticLabel.position({
      x: rightEdge - this.arithmeticLabel.width(),
      y: this.inputY() - this.arithmeticLabel.height() / 2,
    })
    this.arithmeticLabel.visible(true)
  }

  private hideExternalControls(): void {
    this.actionMenu.hide()
    this.textInput.hide()
    this.keypad.hide()
    this.arithmeticLabel.visible(false)
  }
}

export default BasicMultistepPuzzle
