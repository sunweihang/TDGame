import { Camera, Color, Label, Layers, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3, Widget, resources } from 'cc';

/**
 * Combat text sits on the crown (`blood`, else a short head lift).
 * Each hit is its own glyph. A newer hit on the same body takes the crown
 * and steps the older glyphs up one lane, so they spread upward instead of
 * sitting on each other. Lanes also shift sideways.
 * The screen keeps a short list. A hit past that list fades the oldest glyph.
 * A glyph pops on the crown, then drifts up slowly and stays readable.
 * Plain hits are warm white. A machine-gun hit is orange-yellow. A flame hit is red.
 * An ice hit is cyan. A lightning hit is purple.
 * Those hits stay on the system font. Only a crit swaps in the weapon's digit sheet.
 * A weapon crit waits until that sheet is loaded, so the first frame is the texture.
 * The sheet is the face of the number. Crits do not draw a badge behind it.
 * Offsets are the 720 canvas, then ×1.5 onto this 1080 canvas.
 * This camera shows about 80 meters top to bottom, so the rise stays a
 * short lift off the head.
 */
const UI = 1080 / 720;
/** Living glyphs. Past this, the oldest starts fading. */
const MAX_LIVE = 18;
const MAX_QUEUE = 36;
const MAX_PER_FRAME = 18;
/** Glyphs kept on one body. A newer hit fades the oldest on that body. */
const MAX_PER_UNIT = 4;
const FONT_HIT = 20;
const FONT_CRIT = 20;
/** Crit digits on this 1080 canvas, before the pop. */
const ART_CRIT = 38;
/** 720-canvas step that clears one weapon digit after the canvas scale. */
const ART_STACK = 24;
const ART_CELLS = 6;
const DUR_HIT = 1.4;
const DUR_CRIT = 1.75;
const DUR_PLAYER = 1.4;
/** 720-canvas pixels between two glyphs on the same body. */
const STACK_Y = 32;
const LANE_X = [0, -18, 16, -8];
/** Extra crown lift for a crit, in the 720 canvas. */
const CRIT_LIFT = 6;
/** Side step when a glyph is retired, so it clears the crown while it fades. */
const LANE_PEEL = 10;
const EVICT_FADE = 0.4;
/** How fast a glyph slides from the crown into its lane. */
const SLOT_CHASE = 4.5;
/** Extra height above the crown where a pop starts, in the 720 canvas. */
const HEAD_LIFT = 28;
const INK_HIT = new Color(255, 248, 214, 255);
const INK_CRIT = new Color(255, 64, 22, 255);
const INK_PLAYER = new Color(248, 95, 95, 255);
/** Machine-gun body color. Orange-yellow. */
const INK_GUN = new Color(255, 186, 42, 255);
/** Flamethrower body color. Red. */
const INK_FLAME = new Color(255, 42, 36, 255);
/** Ice beacon body color. Cyan. */
const INK_FROST = new Color(80, 210, 255, 255);
/** Lightning body color. Purple. */
const INK_BOLT = new Color(186, 72, 255, 255);
const EDGE = new Color(0, 0, 0, 255);

export type Kind = 'hit' | 'crit' | 'player';
/** Which weapon landed the hit. The bitmap sheet is only for a crit. */
export type Ink = 'plain' | 'gun' | 'flame' | 'frost' | 'bolt';

type Floater = {
  node: Node;
  lab: Label;
  fade: UIOpacity;
  life: number;
  /** Seconds this glyph stays up. Crits outlast normal hits. */
  dur: number;
  /** Seconds left in a forced fade. Negative means the glyph is still living. */
  evict: number;
  layX: number;
  layY: number;
  /** Shown offset. Chases the lane so a new hit slides up instead of popping. */
  visX: number;
  visY: number;
  at: Vec3;
  target: Node | null;
  amount: number;
  kind: Kind;
  ink: Ink;
  digits: Node;
  cells: Sprite[];
};

type Pending = {
  node: Node;
  amount: number;
  crit: boolean;
  player: boolean;
  ink: Ink;
};

type ArtInk = 'gun' | 'flame' | 'frost' | 'bolt';

const _world = new Vec3();
const _ui = new Vec3();
const _eye = new Vec3();
const _live: Floater[] = [];
const _pool: Floater[] = [];
const _queue: Pending[] = [];
/** Weapon crits held until their digit sheet can draw. */
const _hold: Pending[] = [];
const _artGiveUp: Record<ArtInk, boolean> = { gun: false, flame: false, frost: false, bolt: false };

let _root: Node | null = null;
let _canvas: Node | null = null;
const _digits: Record<ArtInk, Array<SpriteFrame | null>> = {
  gun: [null, null, null, null, null, null, null, null, null, null],
  flame: [null, null, null, null, null, null, null, null, null, null],
  frost: [null, null, null, null, null, null, null, null, null, null],
  bolt: [null, null, null, null, null, null, null, null, null, null],
};
let _digitLoading = false;

export function mountDmgFont(canvas: Node): void {
  if (_root?.isValid) _root.destroy();
  _live.length = 0;
  _pool.length = 0;
  _queue.length = 0;
  _hold.length = 0;
  _artGiveUp.gun = false;
  _artGiveUp.flame = false;
  _artGiveUp.frost = false;
  _artGiveUp.bolt = false;
  _canvas = canvas;
  const root = new Node('DmgFonts');
  root.layer = Layers.Enum.UI_2D;
  canvas.addChild(root);
  root.addComponent(UITransform).setContentSize(1080, 1920);
  const w = root.addComponent(Widget);
  w.isAlignTop = true;
  w.isAlignBottom = true;
  w.isAlignLeft = true;
  w.isAlignRight = true;
  w.top = 0;
  w.bottom = 0;
  w.left = 0;
  w.right = 0;
  w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
  w.updateAlignment();
  passThrough(root);
  _root = root;
  loadArt();
}

export function showDmgFont(target: Node, amount: number, kind: Kind, ink: Ink = 'plain'): void {
  if (!target?.isValid || amount <= 0) return;
  if (_queue.length >= MAX_QUEUE) _queue.shift();
  _queue.push({
    node: target,
    amount,
    crit: kind === 'crit',
    player: kind === 'player',
    ink,
  });
}

export function tickDmgFont(dt: number, cam: Camera | null): void {
  if (_root?.isValid && _root.parent) _root.setSiblingIndex(_root.parent.children.length - 1);
  releaseHold();
  let made = 0;
  while (_queue.length && made < MAX_PER_FRAME) {
    const job = _queue.shift()!;
    if (!job.node.isValid) continue;
    if (artPending(job)) {
      if (_hold.length >= MAX_QUEUE) _hold.shift();
      _hold.push(job);
      continue;
    }
    spawn(job);
    made += 1;
  }
  const canvas = _canvas;
  for (let i = _live.length - 1; i >= 0; i--) {
    const floater = _live[i];
    const target = floater.target;
    if (target?.isValid) overhead(target, floater.at);
    floater.life += dt;
    const evicting = floater.evict >= 0;
    if (evicting) floater.evict -= dt;
    const u = Math.min(1, floater.life / floater.dur);
    const scale = scaleAt(floater.kind, u);
    floater.node.setScale(scale, scale, 1);
    let alpha = alphaAt(floater.kind, u);
    if (evicting) alpha *= Math.max(0, floater.evict / EVICT_FADE);
    floater.fade.opacity = Math.round(alpha * 255);
    chaseSlot(floater, dt);
    _world.set(floater.at);
    const shown = place(floater, cam, canvas, offsetYAt(u));
    if (!shown) floater.node.active = false;
    if (floater.life < floater.dur && !(evicting && floater.evict <= 0)) continue;
    floater.node.active = false;
    floater.target = null;
    _pool.push(floater);
    _live.splice(i, 1);
  }
}

function isArt(ink: Ink): ink is ArtInk {
  return ink === 'gun' || ink === 'flame' || ink === 'frost' || ink === 'bolt';
}

function sheetReady(ink: ArtInk): boolean {
  const frames = _digits[ink];
  for (let d = 0; d < 10; d++) if (!frames[d]) return false;
  return true;
}

/** Weapon crits stay off screen until their digits can draw. */
function artPending(job: Pending): boolean {
  if (!job.crit || job.player || job.ink === 'plain') return false;
  if (!isArt(job.ink)) return false;
  if (_artGiveUp[job.ink]) return false;
  return !sheetReady(job.ink);
}

function releaseHold(): void {
  if (!_hold.length) return;
  const ready: Pending[] = [];
  const still: Pending[] = [];
  for (let i = 0; i < _hold.length; i++) {
    const job = _hold[i];
    if (!job.node.isValid) continue;
    if (artPending(job)) still.push(job);
    else ready.push(job);
  }
  _hold.length = 0;
  for (let i = 0; i < still.length; i++) _hold.push(still[i]);
  for (let i = ready.length - 1; i >= 0; i--) _queue.unshift(ready[i]);
}

function resolveKind(player: boolean, crit: boolean): Kind {
  if (player) return 'player';
  if (crit) return 'crit';
  return 'hit';
}

function durationOf(kind: Kind): number {
  if (kind === 'crit') return DUR_CRIT;
  if (kind === 'player') return DUR_PLAYER;
  return DUR_HIT;
}

function paint(floater: Floater): void {
  const kind = floater.kind;
  const art = kind === 'crit' && floater.ink !== 'plain' && layoutArt(floater);
  floater.digits.active = art;
  floater.lab.node.active = !art;
  if (art) return;
  const size = Math.round((kind === 'crit' ? FONT_CRIT : FONT_HIT) * UI);
  floater.lab.string = formatCount(floater.amount);
  floater.lab.fontSize = size;
  floater.lab.lineHeight = size + 2;
  floater.lab.color = labelInk(floater);
  floater.lab.outlineColor = EDGE;
  floater.lab.outlineWidth = kind === 'crit' ? 4 : 3;
}

function labelInk(floater: Floater): Color {
  if (floater.ink === 'gun') return INK_GUN;
  if (floater.ink === 'flame') return INK_FLAME;
  if (floater.ink === 'frost') return INK_FROST;
  if (floater.ink === 'bolt') return INK_BOLT;
  if (floater.kind === 'crit') return INK_CRIT;
  if (floater.kind === 'player') return INK_PLAYER;
  return INK_HIT;
}

/** Crits draw the weapon sheet. One bitmap digit per character. */
function layoutArt(floater: Floater): boolean {
  if (!isArt(floater.ink)) return false;
  const frames = _digits[floater.ink];
  const text = String(Math.max(0, Math.floor(floater.amount)));
  if (!text.length || text.length > floater.cells.length) return false;
  const h = ART_CRIT;
  const gap = -Math.round(h * 0.04);
  const widths: number[] = [];
  const used: SpriteFrame[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 48;
    const frame = code >= 0 && code <= 9 ? frames[code] : null;
    if (!frame) return false;
    const size = frame.originalSize;
    const aspect = size.height > 0 ? size.width / size.height : 0.62;
    widths.push(h * aspect);
    used.push(frame);
  }
  let total = 0;
  for (let i = 0; i < widths.length; i++) total += widths[i];
  if (widths.length > 1) total += gap * (widths.length - 1);
  let x = -total * 0.5;
  const cells = floater.cells;
  for (let i = 0; i < cells.length; i++) {
    const spr = cells[i];
    const node = spr.node;
    if (i >= used.length) {
      node.active = false;
      continue;
    }
    node.active = true;
    spr.spriteFrame = used[i];
    node.getComponent(UITransform)?.setContentSize(widths[i], h);
    node.setPosition(x + widths[i] * 0.5, 0, 0);
    x += widths[i] + gap;
  }
  return true;
}

/**
 * Newest glyph lands on the crown. Glyphs already on this body step up,
 * and each lane takes a different sideways slot.
 */
function seat(target: Node, floater: Floater): void {
  let n = 0;
  const step = laneStep(floater);
  for (let i = 0; i < _live.length; i++) {
    const other = _live[i];
    if (other.target !== target || other.evict >= 0) continue;
    other.layY += Math.max(laneStep(other), step);
    n += 1;
  }
  floater.layX = LANE_X[n % LANE_X.length];
  floater.layY = floater.kind === 'crit' ? CRIT_LIFT : 0;
}

function laneStep(floater: Floater): number {
  if (floater.kind === 'crit' && floater.ink !== 'plain') return ART_STACK;
  return STACK_Y;
}

function chaseSlot(floater: Floater, dt: number): void {
  const t = 1 - Math.exp(-SLOT_CHASE * dt);
  floater.visX += (floater.layX - floater.visX) * t;
  floater.visY += (floater.layY - floater.visY) * t;
}

function makeRoom(): void {
  let n = 0;
  for (let i = 0; i < _live.length; i++) if (_live[i].evict < 0) n += 1;
  while (n >= MAX_LIVE) {
    const old = oldestAlive();
    if (!old) break;
    beginFade(old);
    n -= 1;
  }
}

function releaseUnit(target: Node): void {
  let n = 0;
  for (let i = 0; i < _live.length; i++) {
    if (_live[i].target === target && _live[i].evict < 0) n += 1;
  }
  while (n >= MAX_PER_UNIT) {
    const old = oldestOn(target);
    if (!old) break;
    beginFade(old);
    n -= 1;
  }
}

function oldestAlive(): Floater | null {
  for (let i = 0; i < _live.length; i++) {
    if (_live[i].evict < 0) return _live[i];
  }
  return null;
}

function oldestOn(target: Node): Floater | null {
  for (let i = 0; i < _live.length; i++) {
    const floater = _live[i];
    if (floater.target === target && floater.evict < 0) return floater;
  }
  return null;
}

function beginFade(floater: Floater): void {
  if (floater.evict >= 0) return;
  floater.evict = EVICT_FADE;
  floater.layX += floater.layX >= 0 ? LANE_PEEL : -LANE_PEEL;
  floater.layY += laneStep(floater);
}

function spawn(job: Pending): void {
  if (!_root?.isValid || !job.node.isValid) return;
  const kind = resolveKind(job.player, job.crit);
  makeRoom();
  releaseUnit(job.node);
  const floater = rent();
  floater.life = 0;
  floater.evict = -1;
  floater.dur = durationOf(kind);
  floater.kind = kind;
  floater.ink = job.ink;
  floater.amount = job.amount;
  floater.target = job.node;
  seat(job.node, floater);
  floater.visX = 0;
  floater.visY = 0;
  overhead(job.node, floater.at);
  paint(floater);
  floater.node.active = true;
  floater.node.setSiblingIndex(_root.children.length - 1);
  const peak = scaleAt(kind, 0);
  floater.node.setScale(peak, peak, 1);
  floater.fade.opacity = 255;
  _live.push(floater);
}

function rent(): Floater {
  const got = _pool.pop();
  if (got) return got;
  const node = new Node('DmgFont');
  node.layer = Layers.Enum.UI_2D;
  _root!.addChild(node);
  node.addComponent(UITransform).setContentSize(220, 72);
  const fade = node.addComponent(UIOpacity);

  const num = new Node('num');
  num.layer = Layers.Enum.UI_2D;
  node.addChild(num);
  num.addComponent(UITransform).setContentSize(220, 72);
  const lab = num.addComponent(Label);
  lab.useSystemFont = true;
  lab.fontFamily = 'Microsoft YaHei';
  lab.isBold = true;
  lab.fontSize = Math.round(FONT_HIT * UI);
  lab.lineHeight = Math.round(FONT_HIT * UI) + 2;
  lab.color = INK_HIT;
  lab.enableOutline = true;
  lab.outlineColor = EDGE;
  lab.outlineWidth = 2;
  lab.horizontalAlign = Label.HorizontalAlign.CENTER;
  lab.verticalAlign = Label.VerticalAlign.CENTER;
  lab.overflow = Label.Overflow.NONE;
  passThrough(num);

  const digits = new Node('digits');
  digits.layer = Layers.Enum.UI_2D;
  node.addChild(digits);
  digits.addComponent(UITransform).setContentSize(220, ART_CRIT);
  digits.active = false;
  passThrough(digits);
  const cells: Sprite[] = [];
  for (let i = 0; i < ART_CELLS; i++) {
    const cell = new Node(`d${i}`);
    cell.layer = Layers.Enum.UI_2D;
    digits.addChild(cell);
    cell.addComponent(UITransform);
    const spr = cell.addComponent(Sprite);
    spr.sizeMode = Sprite.SizeMode.CUSTOM;
    cell.active = false;
    passThrough(cell);
    cells.push(spr);
  }
  return {
    node,
    lab,
    fade,
    life: 0,
    dur: DUR_HIT,
    evict: -1,
    layX: 0,
    layY: 0,
    visX: 0,
    visY: 0,
    at: new Vec3(),
    target: null,
    amount: 0,
    kind: 'hit',
    ink: 'plain',
    digits,
    cells,
  };
}

function loadArt(): void {
  loadDigits(0);
}

function loadDigits(attempt: number): void {
  if (_digitLoading) return;
  const missing: Array<{ ink: ArtInk; d: number }> = [];
  const inks: ArtInk[] = ['gun', 'flame', 'frost', 'bolt'];
  for (let s = 0; s < inks.length; s++) {
    const ink = inks[s];
    for (let d = 0; d < 10; d++) {
      if (!_digits[ink][d]) missing.push({ ink, d });
    }
  }
  if (!missing.length) {
    repaintArt();
    return;
  }
  _digitLoading = true;
  let left = missing.length;
  let failed = false;
  for (let i = 0; i < missing.length; i++) {
    const item = missing[i];
    resources.load(`ui/dmg/${item.ink}/${item.d}/spriteFrame`, SpriteFrame, (err, frame) => {
      if (!err && frame) _digits[item.ink][item.d] = frame;
      else failed = true;
      left -= 1;
      if (left > 0) return;
      _digitLoading = false;
      if (failed && attempt < 12) {
        setTimeout(() => loadDigits(attempt + 1), 400);
        return;
      }
      const inks: ArtInk[] = ['gun', 'flame', 'frost', 'bolt'];
      for (let s = 0; s < inks.length; s++) {
        const ink = inks[s];
        if (sheetReady(ink)) _artGiveUp[ink] = false;
        else if (attempt >= 12) _artGiveUp[ink] = true;
      }
      repaintArt();
    });
  }
}

function repaintArt(): void {
  for (let i = 0; i < _live.length; i++) {
    if (_live[i].ink !== 'plain') paint(_live[i]);
  }
}

/** Combat text sits on the canvas but must not eat taps on the plant bar. */
function passThrough(node: Node): void {
  const ui = node.getComponent(UITransform);
  if (!ui) return;
  (ui as unknown as { hitTest: () => boolean }).hitTest = () => false;
}

function place(floater: Floater, cam: Camera | null, canvas: Node | null, rise: number): boolean {
  const parent = floater.node.parent;
  if (!cam?.isValid || !canvas?.isValid || !parent?.isValid) return false;
  if (!projectWorldToUi(cam, _world, parent, _ui)) return false;
  floater.node.active = true;
  floater.node.setPosition(_ui.x + floater.visX * UI, _ui.y + (floater.visY + rise + HEAD_LIFT) * UI, 0);
  return true;
}

function overhead(node: Node, out: Vec3): void {
  const blood = findBlood(node);
  if (blood) {
    blood.getWorldPosition(out);
    return;
  }
  node.getWorldPosition(out);
  out.y += 0.8 * Math.abs(node.worldScale.y);
}

function findBlood(root: Node): Node | null {
  const direct = root.getChildByName('blood');
  if (direct?.isValid) return direct;
  const stack = root.children.slice();
  while (stack.length) {
    const n = stack.pop()!;
    if (n.name === 'blood') return n;
    for (let i = 0; i < n.children.length; i++) stack.push(n.children[i]);
  }
  return null;
}

/** 221 stays 221, 2150 becomes 2.15K. */
function formatCount(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v >= 1_000_000) return trimNum(v / 1_000_000) + 'M';
  if (v >= 1000) return trimNum(v / 1000) + 'K';
  return String(v);
}

function trimNum(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

function projectWorldToUi(cam: Camera, world: Vec3, parent: Node, out: Vec3): boolean {
  if (!cam?.isValid || !parent?.isValid || !parent.getComponent(UITransform)) return false;
  const eye = cam.node;
  Vec3.subtract(_eye, world, eye.worldPosition);
  const fwd = eye.forward;
  if (_eye.x * fwd.x + _eye.y * fwd.y + _eye.z * fwd.z < 0.15) return false;
  try {
    cam.camera?.update(true);
  } catch {
    // The view matrix from the last render is still usable.
  }
  cam.convertToUINode(world, parent, out);
  return true;
}

/** Small pop, then hold full size. Crits punch a little harder and stay larger. */
function scaleAt(kind: Kind, u: number): number {
  const peak = kind === 'crit' ? 1.35 : 1.18;
  const hold = kind === 'crit' ? 1.12 : 1;
  if (u <= 0.16) return hermite(0, peak, -1.6, 0.16, hold, 0, u);
  if (u <= 0.78) return hold;
  return hermite(0.78, hold, 0, 1, hold * 0.92, 0, u);
}

/** Slow lift on the 720 canvas. About 22px on this 1080 canvas, across the whole life. */
function offsetYAt(u: number): number {
  return hermite(0, 0, 18, 1, 14, 0, u);
}

/** Stay solid, then fade in the last stretch. Crits hold longer. */
function alphaAt(kind: Kind, u: number): number {
  const hold = kind === 'crit' ? 0.8 : 0.72;
  if (u <= hold) return 1;
  return hermite(hold, 1, 0, 1, 0, 0, u);
}

function hermite(t0: number, v0: number, outSlope: number, t1: number, v1: number, inSlope: number, t: number): number {
  const dt = t1 - t0;
  const u = dt > 1e-5 ? (t - t0) / dt : 0;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return h00 * v0 + h10 * dt * outSlope + h01 * v1 + h11 * dt * inSlope;
}
