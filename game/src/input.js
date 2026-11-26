// Sky Courier — controls.
// One job: turn keyboard and mouse into a single input state the flight
// model reads. Keyboard flies; the mouse works the menus.

import { KEYS } from './config.js';

export function makeInput() {
  const down = new Set();
  const pressed = new Set(); // edge-triggered: cleared by the loop each frame
  const listeners = [];

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) pressed.add(e.code);
    down.add(e.code);
  }
  function onKeyUp(e) {
    down.delete(e.code);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  listeners.push(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  });

  function has(codes) {
    return codes.some((c) => down.has(c));
  }

  // The flight stick, read once a frame: -1..1 on each axis, throttle -1..1.
  function readFlight() {
    return {
      pitch: (has(KEYS.pitchUp) ? 1 : 0) - (has(KEYS.pitchDown) ? 1 : 0),
      roll: (has(KEYS.rollRight) ? 1 : 0) - (has(KEYS.rollLeft) ? 1 : 0),
      throttle: (has(KEYS.throttleUp) ? 1 : 0) - (has(KEYS.throttleDown) ? 1 : 0),
    };
  }

  function wasPressed(codes) {
    return codes.some((c) => pressed.has(c));
  }

  function endFrame() {
    pressed.clear();
  }

  return { down, pressed, has, readFlight, wasPressed, endFrame, listeners };
}

// A clickable on-screen button (menus, debrief). Plain DOM, one handler.
export function makeButton(label, onClick, className = '') {
  const b = document.createElement('button');
  b.className = `menu-button ${className}`.trim();
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// Mouse steering: hold and drag on the game view to pitch and bank, for
// pilots who would rather fly with the mouse. The drag offsets blend with
// the keyboard stick, they never replace it.
export function makeMouseSteering(element) {
  const drag = { active: false, x: 0, y: 0, startX: 0, startY: 0 };
  function onDown(e) {
    drag.active = true;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.x = 0;
    drag.y = 0;
  }
  function onMove(e) {
    if (!drag.active) return;
    const rect = element.getBoundingClientRect();
    drag.x = Math.max(-1, Math.min(1, (e.clientX - drag.startX) / (rect.width * 0.25)));
    drag.y = Math.max(-1, Math.min(1, (e.clientY - drag.startY) / (rect.height * 0.25)));
  }
  function onUp() {
    drag.active = false;
    drag.x = 0;
    drag.y = 0;
  }
  element.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  return {
    // Pitch up when the mouse is dragged up, bank toward the drag.
    read() {
      return { pitch: -drag.y, roll: drag.x };
    },
    get active() { return drag.active; },
  };
}
