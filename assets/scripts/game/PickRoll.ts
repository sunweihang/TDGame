import { LubanTables } from '../config/luban/LubanTables.ts';
import type { CPickCard, CTurretLine } from '../config/luban/code/schema.ts';

export const KIND_PLANT = 1;
export const KIND_UPGRADE = 2;
export const KIND_STAT = 3;

export type FieldState = {
  emptySlot: boolean;
  upgradeable: boolean;
  turretReady: (id: number) => boolean;
};

export type Offer = {
  cardId: number;
  kind: number;
  rarity: number;
  title: string;
  desc: string;
  cost: number;
  icon: string;
  stat: number;
  value: number;
  percent: boolean;
  turretId: number;
  turretName: string;
};

const _taken = new Map<number, number>();

export function noteTaken(cardId: number): void {
  _taken.set(cardId, (_taken.get(cardId) ?? 0) + 1);
}

export function tierList(tiers: string): number[] {
  const out: number[] = [];
  const parts = tiers.split(',');
  for (let i = 0; i < parts.length; i++) {
    const n = Number(parts[i].trim());
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

/** Lowest turret on the line that contains this id. A new plant always uses it. */
export function baseTurret(id: number): number {
  if (!LubanTables.isLoaded || !Number.isFinite(id) || id <= 0) return 0;
  const line = lineOf(id);
  if (!line) return 0;
  return tierList(line.tiers)[0] ?? 0;
}

/** Next turret id in the same line, or null at the top tier. */
export function nextTurret(current: string): string | null {
  if (!LubanTables.isLoaded) return null;
  const id = Number(current);
  if (!Number.isFinite(id)) return null;
  const lines = LubanTables.tables.TbTurretLine.getDataList();
  for (let i = 0; i < lines.length; i++) {
    const tiers = tierList(lines[i].tiers);
    const at = tiers.indexOf(id);
    if (at >= 0 && at + 1 < tiers.length) return String(tiers[at + 1]);
  }
  return null;
}

export function rollOffers(field: FieldState): Offer[] {
  const rule = LubanTables.tables.TbPickRule.get(1);
  const count = rule?.offerCount ?? 3;
  const cards = LubanTables.tables.TbPickCard.getDataList();
  const eligible: CPickCard[] = [];
  for (let i = 0; i < cards.length; i++) {
    if (cardOk(cards[i], field)) eligible.push(cards[i]);
  }
  const byKind = new Map<number, CPickCard[]>();
  for (let i = 0; i < eligible.length; i++) {
    const card = eligible[i];
    const list = byKind.get(card.kind);
    if (list) list.push(card);
    else byKind.set(card.kind, [card]);
  }
  const kinds: number[] = [];
  byKind.forEach((_list, kind) => kinds.push(kind));
  const order = (rule?.distinctKind ?? true) ? spread(kinds, byKind, count) : fill(kinds, byKind, count);
  const used = new Set<number>();
  const offers: Offer[] = [];
  for (let i = 0; i < order.length; i++) {
    const pool = unused(byKind.get(order[i]) ?? [], used);
    const card = weighted(pool.length ? pool : (byKind.get(order[i]) ?? []), (row) => row.weight);
    if (!card) continue;
    const offer = toOffer(card, field);
    if (!offer) continue;
    used.add(card.id);
    offers.push(offer);
  }
  return offers;
}

function cardOk(card: CPickCard, field: FieldState): boolean {
  if (card.weight <= 0) return false;
  if (card.maxStack > 0 && (_taken.get(card.id) ?? 0) >= card.maxStack) return false;
  if (card.kind === KIND_PLANT) {
    if (!field.emptySlot) return false;
    if (card.turretId > 0) {
      const base = baseTurret(card.turretId);
      return base > 0 && field.turretReady(base);
    }
    return plantableLine(field) !== null;
  }
  if (card.kind === KIND_UPGRADE) return field.upgradeable;
  return card.kind === KIND_STAT;
}

function plantableLine(field: FieldState): CTurretLine | null {
  const lines = LubanTables.tables.TbTurretLine.getDataList();
  const ready: CTurretLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.plantWeight <= 0) continue;
    const first = tierList(line.tiers)[0];
    if (first && field.turretReady(first)) ready.push(line);
  }
  return weighted(ready, (line) => line.plantWeight);
}

function toOffer(card: CPickCard, field: FieldState): Offer | null {
  let title = card.title;
  let desc = card.desc;
  let icon = card.icon;
  let turretId = card.turretId;
  let turretName = '';
  if (card.kind === KIND_PLANT) {
    const line = card.turretId > 0 ? lineOf(card.turretId) : plantableLine(field);
    const id = line ? tierList(line.tiers)[0] : 0;
    if (!line || !id || !field.turretReady(id)) return null;
    turretId = id;
    turretName = line.name;
    title = title.split('{name}').join(line.name);
    desc = desc.split('{name}').join(line.name);
    if (line.icon) icon = line.icon;
  }
  return {
    cardId: card.id,
    kind: card.kind,
    rarity: card.rarity,
    title,
    desc,
    cost: card.cost,
    icon,
    stat: card.stat,
    value: card.value,
    percent: card.percent,
    turretId,
    turretName,
  };
}

function lineOf(id: number): CTurretLine | null {
  const lines = LubanTables.tables.TbTurretLine.getDataList();
  for (let i = 0; i < lines.length; i++) {
    if (tierList(lines[i].tiers).indexOf(id) >= 0) return lines[i];
  }
  return null;
}

function unused(cards: CPickCard[], used: Set<number>): CPickCard[] {
  const out: CPickCard[] = [];
  for (let i = 0; i < cards.length; i++) {
    if (!used.has(cards[i].id)) out.push(cards[i]);
  }
  return out;
}

function kindWeight(cards: CPickCard[]): number {
  let sum = 0;
  for (let i = 0; i < cards.length; i++) sum += Math.max(0, cards[i].weight);
  return sum;
}

/** One of each available kind first, then fill the rest. */
function spread(kinds: number[], byKind: Map<number, CPickCard[]>, count: number): number[] {
  const left = kinds.slice();
  const out: number[] = [];
  while (out.length < count && left.length) {
    const kind = weighted(left, (id) => kindWeight(byKind.get(id) ?? []));
    if (kind === null) break;
    out.push(kind);
    left.splice(left.indexOf(kind), 1);
  }
  return fillFrom(out, kinds, byKind, count);
}

function fill(kinds: number[], byKind: Map<number, CPickCard[]>, count: number): number[] {
  return fillFrom([], kinds, byKind, count);
}

function fillFrom(out: number[], kinds: number[], byKind: Map<number, CPickCard[]>, count: number): number[] {
  let guard = 0;
  while (out.length < count && kinds.length && guard < count * 4) {
    guard += 1;
    const kind = weighted(kinds, (id) => kindWeight(byKind.get(id) ?? []));
    if (kind === null) break;
    out.push(kind);
  }
  return out;
}

function weighted<T>(items: T[], weight: (item: T) => number): T | null {
  let sum = 0;
  for (let i = 0; i < items.length; i++) sum += Math.max(0, weight(items[i]));
  if (sum <= 0 || !items.length) return null;
  let roll = Math.random() * sum;
  for (let i = 0; i < items.length; i++) {
    roll -= Math.max(0, weight(items[i]));
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}
