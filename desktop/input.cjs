const KEYS = { Escape: 27, Tab: 9, Space: 32, Enter: 13, Backspace: 8, ShiftLeft: 160, ShiftRight: 161, ControlLeft: 162, ControlRight: 163, AltLeft: 164, AltRight: 165, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Insert: 45, Delete: 46, Home: 36, End: 35, PageUp: 33, PageDown: 34, CapsLock: 20, Minus: 189, Equal: 187, BracketLeft: 219, BracketRight: 221, Backslash: 220, Semicolon: 186, Quote: 222, Backquote: 192, Comma: 188, Period: 190, Slash: 191 };
for (let i = 0; i < 26; i++) KEYS['Key' + String.fromCharCode(65 + i)] = 65 + i;
for (let i = 0; i < 10; i++) KEYS['Digit' + i] = 48 + i;
for (let i = 1; i <= 12; i++) KEYS['F' + i] = 111 + i;
function encodeInput(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.type === 'release') return 'release';
  if (data.type === 'key' && Object.hasOwn(KEYS, data.code) && typeof data.down === 'boolean') return `key ${KEYS[data.code]} ${data.down ? 1 : 0}`;
  if (data.type === 'button' && [0, 1, 2].includes(data.button) && typeof data.down === 'boolean') return `button ${data.button} ${data.down ? 1 : 0}`;
  if (data.type === 'move' && Number.isFinite(data.x) && Number.isFinite(data.y)) return `move ${Math.round(Math.max(-2000, Math.min(2000, data.x)))} ${Math.round(Math.max(-2000, Math.min(2000, data.y)))}`;
  if (data.type === 'wheel' && Number.isFinite(data.y)) return `wheel ${Math.sign(data.y) * -120}`;
  return null;
}
module.exports = { encodeInput };
