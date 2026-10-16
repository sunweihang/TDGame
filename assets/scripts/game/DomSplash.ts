/**
 * Preview / web builds keep a DOM `#splash` (elex art) until the battlefield
 * is on screen. Cocos hides that node when the first scene starts — hold it
 * back up, then fire `elex-art-ready` to dismiss.
 */

type SplashEl = {
  classList?: { add: (name: string) => void; remove: (name: string) => void };
  style?: { setProperty: (name: string, value: string, priority?: string) => void };
};

function splashDoc(): { getElementById?: (id: string) => SplashEl | null } | undefined {
  try {
    return (globalThis as { document?: { getElementById?: (id: string) => SplashEl | null } })
      .document;
  } catch {
    return undefined;
  }
}

function splashEl(): SplashEl | null {
  return splashDoc()?.getElementById?.('splash') ?? null;
}

export function isDomSplashReleased(): boolean {
  try {
    return !!(globalThis as { __elexArtReady?: boolean }).__elexArtReady;
  } catch {
    return false;
  }
}

export function holdDomSplash(): void {
  if (isDomSplashReleased()) return;
  const el = splashEl();
  if (!el) return;
  el.classList?.remove('is-done');
  el.style?.setProperty('display', 'block', 'important');
  el.style?.setProperty('visibility', 'visible', 'important');
  el.style?.setProperty('z-index', '9999', 'important');
}

export function releaseDomSplash(): void {
  try {
    const g = globalThis as {
      __elexArtReady?: boolean;
      dispatchEvent?: (e: Event) => boolean;
      CustomEvent?: new (type: string) => Event;
    };
    g.__elexArtReady = true;
    const el = splashEl();
    if (el) {
      el.classList?.add('is-done');
      el.style?.setProperty('display', 'none', 'important');
      el.style?.setProperty('visibility', 'hidden', 'important');
    }
    if (g.CustomEvent && g.dispatchEvent) {
      g.dispatchEvent(new g.CustomEvent('elex-art-ready'));
    }
  } catch {
    /* native / no DOM */
  }
}
