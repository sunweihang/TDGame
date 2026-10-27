/** Stat ids stored on TbPickCard.stat. */
export const STAT_ATK = 1;
export const STAT_DEF = 2;
export const STAT_HP = 3;
export const STAT_SPEED = 4;
export const STAT_CRIT = 5;
export const STAT_GOLD = 6;
export const STAT_RANGE = 7;

const BASE_CRIT = 0.2;
const CRIT_CAP = 0.8;
const DEF_CAP = 0.75;

let _atkPct = 0;
let _atkFlat = 0;
let _def = 0;
let _speed = 0;
let _crit = 0;
let _gold = 0;
let _range = 0;

/** Percent values in the table are whole points: 15 means 15%. */
export function applyStat(stat: number, value: number, percent: boolean): void {
  const frac = percent ? value / 100 : 0;
  const flat = percent ? 0 : value;
  if (stat === STAT_ATK) {
    _atkPct += frac;
    _atkFlat += flat;
    return;
  }
  if (stat === STAT_DEF) {
    _def = Math.min(DEF_CAP, _def + frac);
    return;
  }
  if (stat === STAT_SPEED) {
    _speed += frac;
    return;
  }
  if (stat === STAT_CRIT) {
    _crit = Math.min(CRIT_CAP - BASE_CRIT, _crit + frac);
    return;
  }
  if (stat === STAT_GOLD) {
    _gold += frac;
    return;
  }
  if (stat === STAT_RANGE) {
    _range += frac;
  }
}

/** Turret and tank hits, after the card bonuses. */
export function scaleHit(amount: number): number {
  return Math.max(0, amount * (1 + _atkPct) + _atkFlat);
}

export function critChance(): number {
  return Math.min(CRIT_CAP, BASE_CRIT + _crit);
}

/** Gate damage after defense. Reduction stops at 75%. */
export function gateTaken(amount: number): number {
  return Math.max(0, amount * (1 - _def));
}

/** Fire cooldown multiplier. 12% speed makes the gap 1/1.12. */
export function coolScale(): number {
  return 1 / (1 + Math.max(0, _speed));
}

export function rangeScale(): number {
  return 1 + Math.max(0, _range);
}

/** Gold that actually lands on the HUD. */
export function goldPayout(n: number): number {
  if (n <= 0) return 0;
  return Math.max(0, Math.round(n * (1 + _gold)));
}
