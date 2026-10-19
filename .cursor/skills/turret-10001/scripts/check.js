const fs = require('fs');
const path = require('path');

const NECK = 1.1666663885116577;
const failures = [];

function fail(message) {
  failures.push(message);
}

function near(value, expected, eps = 1e-4) {
  return Math.abs(value - expected) < eps;
}

function projectRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const marker = path.join(dir, 'assets', 'prefabs', 'turret', '10001.prefab');
    if (fs.existsSync(marker)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('10001 prefab not found from ' + start);
}

function nodeById(prefab, id) {
  return prefab[id];
}

function vec(node, key) {
  const value = node[key];
  if (!value) return null;
  return value;
}

const root = projectRoot(__dirname);
const prefabPath = path.join(root, 'assets', 'prefabs', 'turret', '10001.prefab');
const gunPath = path.join(root, 'assets', 'scripts', 'turret', 'TurretGun.ts');
const metaPath = path.join(root, 'assets', 'models', 'turret', '10001.fbx.meta');

const prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
const nodes = prefab.filter((item) => item && item.__type__ === 'cc.Node');

const heads = nodes.filter((node) => node._name === 'TurretHead');
const barrels = nodes.filter((node) => node._name === 'Barrel');
const bases = nodes.filter((node) => node._name === 'TurretBase');
if (heads.length !== 1) fail('TurretHead count is ' + heads.length + ', expected 1');
if (barrels.length !== 1) fail('Barrel count is ' + barrels.length + ', expected 1');
if (bases.length !== 1) fail('TurretBase count is ' + bases.length + ', expected 1');

const head = heads[0];
const barrel = barrels[0];
const base = bases[0];

if (head && barrel && base) {
  const headParent = nodeById(prefab, head._parent.__id__);
  const barrelParent = nodeById(prefab, barrel._parent.__id__);
  const baseParent = nodeById(prefab, base._parent.__id__);
  const rot = vec(headParent, '_lrot');
  if (!rot || !near(rot.x, -0.7071067811865476, 1e-6) || !near(rot.w, 0.7071067811865476, 1e-6) || !near(rot.y, 0) || !near(rot.z, 0)) {
    fail('inner 10001 must keep Rx(-90); clearing it lays the machine gun over');
  }
  if (baseParent !== headParent) fail('TurretBase and TurretHead must share the Rx(-90) parent');
  if (barrelParent !== head) fail('Barrel must stay a child of TurretHead so recoil stays in head space');

  const headPos = vec(head, '_lpos');
  const headRot = vec(head, '_lrot');
  if (!headPos || !near(headPos.x, 0) || !near(headPos.y, 0) || !near(headPos.z, NECK)) {
    fail('TurretHead must stay at the neck (0, 0, 1.1666663885116577), not at y = 1.51');
  }
  if (!headRot || !near(headRot.x, 0) || !near(headRot.y, 0) || !near(headRot.z, 0) || !near(headRot.w, 1)) {
    fail('TurretHead rest rotation must stay identity or the neck pivot tilts the head off the base');
  }

  const barrelPos = vec(barrel, '_lpos');
  const barrelRot = vec(barrel, '_lrot');
  if (!barrelPos || !near(barrelPos.x, 0) || !near(barrelPos.y, 0) || !near(barrelPos.z, -NECK)) {
    fail('Barrel node Z must stay -1.1666663885116577; the mesh is already at the face and the runtime lift cancels this offset');
  }
  if (!barrelRot || !near(barrelRot.x, 0) || !near(barrelRot.y, 0) || !near(barrelRot.z, 0) || !near(barrelRot.w, 1)) {
    fail('Barrel rest rotation must stay identity');
  }
}

const gun = fs.readFileSync(gunPath, 'utf8');
if (!gun.includes('YawPivot')) fail('TurretGun must yaw 10001 around YawPivot at the neck ring');
if (!gun.includes('setParent(pivot, true)')) fail('YawPivot reparent must keep the world pose or the head leaves the base');
if (!gun.includes('ox * ox + oy * oy + oz * oz > 1')) {
  fail('socket pivot must require a 1 m offset so turret 10000 is not moved onto this path');
}
if (!gun.includes('barrel.setPosition(p.x, p.y, 0)')) {
  fail('barrel local Z must be forced to 0 or the barrel sits on the neck');
}
if (!gun.includes('minZ > 0.8 && nodeZ < -0.4')) {
  fail('barrel lift must stay gated on the face-height mesh plus the neck offset');
}
if (!gun.includes('chainRotation')) fail('yaw axis must come from the local rotation chain, not a stale world rotation');

const meta = fs.readFileSync(metaPath, 'utf8');
if (!meta.includes('"name": "Fire"')) fail('10001 fire split must be named Fire');
if (!meta.includes('"previousId": "73b7f"')) fail('10001 Fire previousId must stay 73b7f');

if (failures.length) {
  for (let i = 0; i < failures.length; i++) console.error(failures[i]);
  process.exit(1);
}
console.log('OK');
