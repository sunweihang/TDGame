import { Camera, Color, Node, Sprite, UITransform, Vec3 } from 'cc';

/** Gate stones start this far down the sprite. Crystals above that are not the face. */
const FACE = 0.12;
/** Hold full red, then ease back to the painted colors. */
const FLASH = 0.28;

const _world = new Vec3();
const _eye = new Vec3();
const _ui = new Vec3();
const _tint = new Color(255, 255, 255, 255);

let _left = 0;

function wallSprite(scene: Node | null): { sprite: Sprite; face: number } | null {
  const canvas = scene?.getChildByName('Canvas');
  const wall = canvas?.getChildByName('BaseWall');
  const ui = wall?.getComponent(UITransform);
  const sprite = wall?.getComponent(Sprite);
  if (!wall || !ui || !sprite) return null;
  const top = wall.position.y + ui.contentSize.height;
  return { sprite, face: top - ui.contentSize.height * FACE };
}

/** One red pulse. A later hit restarts it. */
export function touchWall(): void {
  _left = FLASH;
}

export function tickWallFlash(dt: number, scene: Node | null): void {
  const wall = wallSprite(scene);
  if (!wall) return;
  if (_left <= 0) {
    if (wall.sprite.color.g < 250) {
      _tint.set(255, 255, 255, 255);
      wall.sprite.color = _tint;
    }
    return;
  }
  _left = Math.max(0, _left - dt);
  const u = _left / FLASH;
  const k = u > 0.7 ? 1 : u / 0.7;
  const punch = k * k;
  const c = Math.round(255 - 210 * punch);
  _tint.set(255, c, c, 255);
  wall.sprite.color = _tint;
}

/**
 * Ground point is on the castle side of the wall.
 * `slack` in canvas pixels: positive counts grass just in front of the gate too.
 */
export function pastWall(scene: Node | null, x: number, z: number, slack = 0): boolean {
  if (!scene) return false;
  const cam = scene.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
  const canvas = scene.getChildByName('Canvas');
  const face = wallSprite(scene)?.face;
  if (!cam || !canvas?.getComponent(UITransform) || face === undefined) return false;
  _world.set(x, 0.02, z);
  Vec3.subtract(_eye, _world, cam.node.worldPosition);
  const fwd = cam.node.forward;
  if (_eye.x * fwd.x + _eye.y * fwd.y + _eye.z * fwd.z < 0.15) return false;
  try {
    cam.camera?.update(true);
    cam.convertToUINode(_world, canvas, _ui);
  } catch {
    return false;
  }
  return _ui.y < face + slack;
}
