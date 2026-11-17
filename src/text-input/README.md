# Text Input Usage

`TextInput` provides a styled Konva rectangle with an HTML text input managed internally.

```ts
const input = new TextInput({
  layer,
  x: 500,
  y: 300,
  width: 160,
  height: 50,
  backgroundColor: '#eeeeee',
  foregroundColor: '#000000',
  ghostText: 'Enter answer',
  ghostTextColor: '#888888',
})
```

The layer must already be attached to a Konva stage. Show and hide the input with:

```ts
input.show(500, 300)
input.hide()
```

Assign callbacks for focus and submitted text:

```ts
input.onTextFocused = () => {
  input.outlineColor('#77aaff')
}

input.onTextEntered = text => {
  console.log(text)
  input.clear()
}
```

Text is submitted when the user presses Enter or focuses another element. Incorrect answers can be cleared and submitted again.

Available controls:

- `text()` returns the current text.
- `clear()` empties the input.
- `textColor(color)` changes the text color.
- `ghostTextColor(color)` changes the placeholder color.
- `backgroundColor(color)` changes the Konva rectangle color.
- `outlineColor(color)` changes the outline color.
- `disable()` prevents typing and focus.
- `enable()` restores typing and focus.


# Keypad Input Usage

`KeypadInput` provides an on-screen keypad for entering answers in multistep math problems.

## How It Works

- Players enter numbers using the keypad instead of typing.
- Supports negative numbers and fractions.
- `C` clears the answer, while `⌫` removes the last character.
- The **Submit** button sends the answer to the puzzle for validation.
- The answer display resets after each submitted step.

## Usage

Create a keypad and attach it to a Konva layer:

```ts
const keypad = new KeypadInput();
layer.add(keypad);
```

Handle key presses and submissions using:

```ts
keypad.onKeyPressed = (key) => {
  // Handle the selected key
};

keypad.onSubmit = () => {
  // Validate the player's answer
};
```

Available controls:

- `setAnswer(answer)` updates the displayed answer.
- `setAnswer()` resets the display to "Enter answer".
- `show()` displays the keypad.
- `hide()` hides the keypad.

## Related Files

- `keypad-input.ts` — Keypad layout, buttons, and display.
- `../puzzles/basic-multistep-puzzle.ts` — Handles keypad input, answer submission, and validation.
