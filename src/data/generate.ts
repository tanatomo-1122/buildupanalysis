/**
 * フォーメーションの生成
 *
 * eFootball のエディットモードの規則（ユーザー提供のスプレッドシート）に従う。
 *
 * ■ 命名規則：GK を除く10人をレーンに分け、各レーンの人数を並べたものが名前
 *
 *   第1レーン : CB, LSB, RSB
 *   第2レーン : DMF, CMF, LMF, RMF
 *   第3レーン : OMF, LMF, RMF（**LMF/RMF は OMF が居るときだけ第3レーン**）
 *   第4レーン : ST, LWG, RWG, CF
 *
 *   4-4-2   … OMF 不在 → RMF,CMF,CMF,LMF はまとめて第2レーンの「4」
 *   4-2-3-1 … OMF が居る → RMF,OMF,LMF が第3レーンの「3」
 *   4-1-2-3 … DMF 1 + OMF 2 + 前線3（ユーザー確認済み）
 *   4-3-3   … DMF + CMF + CMF は全部まとめて第2レーンの「3」
 *             （DMF と CMF は同じレーンなので「4-1-2-3」にはならない）
 *
 * ■ 人数制限
 *
 *   ユニット        合計   ポジションごと
 *   守備 CB/LSB/RSB  2-5   CB 0-3 / LSB 0-1 / RSB 0-1
 *   中盤 DMF/CMF/
 *        LMF/RMF/OMF 1-6   DMF 0-6 / CMF 0-6 / LMF 0-1 / RMF 0-1 / OMF 0-6
 *   前線 ST/LWG/
 *        RWG/CF      1-5   ST 0-5 / LWG 0-1 / RWG 0-1 / CF 0-2
 *
 * レーン（名前の桁）とユニット（人数制限）は別物であることに注意。
 * 中盤ユニットは OMF の有無で第2・第3レーンに割れる。
 */
import { PITCH_WIDTH } from '../constants';
import type { PositionId } from '../types';
import type { Formation, FormationSlot } from './formations';
import { isAllowedAt } from './zones';

/* ── 規則の定義 ───────────────────────────────────────────── */

/** 人数制限のユニット */
export interface Unit {
  id: 'def' | 'mid' | 'att';
  label: string;
  /** ユニット合計の下限・上限 */
  total: [number, number];
  /** ポジションごとの下限・上限 */
  limits: { position: PositionId; min: number; max: number }[];
}

export const UNITS: Unit[] = [
  {
    id: 'def',
    label: '守備',
    total: [2, 5],
    limits: [
      { position: 'CB', min: 0, max: 3 },
      { position: 'RSB', min: 0, max: 1 },
      { position: 'LSB', min: 0, max: 1 },
    ],
  },
  {
    id: 'mid',
    label: '中盤',
    total: [1, 6],
    limits: [
      { position: 'DMF', min: 0, max: 6 },
      { position: 'CMF', min: 0, max: 6 },
      { position: 'RMF', min: 0, max: 1 },
      { position: 'LMF', min: 0, max: 1 },
      { position: 'OMF', min: 0, max: 6 },
    ],
  },
  {
    id: 'att',
    label: '前線',
    total: [1, 5],
    limits: [
      { position: 'ST', min: 0, max: 5 },
      { position: 'RWG', min: 0, max: 1 },
      { position: 'LWG', min: 0, max: 1 },
      { position: 'CF', min: 0, max: 2 },
    ],
  },
];

/** フィールドプレーヤーの人数 */
const OUTFIELD = 10;

/**
 * そのポジションが何レーン目に数えられるか。
 * LMF / RMF だけ、構成に OMF が居るかどうかで変わる。
 */
export const laneOf = (p: PositionId, all: PositionId[]): number => {
  switch (p) {
    case 'CB':
    case 'LSB':
    case 'RSB':
      return 1;
    case 'DMF':
    case 'CMF':
      return 2;
    case 'LMF':
    case 'RMF':
      return all.includes('OMF') ? 3 : 2;
    case 'OMF':
      return 3;
    default:
      return 4;
  }
};

/** レーンごとの人数を並べた名前。人数0のレーンは飛ばす */
export const formationName = (positions: PositionId[]): string =>
  [1, 2, 3, 4]
    .map((lane) => positions.filter((p) => laneOf(p, positions) === lane).length)
    .filter((n) => n > 0)
    .join('-');

/* ── 座標 ─────────────────────────────────────────────────── */

/** レーンの基準 x。ゾーンの段（34 / 51 / 68 / 86）の内側に収まる値 */
const LANE_X: Record<number, number> = { 1: 22, 2: 44, 3: 60, 4: 88 };

/** ポジションごとの前後の微調整 [m] */
const DEPTH: Partial<Record<PositionId, number>> = {
  CB: -4, RSB: 4, LSB: 4,
  DMF: -3, CMF: 2,
  OMF: 2, RMF: -1, LMF: -1,
  CF: 4, ST: -1, RWG: -8, LWG: -8,
};

/** 左右の持ち場。0 = 中央、負 = 右（y 小）、正 = 左（y 大） */
const SIDE: Partial<Record<PositionId, number>> = {
  RSB: -1, LSB: 1,
  RMF: -1, LMF: 1,
  RWG: -1, LWG: 1,
};

const CENTER_Y = PITCH_WIDTH / 2;
/** サイドの選手を置く y の振れ幅 */
const WIDE_Y = 22;

/** 中央の選手を人数に応じて横に散らす。中央ゾーンの幅（±12m）に収める */
const centralSpread = (count: number, index: number): number => {
  if (count <= 1) return 0;
  const step = Math.min(8, 20 / (count - 1));
  return (index - (count - 1) / 2) * step;
};

/**
 * その座標でそのポジションが許されるまで中央へ寄せる。
 *
 * 2万形ぶん呼ばれるが、(ポジション, x, y) の組み合わせはレーンと人数で決まるため
 * 実際には数百通りしかない。結果をキャッシュする。
 */
const placeCache = new Map<string, { x: number; y: number }>();

const place = (position: PositionId, x: number, y: number): { x: number; y: number } => {
  const xx = Math.round(x * 10) / 10;
  const key = `${position}|${xx}|${Math.round(y * 10)}`;
  const hit = placeCache.get(key);
  if (hit) return hit;
  let out = { x: xx, y: CENTER_Y };
  for (let t = 1; t >= 0; t -= 0.05) {
    const yy = Math.round((CENTER_Y + (y - CENTER_Y) * t) * 10) / 10;
    if (isAllowedAt({ x: xx, y: yy }, 'home', position)) {
      out = { x: xx, y: yy };
      break;
    }
  }
  placeCache.set(key, out);
  return out;
};

/* ── 列挙 ─────────────────────────────────────────────────── */

/** そのユニットに n 人置くときの、ありうる内訳 */
const unitCompositions = (unit: Unit, n: number): PositionId[][] => {
  const out: PositionId[][] = [];
  const walk = (i: number, left: number, acc: PositionId[]) => {
    if (i === unit.limits.length) {
      if (left === 0) out.push([...acc]);
      return;
    }
    const { position, min, max } = unit.limits[i];
    for (let k = min; k <= Math.min(max, left); k++) {
      for (let j = 0; j < k; j++) acc.push(position);
      walk(i + 1, left - k, acc);
      acc.length -= k;
    }
  };
  walk(0, n, []);
  return out;
};

/* ── 組み立て ─────────────────────────────────────────────── */

const buildSlots = (all: PositionId[]): FormationSlot[] => {
  const slots: FormationSlot[] = [];
  let number = 2;
  slots.push({ number: 1, position: 'GK', x: 7, y: CENTER_Y, line: 0 });

  const byLane = new Map<number, PositionId[]>();
  for (const p of all) {
    const lane = laneOf(p, all);
    byLane.set(lane, [...(byLane.get(lane) ?? []), p]);
  }

  for (const lane of [1, 2, 3, 4]) {
    const group = byLane.get(lane);
    if (!group) continue;
    // 右 → 中央 → 左 の順に並べる
    const sorted = [...group].sort((a, b) => (SIDE[a] ?? 0) - (SIDE[b] ?? 0));
    const centers = sorted.filter((p) => SIDE[p] === undefined);
    let ci = 0;
    for (const position of sorted) {
      const side = SIDE[position] ?? 0;
      const rawY =
        side !== 0 ? CENTER_Y + side * WIDE_Y : CENTER_Y + centralSpread(centers.length, ci++);
      const { x, y } = place(position, LANE_X[lane] + (DEPTH[position] ?? 0), rawY);
      slots.push({ number: number++, position, x, y, line: lane });
    }
  }
  return slots;
};

/**
 * 「CF+両WG」「2CMF+両MF」のようにまとめる。
 * 同じ内訳が何千形にも現れるのでキャッシュする。
 */
const summarizeCache = new Map<string, string>();

export const summarize = (group: PositionId[]): string => {
  if (group.length === 0) return '';
  const cacheKey = group.join(',');
  const cached = summarizeCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const sides = group.filter((p) => SIDE[p] !== undefined);
  const centers = group.filter((p) => SIDE[p] === undefined);
  const counted = (list: PositionId[]) => {
    const m = new Map<PositionId, number>();
    for (const p of list) m.set(p, (m.get(p) ?? 0) + 1);
    return [...m.entries()].map(([p, n]) => (n > 1 ? `${n}${p}` : p)).join('+');
  };
  const paired =
    sides.length === 2 && sides[0].slice(1) === sides[1].slice(1)
      ? `両${sides[0].slice(1)}`
      : counted(sides);
  const out = [counted(centers), paired].filter(Boolean).join('+');
  summarizeCache.set(cacheKey, out);
  return out;
};

/** 左右を入れ替えたポジション */
const MIRROR: Partial<Record<PositionId, PositionId>> = {
  RSB: 'LSB', LSB: 'RSB',
  RMF: 'LMF', LMF: 'RMF',
  RWG: 'LWG', LWG: 'RWG',
};

/**
 * 左右反転しても同じ構成なら一致するキー。
 *
 * LSB / RSB などは独立して 0-1 なので「右SBだけ」の形も作られる。
 * それと「左SBだけ」の形は鏡写しで、相手が左右対称ならスコアも同じになる。
 * カタログには両方残す（相手が偏っていればどちらに置くかが効く）が、
 * 一覧ではこのキーでまとめて良い方だけを出す。
 */
const mirrorKey = (groups: PositionId[][]): string => {
  const norm = (gs: PositionId[][]) => gs.map((g) => [...g].sort().join(',')).join('|');
  const asIs = norm(groups);
  const flipped = norm(groups.map((g) => g.map((p) => MIRROR[p] ?? p)));
  return asIs < flipped ? asIs : flipped;
};

/** 構成からタイプ名を作る（レーンごとの内訳を ／ でつなぐ） */
const typeLabelOf = (slots: FormationSlot[]): string =>
  [1, 2, 3, 4]
    .map((lane) => slots.filter((sl) => sl.line === lane).map((sl) => sl.position))
    .filter((g) => g.length)
    .map((g) => summarize(g))
    .join('／');

/** 人数配分 × ユニット内の構成 を総当たりで生成する */
export const generateFormations = (): Formation[] => {
  const [def, mid, att] = UNITS;
  const out: Formation[] = [];

  for (let d = def.total[0]; d <= def.total[1]; d++) {
    for (let a = att.total[0]; a <= att.total[1]; a++) {
      const m = OUTFIELD - d - a;
      if (m < mid.total[0] || m > mid.total[1]) continue;

      for (const gd of unitCompositions(def, d))
        for (const gm of unitCompositions(mid, m))
          for (const ga of unitCompositions(att, a)) {
            const all = [...gd, ...gm, ...ga];
            const slots = buildSlots(all);
            const name = formationName(all);
            const typeLabel = typeLabelOf(slots);
            const key = [gd, gm, ga].map((g) => g.join(',')).join('|');

            out.push({
              id: `${name}#${key.replace(/[|,]/g, '_')}`,
              label: name,
              desc: `${name}（${typeLabel}）`,
              slots,
              family: name,
              familyLabel: name,
              typeId: key,
              typeLabel,
              frontLabel: summarize(ga),
              secondLabel: summarize(gm),
              symmetryKey: mirrorKey([gd, gm, ga]),
            });
          }
    }
  }
  return out;
};
