let _hint = '';
let _watch: (text: string) => void = () => {};
let _picking = false;
let _blockUntil = 0;

/** Banner shown after a plant or upgrade card, until the player finishes the tap. */
export function setOrderHint(text: string): void {
  _hint = text;
  _watch(text);
}

export function watchOrderHint(fn: (text: string) => void): void {
  _watch = fn;
  if (_hint) fn(_hint);
}

/** True while the three-choice popup is up, so a card tap does not also build. */
export function setPicking(on: boolean): void {
  _picking = on;
  if (!on) _blockUntil = Date.now() + 280;
}

export function picking(): boolean {
  return _picking || Date.now() < _blockUntil;
}
