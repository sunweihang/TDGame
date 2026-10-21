/**
 * Lateral detour around the player tank.
 * The hull is published once a frame. Each monster samples its own polyline
 * and eases sideways. No grid, no search, no allocations.
 */

export type SkirtPlan = {
  want: number;
  pass: number;
  blocked: boolean;
  tight: boolean;
};

const LOOK = 12;
const BEHIND = 6.4;
/** Full offset this far before the hull, so the slide can finish its curve. */
const HOLD = 3.2;
const STEP = 0.75;
const LEAD = 0.55;
const LEAD_CAP = 2.2;
const SWITCH = 1.8;
const MAX_LAT = 9;

const _hull = {
  on: false,
  x: 0,
  z: 0,
  c: 1,
  s: 0,
  hx: 1.55,
  hz: 2.95,
  vx: 0,
  vz: 0,
};

const _cur = { seg: 0, into: 0 };
const _plan: SkirtPlan = { want: 0, pass: 0, blocked: false, tight: false };

function idle(pass: number): SkirtPlan {
  _plan.want = 0;
  _plan.pass = pass;
  _plan.blocked = false;
  _plan.tight = false;
  return _plan;
}

export function noteMonsterHull(
  x: number,
  z: number,
  c: number,
  s: number,
  hx: number,
  hz: number,
  vx: number,
  vz: number,
): void {
  _hull.on = true;
  _hull.x = x;
  _hull.z = z;
  _hull.c = c;
  _hull.s = s;
  _hull.hx = hx;
  _hull.hz = hz;
  _hull.vx = vx;
  _hull.vz = vz;
}

export function clearMonsterHull(): void {
  _hull.on = false;
}

/** Signed meters off the centerline. Positive is to the right of travel. */
export function skirtPlan(
  route: ReadonlyArray<readonly [number, number]>,
  seg: number,
  into: number,
  lat: number,
  pass: number,
  body: number,
): SkirtPlan {
  if (!_hull.on || route.length < 2 || seg >= route.length - 1) return idle(pass);

  const aHere = route[seg];
  const bHere = route[seg + 1];
  let sx = bHere[0] - aHere[0];
  let sz = bHere[1] - aHere[1];
  let span = Math.hypot(sx, sz);
  if (span < 1e-4) return idle(pass);
  const px = aHere[0] + (sx / span) * into;
  const pz = aHere[1] + (sz / span) * into;
  const dx = _hull.x - px;
  const dz = _hull.z - pz;
  if (dx * dx + dz * dz > 22 * 22) return idle(pass);

  const backed = rewind(route, seg, into, BEHIND);

  let lx = _hull.vx * LEAD;
  let lz = _hull.vz * LEAD;
  const lead = Math.hypot(lx, lz);
  if (lead > LEAD_CAP) {
    const k = LEAD_CAP / lead;
    lx *= k;
    lz *= k;
  }
  const hx = _hull.x + lx;
  const hz = _hull.z + lz;
  const c = _hull.c;
  const s = _hull.s;
  const halfX = _hull.hx;
  const halfZ = _hull.hz;

  let dNear = Infinity;
  let dFar = -Infinity;
  let wantR = -Infinity;
  let wantL = Infinity;
  let segI = _cur.seg;
  let intoI = _cur.into;
  let traveled = 0;
  const spanTotal = backed + LOOK;

  while (traveled <= spanTotal + 1e-6 && segI < route.length - 1) {
    const a = route[segI];
    const b = route[segI + 1];
    sx = b[0] - a[0];
    sz = b[1] - a[1];
    span = Math.hypot(sx, sz);
    if (span < 1e-4) {
      segI += 1;
      intoI = 0;
      continue;
    }
    sx /= span;
    sz /= span;
    const x = a[0] + sx * intoI;
    const z = a[1] + sz * intoI;
    const d = traveled - backed;
    const rx = sz;
    const rz = -sx;
    const relX = hx - x;
    const relZ = hz - z;
    const along = relX * sx + relZ * sz;
    const side = relX * rx + relZ * rz;
    const ax = Math.abs(c * sx - s * sz);
    const az = Math.abs(s * sx + c * sz);
    const alongSupport = halfX * ax + halfZ * az + body;
    if (Math.abs(along) <= alongSupport) {
      const sideSupport = halfX * Math.abs(c * rx + -s * rz) + halfZ * Math.abs(s * rx + c * rz) + body;
      if (Math.abs(side) < sideSupport || Math.abs(lat - side) < sideSupport) {
        if (d < dNear) dNear = d;
        if (d > dFar) dFar = d;
        const right = side + sideSupport;
        const left = side - sideSupport;
        if (right > wantR) wantR = right;
        if (left < wantL) wantL = left;
      }
    }
    const room = span - intoI;
    const step = Math.min(STEP, room, spanTotal - traveled);
    if (step <= 1e-4) break;
    intoI += step;
    traveled += step;
    if (intoI >= span - 1e-3) {
      segI += 1;
      intoI = 0;
    }
  }

  if (dNear === Infinity) return idle(pass);

  let fade = 0;
  if (dNear <= HOLD) {
    if (dNear <= 0) fade = dFar >= 0 ? 1 : smooth(1 + dFar / BEHIND);
    else fade = 1;
  } else if (dNear < LOOK) fade = smooth(1 - (dNear - HOLD) / (LOOK - HOLD));
  if (fade <= 0.001) return idle(pass);

  wantR = Math.min(MAX_LAT, wantR * fade);
  wantL = Math.max(-MAX_LAT, wantL * fade);

  let sidePick = pass;
  if (sidePick === 0) {
    if (lat > 0.7) sidePick = 1;
    else if (lat < -0.7) sidePick = -1;
    else if (Math.abs(wantL) + 0.45 < Math.abs(wantR)) sidePick = -1;
    else if (Math.abs(wantR) + 0.45 < Math.abs(wantL)) sidePick = 1;
    else sidePick = 1;
  } else {
    const mine = sidePick > 0 ? Math.max(0, wantR - lat) : Math.max(0, lat - wantL);
    const other = sidePick > 0 ? Math.max(0, lat - wantL) : Math.max(0, wantR - lat);
    if (other + SWITCH < mine) sidePick = -sidePick;
  }

  _plan.want = sidePick > 0 ? wantR : wantL;
  _plan.pass = sidePick;
  _plan.blocked = true;
  const short = sidePick > 0 ? lat < _plan.want - 0.7 : lat > _plan.want + 0.7;
  _plan.tight = dNear < 2.6 && dNear > -0.8 && short;
  return _plan;
}

function rewind(route: ReadonlyArray<readonly [number, number]>, seg: number, into: number, dist: number): number {
  let left = dist;
  while (left > 1e-4) {
    if (into > left) {
      into -= left;
      left = 0;
      break;
    }
    left -= into;
    if (seg <= 0) {
      into = 0;
      break;
    }
    seg -= 1;
    const a = route[seg];
    const b = route[seg + 1];
    into = Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  _cur.seg = seg;
  _cur.into = into;
  return dist - left;
}

const _ease = { lat: 0, vel: 0 };

/** Rate-limited slide toward `want`. The same object is reused; copy it out. */
export function easeSkirt(lat: number, vel: number, want: number, tight: boolean, dt: number): { lat: number; vel: number } {
  const err = want - lat;
  const urgent = tight && Math.abs(err) > 0.5;
  const w = urgent ? 4.4 : 2.15;
  const damp = urgent ? 1.08 : 1.3;
  let v = vel + (w * w * err - 2 * damp * w * vel) * dt;
  const cap = urgent ? 4.4 : 2.55;
  const limited = v > cap ? cap : v < -cap ? -cap : v;
  if (v !== limited) {
    const bleed = 5.5 * dt;
    v = v > limited ? Math.max(limited, v - bleed) : Math.min(limited, v + bleed);
  }
  _ease.lat = lat + v * dt;
  _ease.vel = v;
  return _ease;
}

function smooth(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}
