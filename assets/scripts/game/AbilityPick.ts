import {
  BlockInputEvents,
  Button,
  Color,
  Graphics,
  Label,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  Widget,
  director,
  resources,
} from 'cc';
import { goldCount, onEnergyFull, spendGold, writeEnergy } from '../effect/KillLoot.ts';
import { gateBaseMax, grantGateHp } from '../effect/WallFlash.ts';
import { LubanTables } from '../config/luban/LubanTables.ts';
import { applyStat, STAT_HP } from './BattleMods.ts';
import { KIND_PLANT, KIND_UPGRADE, noteTaken, rollOffers, type Offer } from './PickRoll.ts';
import { setPicking } from './PlaceHint.ts';
import { holdPlantBattle } from './PlantMarks.ts';
import { livePlacer } from '../turret/TurretPlacer.ts';

/**
 * Three-offer popup. Opens when the energy vial reaches 100.
 * Cards are rolled from the Luban pick tables.
 * A plant card arms one turret. An upgrade card waits for a tap on a turret.
 * Stat cards apply as soon as they are bought.
 * The plate is the shared HUD glass (the progress-bar card).
 * Card faces, icons, coins, the recommend ribbon, and the three buttons are drawn skins.
 * Measured from the 684×1024 reference, then scaled onto the 1080-wide frame.
 */

const PANEL_W = 860;
const PANEL_H = 980;
const PANEL_Y = 30;

const CARD_W = 244;
const CARD_H = 520;
const CARD_X = [-260, 0, 260];
const CARD_Y = 24;

const TITLE_Y = 424;
const BTN_W = 320;
const BTN_H = 86;
const FREE_W = BTN_W / 2;
/** Half a reroll button, then one third taller. */
const FREE_H = Math.round((BTN_H / 2) * (4 / 3));
const FREE_Y = -295;
const ROLL_X = [-172, 172];
const ROLL_Y = -395;

const GLASS = 'ui/hud/glass/spriteFrame';

const CARD_ART = [
  'ui/ability/card-common/spriteFrame',
  'ui/ability/card-rare/spriteFrame',
  'ui/ability/card-epic/spriteFrame',
];
/** Shared anchor. The three pits are the same size; only the tint changes. */
const ICON_Y = 28;
const ICON_BACK = [
  'ui/ability/icon-back/spriteFrame',
  'ui/ability/icon-back-rare/spriteFrame',
  'ui/ability/icon-back-epic/spriteFrame',
];
const ICON_BACK_SIZE = 214;
const ICON_SIZE = 172;
const COIN_ART = 'ui/ability/coin-gold/spriteFrame';
const BTN_ART = [
  'ui/ability/btn-free/spriteFrame',
  'ui/ability/btn-blue/spriteFrame',
  'ui/ability/btn-orange/spriteFrame',
];
const RIBBON_ART = 'ui/ability/ribbon-recommend/spriteFrame';
/** Watch-ad mark. Sits where the play triangle was, on the free and orange reroll buttons. */
const AD_ICON = 'ui/ability/icon-ad/spriteFrame';
const AD_W = 48;
const AD_X = -110;
const RIBBON_Y = CARD_H * 0.5 + 60;

type Tone = {
  fill: Color;
  edge: Color;
  tab: Color;
};

const TONES: Tone[] = [
  {
    fill: new Color(246, 233, 214, 255),
    edge: new Color(214, 176, 130, 255),
    tab: new Color(214, 168, 96, 255),
  },
  {
    fill: new Color(198, 226, 248, 255),
    edge: new Color(120, 176, 214, 255),
    tab: new Color(96, 168, 220, 255),
  },
  {
    fill: new Color(255, 170, 78, 255),
    edge: new Color(230, 110, 30, 255),
    tab: new Color(240, 120, 28, 255),
  },
];

const RARITY_NAME = ['普通', '稀有', '史诗'];
const _descInk = new Color(120, 78, 48, 255);

/** The ribbon sits on whichever offers share the highest rank, once the ranks differ. */
function topRibbon(offers: Offer[]): boolean[] {
  let best = 0;
  let least = 99;
  for (let i = 0; i < offers.length; i++) {
    const rank = offers[i].rarity;
    if (rank > best) best = rank;
    if (rank < least) least = rank;
  }
  const varied = offers.length > 1 && best > least;
  const marks: boolean[] = [];
  for (let i = 0; i < offers.length; i++) marks.push(varied && offers[i].rarity === best);
  return marks;
}

const _ink = new Color(92, 58, 32, 255);
const _white = new Color(255, 255, 255, 255);
const _titleEdge = new Color(16, 36, 56, 255);
const _shadeInk = new Color(6, 16, 12, 56);
const _grayInk = new Color(140, 140, 140, 255);

type PriceFace = {
  sprite: Sprite;
  label: Label;
  row: Node;
  coin: Node;
};

type CardView = {
  root: Node;
  rarity: Label;
  name: Label;
  desc: Label;
  face: Sprite;
  iconBack: Sprite;
  icon: Sprite;
  ribbon: Node;
};

const _faces: PriceFace[] = [];
const _cards: CardView[] = [];
const _offers: Offer[] = [];
const _frames = new Map<string, SpriteFrame>();
let _freeBtn: Node | null = null;
let _rollBlue: Node | null = null;
let _rollOrange: Node | null = null;
let _pick = 0;
let _freeLeft = 0;
let _loading = false;

let _root: Node | null = null;
let _shade: Node | null = null;
let _glass: Sprite | null = null;
let _open = false;
let _preview = false;
let _held = false;
let _choice = -1;

/** Build the hidden popup and listen for a full vial. */
export function mountAbilityPick(canvas: Node): void {
  if (_root?.isValid) return;
  const layer = canvas.layer;
  const root = new Node('ability-pick');
  root.layer = layer;
  canvas.addChild(root);
  root.addComponent(UITransform);
  const widget = root.addComponent(Widget);
  widget.isAlignTop = true;
  widget.isAlignBottom = true;
  widget.isAlignLeft = true;
  widget.isAlignRight = true;
  widget.top = 0;
  widget.bottom = 0;
  widget.left = 0;
  widget.right = 0;
  widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
  widget.updateAlignment();
  root.active = false;
  _root = root;

  const shade = new Node('shade');
  shade.layer = layer;
  root.addChild(shade);
  shade.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
  shade.addComponent(BlockInputEvents);
  shade.addComponent(Graphics);
  shade.on(Node.EventType.TOUCH_END, () => {
    if (_preview) closePreview();
  });
  _shade = shade;

  const panel = new Node('panel');
  panel.layer = layer;
  root.addChild(panel);
  const panelUi = panel.addComponent(UITransform);
  panelUi.setContentSize(PANEL_W, PANEL_H);
  panel.setPosition(0, PANEL_Y, 0);
  panel.addComponent(BlockInputEvents);
  const sprite = panel.addComponent(Sprite);
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sprite.type = Sprite.Type.SLICED;
  _glass = sprite;
  paintPlate(panel, PANEL_W, PANEL_H, 48, new Color(150, 196, 214, 255), new Color(220, 236, 244, 255));
  loadGlass();

  const title = text(panel, layer, 'title', '选择能力', 520, 64, 44, 52);
  title.node.setPosition(0, TITLE_Y, 0);
  title.color = _white;
  title.enableOutline = true;
  title.outlineColor = _titleEdge;
  title.outlineWidth = 3;

  for (let i = 0; i < 3; i++) buildCard(panel, layer, i);
  buildFree(panel, layer);
  _rollBlue = buildRoll(panel, layer, 0, BTN_ART[1], new Color(32, 132, 220, 255), new Color(16, 78, 160, 255), () => rollPaid());
  _rollOrange = buildRoll(panel, layer, 1, BTN_ART[2], new Color(242, 138, 36, 255), new Color(176, 78, 12, 255), () => rollFreeAd());
  onEnergyFull(() => {
    _preview = false;
    open();
  });
}

/** GM opens the same popup. A tap on the dimmed page closes that preview without spending energy. */
export function showAbilityPick(): void {
  if (_open || !_root?.isValid) return;
  _preview = true;
  open();
}

function open(): void {
  const root = _root;
  if (_open || !root?.isValid || _loading) return;
  if (!LubanTables.isLoaded) {
    _loading = true;
    LubanTables.load().then(
      () => {
        _loading = false;
        open();
      },
      (err) => {
        _loading = false;
        console.error('[AbilityPick] 三选一表加载失败', err);
        if (!_preview) writeEnergy(99);
        _preview = false;
      },
    );
    return;
  }
  const rolled = rollOffers(fieldSnapshot());
  if (!rolled.length) {
    console.warn('[AbilityPick] 没有可抽的卡');
    if (!_preview) writeEnergy(99);
    _preview = false;
    return;
  }
  _offers.length = 0;
  for (let i = 0; i < rolled.length; i++) _offers.push(rolled[i]);
  _freeLeft = LubanTables.tables.TbPickRule.get(1)?.freeReroll ?? 0;
  _open = true;
  setPicking(true);
  paintOffers();
  root.active = true;
  root.setSiblingIndex((root.parent?.children.length ?? 1) - 1);
  fitShade();
  if (!director.isPaused()) {
    director.pause();
    _held = true;
  }
}

function fieldSnapshot() {
  const placer = livePlacer();
  return {
    emptySlot: placer?.emptySlot() ?? false,
    upgradeable: placer?.canUpgrade() ?? false,
    turretReady: (id: number) => placer?.turretReady(id) ?? false,
  };
}

function recommendedIndex(): number {
  const marks = topRibbon(_offers);
  for (let i = 0; i < marks.length; i++) if (marks[i]) return i;
  return 0;
}

function offerCost(index: number): number {
  const offer = _offers[index];
  return offer ? offer.cost : 0;
}

function canAfford(index: number): boolean {
  return goldCount() >= offerCost(index);
}

function rollGold(): number {
  if (!LubanTables.isLoaded) return 0;
  return LubanTables.tables.TbPickRule.get(1)?.rerollGold ?? 0;
}

/** Gray every price the wallet cannot cover. The free button follows the current option only. */
function paintAfford(): void {
  for (let i = 0; i < _faces.length; i++) {
    const face = _faces[i];
    const shown = _cards[i]?.root.active ?? false;
    const ok = shown && canAfford(i);
    face.sprite.grayscale = shown && !ok;
    face.sprite.color = ok || !shown ? _white : _grayInk;
    face.label.color = ok || !shown ? _ink : _grayInk;
  }
  if (_freeBtn?.isValid) _freeBtn.active = !!_offers[_pick] && !canAfford(_pick);
  grayNode(_rollBlue, goldCount() < rollGold());
  grayNode(_rollOrange, _freeLeft <= 0);
}

function grayNode(node: Node | null, gray: boolean): void {
  if (!node?.isValid) return;
  const sprites = node.getComponentsInChildren(Sprite);
  for (let i = 0; i < sprites.length; i++) sprites[i].grayscale = gray;
}

function buy(index: number): void {
  if (!_open) return;
  const offer = _offers[index];
  if (!offer) return;
  _pick = index;
  if (!canAfford(index)) {
    paintAfford();
    return;
  }
  if (!commitOffer(offer)) {
    console.warn('[AbilityPick] 这张卡现在用不了', offer.title);
    return;
  }
  if (!spendGold(offer.cost)) {
    paintAfford();
    return;
  }
  noteTaken(offer.cardId);
  finish(index);
}

function takeFree(): void {
  if (!_open || canAfford(_pick)) return;
  const offer = _offers[_pick];
  if (!offer || !commitOffer(offer)) return;
  noteTaken(offer.cardId);
  finish(_pick);
}

function rollPaid(): void {
  if (!_open) return;
  const cost = rollGold();
  if (!spendGold(cost)) {
    paintAfford();
    return;
  }
  reroll();
}

function rollFreeAd(): void {
  if (!_open || _freeLeft <= 0) return;
  _freeLeft -= 1;
  reroll();
}

function reroll(): void {
  const rolled = rollOffers(fieldSnapshot());
  if (!rolled.length) {
    paintAfford();
    return;
  }
  _offers.length = 0;
  for (let i = 0; i < rolled.length; i++) _offers.push(rolled[i]);
  paintOffers();
}

function commitOffer(offer: Offer): boolean {
  if (offer.kind !== KIND_PLANT) livePlacer()?.cancelPlantAim();
  if (offer.kind === KIND_PLANT) {
    return livePlacer()?.armPlant(offer.turretId, offer.turretName) ?? false;
  }
  if (offer.kind === KIND_UPGRADE) {
    return livePlacer()?.armUpgrade() ?? false;
  }
  if (offer.stat === STAT_HP) {
    const gain = offer.percent ? Math.round(gateBaseMax() * offer.value / 100) : offer.value;
    grantGateHp(gain);
    return true;
  }
  applyStat(offer.stat, offer.value, offer.percent);
  return true;
}

function finish(index: number): void {
  if (!_open) return;
  _choice = index;
  _preview = false;
  _open = false;
  setPicking(false);
  if (_root?.isValid) _root.active = false;
  writeEnergy(0);
  if (_offers[index]?.kind === KIND_PLANT) {
    holdPlantBattle();
    _held = false;
  } else {
    resume();
  }
}

function closePreview(): void {
  if (!_open || !_preview) return;
  _preview = false;
  _open = false;
  setPicking(false);
  if (_root?.isValid) _root.active = false;
  resume();
}

function resume(): void {
  if (!_held) return;
  _held = false;
  if (director.isPaused()) director.resume();
}

function fitShade(): void {
  const root = _root;
  const shade = _shade;
  if (!root?.isValid || !shade?.isValid) return;
  root.getComponent(Widget)?.updateAlignment();
  const ui = root.getComponent(UITransform);
  if (!ui) return;
  const w = ui.width;
  const h = ui.height;
  if (w < 2 || h < 2) return;
  shade.getComponent(UITransform)?.setContentSize(w, h);
  const g = shade.getComponent(Graphics);
  if (!g) return;
  g.clear();
  g.fillColor = _shadeInk;
  g.rect(-w * 0.5, -h * 0.5, w, h);
  g.fill();
}

function loadGlass(): void {
  resources.load(GLASS, SpriteFrame, (err, frame) => {
    const sprite = _glass;
    if (!sprite?.isValid || err || !frame) {
      console.error('[AbilityPick] 毛玻璃加载失败', err);
      return;
    }
    const plate = sprite.node.getChildByName('plate');
    if (plate?.isValid) plate.active = false;
    sprite.spriteFrame = frame;
    sprite.type = Sprite.Type.SLICED;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.node.getComponent(UITransform)?.setContentSize(PANEL_W, PANEL_H);
  });
}

function paintOffers(): void {
  const marks = topRibbon(_offers);
  for (let i = 0; i < _cards.length; i++) {
    const card = _cards[i];
    const offer = _offers[i];
    card.root.active = !!offer;
    if (!offer) continue;
    const tone = Math.max(0, Math.min(TONES.length - 1, offer.rarity));
    card.rarity.string = RARITY_NAME[tone] ?? RARITY_NAME[0];
    card.name.string = offer.title;
    card.desc.string = offer.desc;
    card.ribbon.active = !!marks[i];
    paintFrame(card.face, CARD_ART[tone], CARD_W, CARD_H, card.root.getChildByName('plate'));
    paintFrame(card.iconBack, ICON_BACK[tone], ICON_BACK_SIZE, ICON_BACK_SIZE, null);
    paintFrame(card.icon, offer.icon, ICON_SIZE, ICON_SIZE, null);
    layoutPrice(_faces[i], String(offer.cost));
  }
  _pick = recommendedIndex();
  paintAfford();
}

function layoutPrice(face: PriceFace | undefined, cost: string): void {
  if (!face) return;
  face.label.string = cost;
  const priceW = Math.max(36, cost.length * 22 + 16);
  const coinW = 36;
  const gap = 8;
  const row = coinW + gap + priceW;
  const rowLeft = -row / 2;
  face.row.getComponent(UITransform)?.setContentSize(row, 44);
  face.coin.setPosition(rowLeft + coinW / 2, 0, 0);
  face.label.node.getComponent(UITransform)?.setContentSize(priceW, 44);
  face.label.node.setPosition(rowLeft + coinW + gap + priceW / 2, 0, 0);
}

function framePath(path: string): string {
  if (!path) return '';
  return path.endsWith('/spriteFrame') ? path : `${path}/spriteFrame`;
}

function paintFrame(sprite: Sprite, path: string, w: number, h: number, hide: Node | null): void {
  const key = framePath(path);
  if (!key || !sprite.isValid) return;
  const apply = (frame: SpriteFrame) => {
    if (!sprite.isValid) return;
    sprite.spriteFrame = frame;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.node.getComponent(UITransform)?.setContentSize(w, h);
    if (hide?.isValid) hide.active = false;
  };
  const cached = _frames.get(key);
  if (cached) {
    apply(cached);
    return;
  }
  resources.load(key, SpriteFrame, (err, frame) => {
    if (err || !frame) {
      console.error('[AbilityPick] 贴图加载失败', key, err);
      return;
    }
    _frames.set(key, frame);
    apply(frame);
  });
}

function buildCard(panel: Node, layer: number, index: number): void {
  const tone = TONES[index] ?? TONES[0];
  const node = new Node(`card-${index}`);
  node.layer = layer;
  panel.addChild(node);
  node.addComponent(UITransform).setContentSize(CARD_W, CARD_H);
  node.setPosition(CARD_X[index], CARD_Y, 0);
  paintPlate(node, CARD_W, CARD_H, 28, tone.fill, tone.edge);
  const face = frameSprite(node, layer, 'skin', CARD_W, CARD_H, 0, 0);
  const rarity = text(node, layer, 'rarity', '', 160, 34, 22, 28);
  rarity.node.setPosition(0, 228, 0);
  rarity.color = _white;
  rarity.enableOutline = true;
  rarity.outlineColor = _titleEdge;
  rarity.outlineWidth = 2;
  const banner = skinNode(node, layer, 'recommend', RIBBON_ART, 250, 68, 0, RIBBON_Y, null);
  banner.active = false;
  const mark = text(banner, layer, 'txt', '推荐', 120, 36, 26, 30);
  mark.node.setPosition(0, 10, 0);
  mark.color = _white;
  mark.enableOutline = true;
  mark.outlineColor = new Color(160, 80, 10, 255);
  mark.outlineWidth = 3;
  const iconBack = frameSprite(node, layer, 'icon-back', ICON_BACK_SIZE, ICON_BACK_SIZE, 0, ICON_Y);
  const icon = frameSprite(node, layer, 'icon-slot', ICON_SIZE, ICON_SIZE, 0, ICON_Y);

  const name = text(node, layer, 'name', '', CARD_W - 24, 44, 28, 34);
  name.node.setPosition(0, -112, 0);
  name.color = _ink;
  name.enableOutline = false;
  name.overflow = Label.Overflow.SHRINK;

  const desc = text(node, layer, 'desc', '', CARD_W - 28, 56, 20, 26);
  desc.node.setPosition(0, -162, 0);
  desc.color = _descInk;
  desc.enableOutline = false;
  desc.overflow = Label.Overflow.SHRINK;

  const coinW = 36;
  const cost = new Node('cost');
  cost.layer = layer;
  node.addChild(cost);
  cost.addComponent(UITransform).setContentSize(120, 44);
  cost.setPosition(0, -214, 0);
  const coin = new Node('coin');
  coin.layer = layer;
  cost.addChild(coin);
  coin.addComponent(UITransform).setContentSize(coinW, coinW);
  const skin = skinNode(coin, layer, 'skin', COIN_ART, coinW, coinW, 0, 0, null);
  const price = text(cost, layer, 'num', '', 72, 44, 30, 36);
  price.color = _ink;
  price.enableOutline = false;
  const sprite = skin.getComponent(Sprite);
  if (sprite) _faces[index] = { sprite, label: price, row: cost, coin };

  const button = node.addComponent(Button);
  button.transition = Button.Transition.SCALE;
  button.zoomScale = 0.97;
  button.duration = 0.12;
  node.on(Button.EventType.CLICK, () => buy(index), node);
  _cards[index] = { root: node, rarity, name, desc, face, iconBack, icon, ribbon: banner };
}

function frameSprite(parent: Node, layer: number, name: string, w: number, h: number, x: number, y: number): Sprite {
  const node = new Node(name);
  node.layer = layer;
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(w, h);
  node.setPosition(x, y, 0);
  const sprite = node.addComponent(Sprite);
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sprite.type = Sprite.Type.SIMPLE;
  return sprite;
}

function buildFree(panel: Node, layer: number): void {
  const node = pressButton(
    panel,
    layer,
    'free',
    '免费',
    FREE_W,
    FREE_H,
    0,
    FREE_Y,
    26,
    BTN_ART[0],
    new Color(32, 176, 168, 255),
    new Color(12, 110, 104, 255),
    () => takeFree(),
    true,
  );
  node.active = false;
  _freeBtn = node;
}

function buildRoll(
  panel: Node,
  layer: number,
  index: number,
  art: string,
  fill: Color,
  edge: Color,
  onTap: () => void,
): Node {
  return pressButton(
    panel,
    layer,
    `roll-${index}`,
    '换一换',
    BTN_W,
    BTN_H,
    ROLL_X[index],
    ROLL_Y,
    26,
    art,
    fill,
    edge,
    onTap,
    index === 1,
  );
}

function pressButton(
  parent: Node,
  layer: number,
  name: string,
  caption: string,
  w: number,
  h: number,
  x: number,
  y: number,
  size: number,
  art: string,
  fill: Color,
  edge: Color,
  onTap: () => void,
  ad = false,
): Node {
  const node = new Node(name);
  node.layer = layer;
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(w, h);
  node.setPosition(x, y, 0);
  const plate = paintPlate(node, w, h, h * 0.42, fill, edge);
  skinNode(node, layer, 'skin', art, w, h, 0, 0, plate);
  const lab = text(node, layer, 'txt', caption, w - 64, h, size, size + 8);
  lab.node.setPosition(16, 0, 0);
  lab.color = _white;
  lab.enableOutline = true;
  lab.outlineColor = edge;
  lab.outlineWidth = 2;
  if (ad) {
    const adW = Math.round(AD_W * (h / BTN_H));
    const adX = Math.round(AD_X * (w / BTN_W));
    skinNode(node, layer, 'ad', AD_ICON, adW, adW, adX, 0, null);
  }
  const button = node.addComponent(Button);
  button.transition = Button.Transition.SCALE;
  button.zoomScale = 0.97;
  button.duration = 0.12;
  node.on(Button.EventType.CLICK, onTap, node);
  return node;
}

function skinNode(
  parent: Node,
  layer: number,
  name: string,
  path: string,
  w: number,
  h: number,
  x: number,
  y: number,
  hide: Node | null,
): Node {
  const node = new Node(name);
  node.layer = layer;
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(w, h);
  node.setPosition(x, y, 0);
  const sprite = node.addComponent(Sprite);
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sprite.type = Sprite.Type.SIMPLE;
  resources.load(path, SpriteFrame, (err, frame) => {
    if (!sprite.isValid || err || !frame) {
      console.error('[AbilityPick] 贴图加载失败', path, err);
      return;
    }
    sprite.spriteFrame = frame;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    node.getComponent(UITransform)?.setContentSize(w, h);
    if (hide?.isValid) hide.active = false;
  });
  return node;
}

function plateNode(
  parent: Node,
  layer: number,
  name: string,
  w: number,
  h: number,
  radius: number,
  fill: Color,
  edge: Color,
): Node {
  const node = new Node(name);
  node.layer = layer;
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(w, h);
  paintPlate(node, w, h, radius, fill, edge);
  return node;
}

function paintPlate(node: Node, w: number, h: number, radius: number, fill: Color, edge: Color): Node {
  let plate = node.getChildByName('plate');
  if (!plate) {
    plate = new Node('plate');
    plate.layer = node.layer;
    node.addChild(plate);
    plate.addComponent(UITransform).setContentSize(w, h);
    plate.addComponent(Graphics);
  }
  const g = plate.getComponent(Graphics);
  if (!g) return plate;
  g.clear();
  g.fillColor = fill;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, radius);
  g.fill();
  if (edge.a > 0) {
    g.lineWidth = 4;
    g.strokeColor = edge;
    g.roundRect(-w * 0.5, -h * 0.5, w, h, radius);
    g.stroke();
  }
  return plate;
}

function text(
  parent: Node,
  layer: number,
  name: string,
  value: string,
  w: number,
  h: number,
  size: number,
  line: number,
): Label {
  const node = new Node(name);
  node.layer = layer;
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(w, h);
  const lab = node.addComponent(Label);
  lab.string = value;
  lab.useSystemFont = true;
  lab.fontFamily = 'Microsoft YaHei';
  lab.isBold = true;
  lab.fontSize = size;
  lab.lineHeight = line;
  lab.horizontalAlign = Label.HorizontalAlign.CENTER;
  lab.verticalAlign = Label.VerticalAlign.CENTER;
  lab.overflow = Label.Overflow.NONE;
  lab.color = _white;
  return lab;
}

