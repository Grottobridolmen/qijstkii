// Touch joystick + look-drag + buttons, with desktop keyboard/mouse fallback.

export class Controls {
  constructor(elements) {
    // elements: { canvas, stick, knob, btnJump, btnDig, btnPlace, btnSwap }
    this.el = elements;
    this.move = { x: 0, y: 0 }; // -1..1
    this.lookDelta = { x: 0, y: 0 };
    this.jumpPressed = false;
    this.digPressed = false;  // edge
    this.digHeld = false;     // continuous
    this.placePressed = false;
    this.swapPressed = false;
    this.respawnPressed = false;

    this.keys = new Set();
    this.pointerLocked = false;

    this._setupStick();
    this._setupLook();
    this._setupButtons();
    this._setupKeyboard();
    this._setupMouse();
  }

  _setupStick() {
    const stick = this.el.stick;
    const knob = this.el.knob;
    let active = null; // pointerId
    const center = () => {
      const r = stick.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2 };
    };
    const onDown = (e) => {
      if (active !== null) return;
      active = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      onMove(e);
    };
    const onMove = (e) => {
      if (active !== e.pointerId) return;
      const { cx, cy, r } = center();
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      const max = r * 0.7;
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.move.x = dx / max;
      this.move.y = dy / max; // y is "forward/back" in screen space
    };
    const onUp = (e) => {
      if (active !== e.pointerId) return;
      active = null;
      knob.style.transform = 'translate(-50%, -50%)';
      this.move.x = 0; this.move.y = 0;
    };
    stick.addEventListener('pointerdown', onDown);
    stick.addEventListener('pointermove', onMove);
    stick.addEventListener('pointerup', onUp);
    stick.addEventListener('pointercancel', onUp);
  }

  _setupLook() {
    const canvas = this.el.canvas;
    let active = null;
    let lastX = 0, lastY = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return; // handled in mouse handler
      if (active !== null) return;
      active = e.pointerId;
      lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') return;
      if (active !== e.pointerId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      this.lookDelta.x += dx;
      this.lookDelta.y += dy;
    });
    const release = (e) => {
      if (active !== e.pointerId) return;
      active = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  _setupButtons() {
    const bind = (btn, onDown, onUp) => {
      if (!btn) return;
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(); });
      if (onUp) btn.addEventListener('pointerup', () => onUp());
    };
    bind(this.el.btnJump, () => { this.jumpPressed = true; });
    bind(this.el.btnDig, () => { this.digPressed = true; this.digHeld = true; }, () => { this.digHeld = false; });
    bind(this.el.btnPlace, () => { this.placePressed = true; });
  }

  _setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpPressed = true;
      if (e.code === 'KeyQ') this.swapPressed = true;
      if (e.code === 'KeyE') this.placePressed = true;
      if (e.code === 'KeyR') this.respawnPressed = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyF') this.digHeld = false;
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  _setupMouse() {
    const canvas = this.el.canvas;
    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      // Pointer lock for FPS-style look on desktop.
      if (!this.pointerLocked && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
      if (e.button === 0) { this.digPressed = true; this.digHeld = true; }
      if (e.button === 2) { this.placePressed = true; }
    });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.digHeld = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = (document.pointerLockElement === canvas);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.lookDelta.x += e.movementX;
      this.lookDelta.y += e.movementY;
    });
  }

  // Per-frame state for the game loop.
  read() {
    // Movement from keyboard adds to stick.
    let mx = this.move.x;
    let my = this.move.y;
    if (this.keys.has('KeyW')) my -= 1;
    if (this.keys.has('KeyS')) my += 1;
    if (this.keys.has('KeyA')) mx -= 1;
    if (this.keys.has('KeyD')) mx += 1;
    mx = Math.max(-1, Math.min(1, mx));
    my = Math.max(-1, Math.min(1, my));

    const out = {
      move: { x: mx, y: my },
      look: { x: this.lookDelta.x, y: this.lookDelta.y },
      jump: this.jumpPressed,
      dig: this.digPressed,
      digHeld: this.digHeld || this.keys.has('KeyF'),
      place: this.placePressed,
      swap: this.swapPressed,
      respawn: this.respawnPressed,
    };
    // Reset edges
    this.lookDelta.x = 0; this.lookDelta.y = 0;
    this.jumpPressed = false;
    this.digPressed = false;
    this.placePressed = false;
    this.swapPressed = false;
    this.respawnPressed = false;
    return out;
  }
}
