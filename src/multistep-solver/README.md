# Multistep Solver Usage

The easiest way to use the solver is through `BasicMultistepPuzzle`, the multistep room. It draws the equation on an "EQUATION LOCK" console in the Power Box style and adds everything a player needs:

- an instruction strip that says what to do now (`STEP 2 OF 4 · Work out 14 + 7 on the keypad`),
- a socket to drop a term into, and labelled ADD / SUBTRACT / MULTIPLY / DIVIDE buttons,
- a keypad (also driven by the keyboard) with a "LOCK PINS" light per Step,
- a "LOCK OPEN" panel with the answer when the equation is solved.

```ts
import { CONSOLE } from '../multistep-solver/multistep-console'

const puzzle = new BasicMultistepPuzzle('x * 5 + 3 = 8', {
  layer,
  x: 720,                // center of the console
  y: 500,
  width: CONSOLE.width,  // the console is drawn at 1240 × 680
  height: CONSOLE.height,
})

puzzle.onAnswer = answer => { /* every Step's Answer */ }
puzzle.onPuzzleFinished = solved => { /* the equation is solved */ }
```

The supplied layer must already be attached to a Konva stage. The Answer that solves the Room is sent `FINAL_ANSWER_MS` (2.5 s) after the answer is shown, or as soon as the player presses "Back to map", so the player sees the answer before leaving.

How many lights the keypad shows comes from `stepsLeft(model)` in `step-counter.ts`: the fewest Steps left from where the equation is now. Players can move terms in any order, so after each Step the total is the Steps solved plus the fewest still to go.

The view takes an optional `theme` (block and drop-zone colors and font, and how operators are shown, e.g. `{ '*': '·' }`), `equationCenter` and `dropZone` (positions inside the panel). Blocks grow with their text, so wide values like `(-12)` no longer spill into their neighbours.

## Manual MVC usage

For separate control, create a model, view, and controller:

```ts
const model = new MultistepSolverModel()
const view = new MultistepSolverView(stage, layer, {
  panelWidth: 700,
  panelHeight: 400,
})
const controller = new MultistepSolverController(model, view)

controller.setEquation('x * 5 + 3 = 8')
```

The controller states are `Idle`, `Operation`, `Arithmetic`, and `Finished`.

Connect view events to the controller:

```ts
view.onTargetDropped = (index, isLeftSide) => {
  controller.operation(index, isLeftSide)
}
```

Use `controller.onStateChange` to activate the appropriate external control. `controller.onArithmeticStep` is called with the expression to work out (e.g. `8 - 3`) each time an Arithmetic Step begins, including one that directly follows another, which `onStateChange` does not report because the state stays `Arithmetic`. `BasicMultistepPuzzle` uses it to label the input box. Submit operation choices with `moveRequest(operation)` and arithmetic answers with `arithmetic(answer)`. Call `step()` after a correct submitted answer.

Useful controller methods:

- `setEquation(equation)` loads a new equation.
- `operation(index, isLeftSide)` requests a term move.
- `moveRequest(operation)` submits `+`, `-`, `*`, or `/`.
- `arithmetic(answer)` submits an arithmetic result.
- `step()` applies an accepted answer.
- `fail()` ends the puzzle as failed.

The model stores additive signs on term values. The view renders the corresponding `+` and `-` blocks automatically.
