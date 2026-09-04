import { PITCH_LENGTH, PITCH_WIDTH } from '../constants';
import type { PositionId, TeamId, Vec2 } from '../types';

/**
 * ピッチの 11 ゾーン定義
 *
 * 3列（右サイド / 中央 / 左サイド）× 3段（守備 / 中盤 / 前線）を基本に、
 * 中央列だけ中盤段と前線段をそれぞれ2分割して 5 段にしたもの。
 *
 *   ┌──────────┬──────────┬──────────┐
 *   │          │  CF, ST  │          │   前線
 *   │ LWG, ST  ├──────────┤ RWG, ST  │
 *   │          │    ST    │          │
 *   ├──────────┼──────────┼──────────┤
 *   │          │ OMF, CMF │          │   中盤
 *   │ LMF, CMF ├──────────┤ RMF, CMF │
 *   │          │ CMF, DMF │          │
 *   ├──────────┼──────────┼──────────┤
 *   │   LSB    │    CB    │   RSB    │   守備（中央の最奥は GK）
 *   └──────────┴──────────┴──────────┘
 *
 * 座標はすべて「自チーム（+X 方向に攻める側）」の基準。
 * 相手チームの座標を判定するときは (105-x, 68-y) に鏡映してから引く。
 * こうすると左右の利き（RSB が相手から見て右）も自動的に保たれる。
 */

export type ZoneId =
  | 'R_DEF'
  | 'R_MID'
  | 'R_ATT'
  | 'L_DEF'
  | 'L_MID'
  | 'L_ATT'
  | 'C1'
  | 'C2'
  | 'C3'
  | 'C4'
  | 'C5';

export interface Zone {
  id: ZoneId;
  label: string;
  /** 自チーム基準の矩形 [x0, x1) × [y0, y1) */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** このゾーンに置けるポジション（先頭がデフォルト） */
  allowed: PositionId[];
}

/* ── 段の境界（X） ─────────────────────────────────────────── */
/** 守備段 / 中盤段 の境界 */
export const ROW_DEF_MID = 34;
/** 中盤段 / 前線段 の境界 */
export const ROW_MID_ATT = 68;
/** 中央列：中盤段のうち DMF 寄りと OMF 寄りの境界 */
export const C_MID_SPLIT = 51;
/** 中央列：前線段のうち ST 帯と CF 帯の境界 */
export const C_ATT_SPLIT = 86;

/* ── 列の境界（Y） ─────────────────────────────────────────── */
/** 右サイド / 中央 の境界。y が小さいほど「自チームから見て右」 */
export const COL_RIGHT = 22;
/** 中央 / 左サイド の境界 */
export const COL_LEFT = 46;

/** 中央守備ゾーンのうち、ここより後ろは GK の場所として予約する */
export const GK_DEPTH = 11;

export const ZONES: Zone[] = [
  {
    id: 'R_DEF',
    label: '右サイド 守備',
    x0: 0,
    x1: ROW_DEF_MID,
    y0: 0,
    y1: COL_RIGHT,
    allowed: ['RSB'],
  },
  {
    id: 'R_MID',
    label: '右サイド 中盤',
    x0: ROW_DEF_MID,
    x1: ROW_MID_ATT,
    y0: 0,
    y1: COL_RIGHT,
    allowed: ['RMF', 'CMF'],
  },
  {
    id: 'R_ATT',
    label: '右サイド 前線',
    x0: ROW_MID_ATT,
    x1: PITCH_LENGTH,
    y0: 0,
    y1: COL_RIGHT,
    allowed: ['RWG', 'ST'],
  },
  {
    id: 'C1',
    label: '中央 最終ライン',
    x0: 0,
    x1: ROW_DEF_MID,
    y0: COL_RIGHT,
    y1: COL_LEFT,
    allowed: ['CB'],
  },
  {
    id: 'C2',
    label: '中央 アンカー',
    x0: ROW_DEF_MID,
    x1: C_MID_SPLIT,
    y0: COL_RIGHT,
    y1: COL_LEFT,
    allowed: ['DMF', 'CMF'],
  },
  {
    id: 'C3',
    label: '中央 トップ下',
    x0: C_MID_SPLIT,
    x1: ROW_MID_ATT,
    y0: COL_RIGHT,
    y1: COL_LEFT,
    allowed: ['OMF', 'CMF'],
  },
  {
    id: 'C4',
    label: '中央 セカンドトップ',
    x0: ROW_MID_ATT,
    x1: C_ATT_SPLIT,
    y0: COL_RIGHT,
    y1: COL_LEFT,
    allowed: ['ST'],
  },
  {
    id: 'C5',
    label: '中央 最前線',
    x0: C_ATT_SPLIT,
    x1: PITCH_LENGTH,
    y0: COL_RIGHT,
    y1: COL_LEFT,
    allowed: ['CF', 'ST'],
  },
  {
    id: 'L_DEF',
    label: '左サイド 守備',
    x0: 0,
    x1: ROW_DEF_MID,
    y0: COL_LEFT,
    y1: PITCH_WIDTH,
    allowed: ['LSB'],
  },
  {
    id: 'L_MID',
    label: '左サイド 中盤',
    x0: ROW_DEF_MID,
    x1: ROW_MID_ATT,
    y0: COL_LEFT,
    y1: PITCH_WIDTH,
    allowed: ['LMF', 'CMF'],
  },
  {
    id: 'L_ATT',
    label: '左サイド 前線',
    x0: ROW_MID_ATT,
    x1: PITCH_LENGTH,
    y0: COL_LEFT,
    y1: PITCH_WIDTH,
    allowed: ['LWG', 'ST'],
  },
];

const byId = new Map(ZONES.map((z) => [z.id, z]));
export const zoneById = (id: ZoneId): Zone => byId.get(id)!;

/** 相手チームの座標を自チーム基準へ鏡映する（自チームならそのまま） */
export const toOwnFrame = (p: Vec2, team: TeamId): Vec2 =>
  team === 'home' ? p : { x: PITCH_LENGTH - p.x, y: PITCH_WIDTH - p.y };

/** 自チーム基準の座標を、そのチームの実座標へ戻す */
export const fromOwnFrame = toOwnFrame;

/** その座標が属するゾーン（team を渡すと相手側も正しく判定する） */
export const zoneAt = (p: Vec2, team: TeamId = 'home'): Zone => {
  const q = toOwnFrame(p, team);
  const x = Math.min(PITCH_LENGTH - 0.001, Math.max(0, q.x));
  const y = Math.min(PITCH_WIDTH - 0.001, Math.max(0, q.y));
  return (
    ZONES.find((z) => x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1) ?? zoneById('C1')
  );
};

/**
 * その座標で置けるポジション一覧。
 * 中央の最終ラインだけは、最奥側で GK が先頭に来る。
 */
export const allowedAt = (p: Vec2, team: TeamId = 'home'): PositionId[] => {
  const zone = zoneAt(p, team);
  if (zone.id !== 'C1') return zone.allowed;
  const q = toOwnFrame(p, team);
  return q.x < GK_DEPTH ? ['GK', 'CB'] : ['CB', 'GK'];
};

/** そのゾーンの既定ポジション */
export const defaultAt = (p: Vec2, team: TeamId = 'home'): PositionId => allowedAt(p, team)[0];

/** 現在のポジションがその場所で許されるか */
export const isAllowedAt = (p: Vec2, team: TeamId, position: PositionId): boolean =>
  allowedAt(p, team).includes(position);

/**
 * 自動是正。
 * ドロップ先のゾーンで現在のポジションが許されていなければ既定へ落とす。
 */
export const correctPosition = (
  p: Vec2,
  team: TeamId,
  current: PositionId,
): PositionId => (isAllowedAt(p, team, current) ? current : defaultAt(p, team));

/**
 * ポジショントグル。
 * そのゾーンで許されるポジションを順に切り替える（1つしか無ければそのまま）。
 */
export const togglePosition = (p: Vec2, team: TeamId, current: PositionId): PositionId => {
  const list = allowedAt(p, team);
  if (list.length <= 1) return list[0] ?? current;
  const i = list.indexOf(current);
  return list[(i + 1) % list.length];
};

/** 描画用に、そのチームの実座標系での矩形を返す */
export const zoneRect = (zone: Zone, team: TeamId) => {
  if (team === 'home') return { x: zone.x0, y: zone.y0, w: zone.x1 - zone.x0, h: zone.y1 - zone.y0 };
  return {
    x: PITCH_LENGTH - zone.x1,
    y: PITCH_WIDTH - zone.y1,
    w: zone.x1 - zone.x0,
    h: zone.y1 - zone.y0,
  };
};
