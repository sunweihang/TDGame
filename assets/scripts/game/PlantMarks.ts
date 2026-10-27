import {
  Director,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Quat,
  ParticleSystem,
  Texture2D,
  Vec3,
  director,
  game,
  gfx,
  resources,
  utils,
} from 'cc';
import { effectCenter, slotPad, tickBaseAuras } from '../effect/BaseAura.ts';
import { tickBaseGems } from '../effect/BaseGem.ts';
import { tickSlotHalos } from '../effect/SlotHalo.ts';

/**
 * Yellow arrow and ground ring on every empty base after a plant card.
 * The pictures are loaded up front: director.pause stops asset callbacks,
 * so a late load would leave the player with nothing to tap.
 */

const ARROW_TEX = 'plant/arrow/texture';
const RING_TEX = 'plant/ring/texture';
/** Bright line sits at 68% of the ring texture. The quad is this many stone-diameters wide. */
const RING_SPAN = 1.88;
const RING_Y = 0.1;
/** Arrow width over the stone radius. The picture is cropped tight to the arrow. */
const ARROW_SPAN = 0.78;
/** Up-down travel, in meters. The crystal bob is 0.16; the arrow needs to read from across the field. */
const ARROW_BOB = 0.9;
const ARROW_RATE = 4.2;

const _up = new Vec3();
const _out = new Vec3();

let _arrowMesh: Mesh | null = null;
let _ringMesh: Mesh | null = null;
let _arrowMat: Material | null = null;
let _ringMat: Material | null = null;
let _arrowAspect = 543 / 466;
let _battleHeld = false;
let _drawHooked = false;
const _arrows: MeshRenderer[] = [];
const _rings: MeshRenderer[] = [];

type ArrowBounce = {
  node: Node;
  x: number;
  y: number;
  z: number;
  ux: number;
  uy: number;
  uz: number;
  phase: number;
};
const _bounces: ArrowBounce[] = [];
let _bob = 0;

export function warmupPlantMarks(): void {
  resources.load(ARROW_TEX, Texture2D, (err, tex) => {
    if (err || !tex) {
      console.error('[PlantMarks] 箭头贴图加载失败', err);
      return;
    }
    _arrowAspect = tex.height / Math.max(tex.width, 1);
    _arrowMat = unlit(tex, 3);
    bind(_arrows, _arrowMat);
  });
  resources.load(RING_TEX, Texture2D, (err, tex) => {
    if (err || !tex) {
      console.error('[PlantMarks] 光圈贴图加载失败', err);
      return;
    }
    _ringMat = unlit(tex, 2);
    bind(_rings, _ringMat);
  });
}

/** Keep the pause the plant card already started. The base tap is what lets battle resume. */
export function holdPlantBattle(): void {
  _battleHeld = true;
  hookEffectDraw();
}

/**
 * director.pause skips component update, which freezes the crystals, rings, and particles.
 * The draw still runs, so those visuals keep stepping until the base is tapped.
 */
function hookEffectDraw(): void {
  if (_drawHooked) return;
  _drawHooked = true;
  director.on(Director.EVENT_BEFORE_DRAW, onDraw);
}

function onDraw(): void {
  if (_bounces.length) {
    const dt = Math.min(game.deltaTime, 0.05);
    if (dt > 0) stepArrows(dt);
  }
  stepHeldEffects();
}

function stepHeldEffects(): void {
  if (!_battleHeld || !director.isPaused()) return;
  const dt = Math.min(game.deltaTime, 0.05);
  if (dt <= 0) return;
  tickBaseGems(dt);
  tickBaseAuras(dt);
  tickSlotHalos(dt);
  const scene = director.getScene();
  if (!scene) return;
  const particles = scene.getComponentsInChildren(ParticleSystem);
  for (let i = 0; i < particles.length; i++) {
    if (particles[i].enabledInHierarchy) particles[i].update(dt);
  }
}

/** Drop the markers and, if a plant card is still waiting, resume the fight. */
export function releasePlantBattle(): void {
  clearPlantMarks();
  if (!_battleHeld) return;
  _battleHeld = false;
  if (director.isPaused()) director.resume();
}

export function clearPlantMarks(): void {
  _arrows.length = 0;
  _rings.length = 0;
  _bounces.length = 0;
  _bob = 0;
  const scene = director.getScene();
  if (!scene) return;
  const kids = scene.children;
  for (let i = kids.length - 1; i >= 0; i--) {
    const node = kids[i];
    if (node.name === 'plant-marks' && node.isValid) node.destroy();
  }
}

/** One arrow and one ring per empty base. Replaces any markers already showing. */
export function showPlantMarks(slots: readonly Node[]): void {
  clearPlantMarks();
  const host = markHost(slots[0]);
  if (!host) return;
  for (let i = 0; i < slots.length; i++) addMark(host, slots[i], i);
}

/** Arrows only, above turrets that still have a later tier. */
export function showUpgradeArrows(spots: readonly { slot: Node; turret: Node }[]): void {
  clearPlantMarks();
  const host = markHost(spots[0]?.slot);
  if (!host) return;
  for (let i = 0; i < spots.length; i++) addUpgradeArrow(host, spots[i].slot, spots[i].turret, i);
}

function markHost(slot: Node | undefined): Node | null {
  const scene = director.getScene();
  if (!scene || !slot?.isValid) return null;
  hookEffectDraw();
  const host = new Node('plant-marks');
  host.layer = slot.layer;
  scene.addChild(host);
  return host;
}

function stepArrows(dt: number): void {
  _bob += dt;
  for (let i = 0; i < _bounces.length; i++) {
    const mark = _bounces[i];
    if (!mark.node.isValid) continue;
    const bob = Math.sin(_bob * ARROW_RATE + mark.phase) * ARROW_BOB;
    mark.node.setWorldPosition(
      mark.x + mark.ux * bob,
      mark.y + mark.uy * bob,
      mark.z + mark.uz * bob,
    );
  }
}

function addMark(host: Node, slot: Node, index: number): void {
  if (!slot.isValid) return;
  const face = slot.getChildByName('Face');
  const pad = slotPad(slot);
  if (!face?.isValid || !pad || pad.radius < 0.2) return;
  const spot = effectCenter(slot);
  const x = spot ? spot.x : pad.x;
  const z = spot ? spot.z : pad.z;
  const layer = slot.layer;

  const span = pad.radius * 2 * RING_SPAN;
  const ring = new Node('plant-ring');
  host.addChild(ring);
  ring.layer = layer;
  ring.setWorldPosition(x, RING_Y, z);
  ring.setScale(span, 1, span);
  const ringMr = ring.addComponent(MeshRenderer);
  ringMr.mesh = ringMesh();
  ringMr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  ringMr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  ringMr.priority = 14;
  _rings.push(ringMr);
  if (_ringMat) ringMr.setSharedMaterial(_ringMat, 0);

  const arrowW = pad.radius * ARROW_SPAN;
  const arrowH = arrowW * _arrowAspect;
  const gem = slot.getChildByName('BaseGem');
  const useGem = !!gem?.isValid && gem.active;
  const basis = useGem && gem ? gem : face;
  basis.updateWorldTransform();
  const rot = basis.worldRotation;
  Vec3.transformQuat(_up, Vec3.UNIT_Y, rot);
  Vec3.transformQuat(_out, Vec3.UNIT_Z, rot);
  const half = useGem && gem ? Math.abs(gem.scale.y) * 0.5 : Math.abs(face.worldScale.y) * 0.5;
  const lift = half + arrowH * 0.42;
  const c = basis.worldPosition;
  const ax = c.x + _up.x * lift + _out.x * 0.35;
  const ay = c.y + _up.y * lift + _out.y * 0.35;
  const az = c.z + _up.z * lift + _out.z * 0.35;
  placeArrow(host, layer, rot, ax, ay, az, arrowW, arrowH, index);
}

/** Arrow above a planted gun. No ground ring. */
function addUpgradeArrow(host: Node, slot: Node, turret: Node, index: number): void {
  const face = slot.getChildByName('Face');
  const pad = slotPad(slot);
  if (!face?.isValid || !turret.isValid || !pad || pad.radius < 0.2) return;
  face.updateWorldTransform();
  const rot = face.worldRotation;
  Vec3.transformQuat(_up, Vec3.UNIT_Y, rot);
  Vec3.transformQuat(_out, Vec3.UNIT_Z, rot);
  const arrowW = pad.radius * ARROW_SPAN;
  const arrowH = arrowW * _arrowAspect;
  const top = turretTop(turret);
  const p = turret.worldPosition;
  const ax = p.x + _out.x * 0.4;
  const ay = top + arrowH * 0.2 + ARROW_BOB;
  const az = p.z + _out.z * 0.4;
  placeArrow(host, slot.layer, rot, ax, ay, az, arrowW, arrowH, index);
}

function placeArrow(
  host: Node,
  layer: number,
  rot: Quat,
  ax: number,
  ay: number,
  az: number,
  arrowW: number,
  arrowH: number,
  index: number,
): void {
  const arrow = new Node('plant-arrow');
  host.addChild(arrow);
  arrow.layer = layer;
  arrow.setWorldPosition(ax, ay, az);
  _bounces.push({
    node: arrow,
    x: ax,
    y: ay,
    z: az,
    ux: _up.x,
    uy: _up.y,
    uz: _up.z,
    phase: index * 0.7,
  });
  arrow.setWorldRotation(rot);
  arrow.setWorldScale(arrowW, arrowH, 1);
  const arrowMr = arrow.addComponent(MeshRenderer);
  arrowMr.mesh = arrowMesh();
  arrowMr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  arrowMr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  arrowMr.priority = 26;
  _arrows.push(arrowMr);
  if (_arrowMat) arrowMr.setSharedMaterial(_arrowMat, 0);
}

function turretTop(root: Node): number {
  root.updateWorldTransform();
  let top = root.worldPosition.y;
  const list = root.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < list.length; i++) {
    const box = list[i].model?.worldBounds;
    if (!box) continue;
    const y = box.center.y + box.halfExtents.y;
    if (y > top) top = y;
  }
  return top;
}

function bind(list: MeshRenderer[], mat: Material): void {
  for (let i = 0; i < list.length; i++) {
    if (list[i].isValid) list[i].setSharedMaterial(mat, 0);
  }
}

/** Technique 2 is additive, 3 is alpha blend. The ring glows; the arrow stays solid. */
function unlit(texture: Texture2D, technique: number): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique,
    defines: { USE_TEXTURE: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: true, depthWrite: false },
    },
  });
  mat.setProperty('mainTexture', texture);
  return mat;
}

/** Billboard card. +Y is the top of the picture, so the arrow tip points down. */
function arrowMesh(): Mesh {
  if (_arrowMesh) return _arrowMesh;
  _arrowMesh = utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, 0.5, -0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 0, 0, 1, 0, 1, 1],
    indices: [0, 3, 1, 3, 2, 1],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
  });
  return _arrowMesh;
}

/** Flat disc on the ground. */
function ringMesh(): Mesh {
  if (_ringMesh) return _ringMesh;
  _ringMesh = utils.MeshUtils.createMesh({
    positions: [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, 0, -0.5),
    maxPos: new Vec3(0.5, 0, 0.5),
  });
  return _ringMesh;
}
