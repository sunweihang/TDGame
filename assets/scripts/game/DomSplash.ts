/**
 * Preview / web builds keep a DOM `#splash` over the game.
 * Cocos hides that node when the first scene starts — hold it back up.
 * The cover stays until the player clicks, then `elex-art-ready` dismisses it.
 */

type SplashEl = {
  classList?: {
    add: (name: string) => void;
    remove: (name: string) => void;
    contains?: (name: string) => boolean;
  };
  style?: { setProperty: (name: string, value: string, priority?: string) => void };
};

type SplashGlobal = {
  document?: { getElementById?: (id: string) => SplashEl | null };
  __elexArtReady?: boolean;
  __tdSplashClicked?: boolean;
  __tdLoadReady?: boolean;
  __tdLoading?: boolean;
  __tdSwallowInputUntil?: number;
  addEventListener?: (type: string, fn: (ev: Event) => void, capture?: boolean) => void;
  setInterval?: (fn: () => void, ms: number) => number;
  dispatchEvent?: (e: Event) => boolean;
  CustomEvent?: new (type: string) => Event;
  wx?: { onTouchStart?: (fn: () => void) => void };
};

const SWALLOW_MS = 500;

let keepRunning = false;
let listening = false;

function splashGlobal(): SplashGlobal {
  return globalThis as SplashGlobal;
}

function splashDoc(): SplashGlobal['document'] | undefined {
  try {
    return splashGlobal().document;
  } catch {
    return undefined;
  }
}

function splashEl(): SplashEl | null {
  return splashDoc()?.getElementById?.('splash') ?? null;
}

export function isDomSplashReleased(): boolean {
  try {
    return !!splashGlobal().__elexArtReady;
  } catch {
    return false;
  }
}

export function isSplashClicked(): boolean {
  try {
    return !!splashGlobal().__tdSplashClicked;
  } catch {
    return false;
  }
}

/** True while the login cover should ignore the click that dismisses it. */
export function loginPointerBlocked(): boolean {
  try {
    const until = splashGlobal().__tdSwallowInputUntil ?? 0;
    return Date.now() < until;
  } catch {
    return false;
  }
}

/** Browser splash, or a WeChat build that can take a tap on the first screen. */
export function splashCoverIsUp(): boolean {
  if (isDomSplashReleased()) return false;
  if (splashEl()) return true;
  const wx = splashGlobal().wx;
  return typeof wx?.onTouchStart === 'function';
}

function bootStillUp(): boolean {
  try {
    const boot = splashDoc()?.getElementById?.('boot');
    if (!boot) return false;
    if (boot.classList?.contains?.('is-idle')) return false;
    if (boot.classList?.contains?.('is-done')) return false;
    return true;
  } catch {
    return false;
  }
}

/** Battlefield is ready for the login splash. The loading bar fills, then hides. */
export function signalLoadReady(): void {
  try {
    const g = splashGlobal();
    g.__tdLoadReady = true;
    if (g.CustomEvent && g.dispatchEvent) {
      g.dispatchEvent(new g.CustomEvent('td-load-ready'));
    }
  } catch {
    /* native / no DOM */
  }
}

function markClicked(ev?: { preventDefault?: () => void; stopPropagation?: () => void }): void {
  if (splashGlobal().__tdLoading) return;
  if (bootStillUp()) return;
  const g = splashGlobal();
  if (g.__tdSplashClicked) return;
  g.__tdSplashClicked = true;
  g.__tdSwallowInputUntil = Date.now() + SWALLOW_MS;
  ev?.preventDefault?.();
  ev?.stopPropagation?.();
}

/** Remember a click even if it happens while the battlefield is still loading. */
export function armSplashClick(): void {
  if (listening) return;
  const g = splashGlobal();
  if (!g.addEventListener && !g.wx?.onTouchStart) return;
  listening = true;
  const onPointer = (ev: Event) => {
    markClicked(ev);
  };
  g.addEventListener?.('pointerdown', onPointer, true);
  g.addEventListener?.('touchstart', onPointer, true);
  if (g.wx?.onTouchStart) g.wx.onTouchStart(() => markClicked());
}

function revealSplash(): void {
  const el = splashEl();
  if (!el) return;
  el.classList?.remove('is-done');
  el.style?.setProperty('display', 'block', 'important');
  el.style?.setProperty('visibility', 'visible', 'important');
  el.style?.setProperty('z-index', '9999', 'important');
  el.style?.setProperty('pointer-events', 'auto', 'important');
  el.style?.setProperty('cursor', 'pointer', 'important');
}

function keepSplash(): void {
  if (!keepRunning) return;
  if (isDomSplashReleased()) {
    keepRunning = false;
    return;
  }
  revealSplash();
  const raf = (globalThis as { requestAnimationFrame?: (fn: () => void) => number }).requestAnimationFrame;
  if (raf) {
    raf(() => keepSplash());
    return;
  }
  splashGlobal().setInterval?.(() => {
    if (!keepRunning || isDomSplashReleased()) return;
    revealSplash();
  }, 32);
}

export function holdDomSplash(): void {
  if (isDomSplashReleased()) return;
  armSplashClick();
  revealSplash();
  if (keepRunning) return;
  keepRunning = true;
  keepSplash();
}

export function releaseDomSplash(): void {
  try {
    const g = splashGlobal();
    g.__elexArtReady = true;
    keepRunning = false;
    const el = splashEl();
    if (el) {
      el.classList?.add('is-done');
      el.style?.setProperty('display', 'none', 'important');
      el.style?.setProperty('visibility', 'hidden', 'important');
      el.style?.setProperty('pointer-events', 'none', 'important');
    }
    if (g.CustomEvent && g.dispatchEvent) {
      g.dispatchEvent(new g.CustomEvent('elex-art-ready'));
    }
  } catch {
    /* native / no DOM */
  }
}
