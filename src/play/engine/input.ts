export class Input {
  readonly keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  fireHeld = false;
  firePressed = false;
  adsHeld = false;
  wheel = 0;
  locked = false;
  sensitivity = Number(localStorage.getItem("krawk.sens") ?? 1);
  onLockChange?: (locked: boolean) => void;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (this.locked && ["Space", "Tab", "KeyQ"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener("mousedown", (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.fireHeld = true;
        this.firePressed = true;
      }
      if (e.button === 2) this.adsHeld = true;
    });
    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.fireHeld = false;
      if (e.button === 2) this.adsHeld = false;
    });
    document.addEventListener("wheel", (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    });
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) {
        this.fireHeld = this.adsHeld = false;
        this.keys.clear();
      }
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    const req = this.target.requestPointerLock({ unadjustedMovement: true }) as unknown as Promise<void> | undefined;
    req?.catch?.(() => this.target.requestPointerLock());
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setSensitivity(v: number) {
    this.sensitivity = v;
    localStorage.setItem("krawk.sens", String(v));
  }

  wasPressed(code: string) {
    return this.pressed.has(code);
  }

  down(code: string) {
    return this.keys.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
    this.firePressed = false;
    this.wheel = 0;
  }
}
