import { PITCH_LENGTH, PITCH_WIDTH } from '../constants';
import type { PositionId, Player, TeamId } from '../types';
import { DEFAULT_SKILLS } from './skills';

/**
 * フォーメーション（eFootball 表記）
 *
 * 座標は「自チーム（左→右に攻める側）」を基準に定義する。
 * 相手チームに適用するときは (105 - x, 68 - y) に鏡映するので、
 * 左右の利き（RSB が相手から見て右側に来ること）も自動的に正しくなる。
 */

export interface FormationSlot {
  number: number;
  position: PositionId;
  x: number;
  y: number;
}

export interface Formation {
  id: string;
  label: string;
  desc: string;
  slots: FormationSlot[];
}

const s = (number: number, position: PositionId, x: number, y: number): FormationSlot => ({
  number,
  position,
  x,
  y,
});

export const FORMATIONS: Formation[] = [
  {
    id: '4-3-3',
    label: '4-3-3',
    desc: 'CMF3枚の逆三角形。ウイングが幅を取る。',
    slots: [
      s(1, 'GK', 6, 34),
      s(2, 'RSB', 24, 8),
      s(4, 'CB', 17, 26),
      s(5, 'CB', 17, 42),
      s(3, 'LSB', 24, 60),
      s(6, 'CMF', 34, 34),
      s(8, 'CMF', 44, 22),
      s(10, 'CMF', 44, 46),
      s(7, 'RWG', 60, 8),
      s(9, 'CF', 66, 34),
      s(11, 'LWG', 60, 60),
    ],
  },
  {
    id: '4-1-2-3',
    label: '4-1-2-3',
    desc: 'アンカー1枚＋インサイド2枚。4-3-3 との差はDMFを置くかどうか。',
    slots: [
      s(1, 'GK', 6, 34),
      s(2, 'RSB', 24, 8),
      s(4, 'CB', 17, 26),
      s(5, 'CB', 17, 42),
      s(3, 'LSB', 24, 60),
      s(6, 'DMF', 30, 34),
      s(8, 'CMF', 44, 24),
      s(10, 'CMF', 44, 44),
      s(7, 'RWG', 60, 8),
      s(9, 'CF', 66, 34),
      s(11, 'LWG', 60, 60),
    ],
  },
  {
    id: '4-1-3-2',
    label: '4-1-3-2',
    desc: 'アンカー＋2列目3枚＋2トップ。中央を厚くする。',
    slots: [
      s(1, 'GK', 6, 34),
      s(2, 'RSB', 24, 8),
      s(4, 'CB', 17, 26),
      s(5, 'CB', 17, 42),
      s(3, 'LSB', 24, 60),
      s(6, 'DMF', 31, 34),
      s(7, 'RMF', 46, 12),
      s(10, 'OMF', 48, 34),
      s(11, 'LMF', 46, 56),
      s(8, 'ST', 62, 26),
      s(9, 'CF', 64, 42),
    ],
  },
  {
    id: '4-1-4-1',
    label: '4-1-4-1',
    desc: 'アンカー＋中盤4枚のブロック。撤退時の守備が固い。',
    slots: [
      s(1, 'GK', 6, 34),
      s(2, 'RSB', 24, 8),
      s(4, 'CB', 17, 26),
      s(5, 'CB', 17, 42),
      s(3, 'LSB', 24, 60),
      s(6, 'DMF', 31, 34),
      s(7, 'RMF', 46, 10),
      s(8, 'CMF', 44, 27),
      s(10, 'CMF', 44, 41),
      s(11, 'LMF', 46, 58),
      s(9, 'CF', 66, 34),
    ],
  },
  {
    id: '3-4-3',
    label: '3-4-3',
    desc: '3バック＋中盤4枚＋3トップ。前線の幅が最大。',
    slots: [
      s(1, 'GK', 6, 34),
      s(4, 'CB', 18, 20),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 18, 48),
      s(2, 'RMF', 36, 8),
      s(7, 'CMF', 34, 27),
      s(8, 'CMF', 34, 41),
      s(3, 'LMF', 36, 60),
      s(10, 'RWG', 58, 12),
      s(9, 'CF', 66, 34),
      s(11, 'LWG', 58, 56),
    ],
  },
  {
    id: '3-2-3-2',
    label: '3-2-3-2',
    desc: '3バック＋2ボランチ＋2列目3枚＋2トップ。',
    slots: [
      s(1, 'GK', 6, 34),
      s(4, 'CB', 18, 20),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 18, 48),
      s(8, 'DMF', 32, 26),
      s(7, 'DMF', 32, 42),
      s(2, 'RMF', 50, 10),
      s(10, 'OMF', 52, 34),
      s(3, 'LMF', 50, 58),
      s(11, 'ST', 66, 26),
      s(9, 'CF', 66, 42),
    ],
  },
  {
    id: '3-2-2-3',
    label: '3-2-2-3',
    desc: '3バック＋2ボランチ＋トップ下2枚＋3トップ。前に人数を割く。',
    slots: [
      s(1, 'GK', 6, 34),
      s(4, 'CB', 18, 20),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 18, 48),
      s(8, 'DMF', 32, 26),
      s(7, 'DMF', 32, 42),
      s(10, 'OMF', 50, 25),
      s(11, 'OMF', 50, 43),
      s(2, 'RWG', 62, 8),
      s(9, 'CF', 68, 34),
      s(3, 'LWG', 62, 60),
    ],
  },
  {
    id: '3-3-1-3',
    label: '3-3-1-3',
    desc: '3バック＋中盤3枚＋トップ下＋3トップ。中央の縦の連結が強い。',
    slots: [
      s(1, 'GK', 6, 34),
      s(4, 'CB', 18, 20),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 18, 48),
      s(8, 'CMF', 34, 22),
      s(7, 'CMF', 32, 34),
      s(10, 'CMF', 34, 46),
      s(11, 'OMF', 52, 34),
      s(2, 'RWG', 60, 8),
      s(9, 'CF', 68, 34),
      s(3, 'LWG', 60, 60),
    ],
  },
  {
    id: '3-1-2-4',
    label: '3-1-2-4',
    desc: '3バック＋アンカー＋前線4枚。極端に前がかりな形。',
    slots: [
      s(1, 'GK', 6, 34),
      s(4, 'CB', 18, 20),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 18, 48),
      s(8, 'DMF', 31, 34),
      s(7, 'CMF', 44, 26),
      s(10, 'CMF', 44, 42),
      s(2, 'RWG', 60, 7),
      s(11, 'ST', 64, 25),
      s(9, 'CF', 64, 43),
      s(3, 'LWG', 60, 61),
    ],
  },
  {
    id: '2-2-4-2',
    label: '2-2-4-2',
    desc: '2バック＋2ボランチ＋中盤4枚＋2トップ。後方が薄い代わりに前が厚い。',
    slots: [
      s(1, 'GK', 6, 34),
      s(4, 'CB', 16, 26),
      s(5, 'CB', 16, 42),
      s(6, 'DMF', 30, 26),
      s(8, 'DMF', 30, 42),
      s(2, 'RMF', 46, 8),
      s(7, 'CMF', 46, 27),
      s(10, 'CMF', 46, 41),
      s(3, 'LMF', 46, 60),
      s(11, 'ST', 64, 26),
      s(9, 'CF', 64, 42),
    ],
  },
  {
    id: '4-2-1-3',
    label: '4-2-1-3',
    desc: 'ダブルボランチ＋トップ下。3トップで最終ラインを固定。',
    slots: [
      s(1, 'GK', 6, 34),
      s(2, 'RSB', 24, 8),
      s(4, 'CB', 17, 26),
      s(5, 'CB', 17, 42),
      s(3, 'LSB', 24, 60),
      s(6, 'DMF', 33, 26),
      s(8, 'DMF', 33, 42),
      s(10, 'OMF', 48, 34),
      s(7, 'RWG', 60, 8),
      s(9, 'CF', 66, 34),
      s(11, 'LWG', 60, 60),
    ],
  },
  {
    id: '4-2-3-1',
    label: '4-2-3-1',
    desc: '2列目3枚。サイドハーフがクロス／内側どちらも取れる。',
    slots: [
      s(1, 'GK', 6, 34),
      s(2, 'RSB', 24, 8),
      s(4, 'CB', 17, 26),
      s(5, 'CB', 17, 42),
      s(3, 'LSB', 24, 60),
      s(6, 'DMF', 33, 26),
      s(8, 'DMF', 33, 42),
      s(7, 'RMF', 52, 10),
      s(10, 'OMF', 50, 34),
      s(11, 'LMF', 52, 58),
      s(9, 'CF', 66, 34),
    ],
  },
  {
    id: '4-4-2',
    label: '4-4-2',
    desc: '2ラインのブロック。相手役として使いやすい。',
    slots: [
      s(1, 'GK', 6, 34),
      s(2, 'RSB', 24, 8),
      s(4, 'CB', 17, 26),
      s(5, 'CB', 17, 42),
      s(3, 'LSB', 24, 60),
      s(7, 'RMF', 40, 10),
      s(6, 'CMF', 38, 26),
      s(8, 'CMF', 38, 42),
      s(11, 'LMF', 40, 58),
      s(10, 'ST', 58, 26),
      s(9, 'CF', 60, 42),
    ],
  },
  {
    id: '4-2-2-2',
    label: '4-2-2-2',
    desc: 'ボックス型の中盤＋2トップ。中央の密度が高い。',
    slots: [
      s(1, 'GK', 6, 34),
      s(2, 'RSB', 24, 8),
      s(4, 'CB', 17, 26),
      s(5, 'CB', 17, 42),
      s(3, 'LSB', 24, 60),
      s(6, 'DMF', 33, 26),
      s(8, 'DMF', 33, 42),
      s(7, 'RMF', 50, 12),
      s(11, 'LMF', 50, 56),
      s(10, 'ST', 62, 26),
      s(9, 'CF', 62, 42),
    ],
  },
  {
    id: '3-2-4-1',
    label: '3-2-4-1',
    desc: '3バック＋2ボランチ。5レーン占位のビルドアップ検証向け。',
    slots: [
      s(1, 'GK', 6, 34),
      s(4, 'CB', 18, 20),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 18, 48),
      s(8, 'DMF', 32, 26),
      s(7, 'DMF', 32, 42),
      s(2, 'RWG', 52, 6),
      s(10, 'OMF', 54, 25),
      s(11, 'OMF', 54, 43),
      s(3, 'LWG', 52, 62),
      s(9, 'CF', 68, 34),
    ],
  },
  {
    id: '3-4-2-1',
    label: '3-4-2-1',
    desc: '3バック＋4枚の中盤。ウイングバックが上下する。',
    slots: [
      s(1, 'GK', 6, 34),
      s(4, 'CB', 18, 20),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 18, 48),
      s(2, 'RMF', 38, 8),
      s(7, 'CMF', 34, 27),
      s(8, 'CMF', 34, 41),
      s(3, 'LMF', 38, 60),
      s(10, 'OMF', 54, 25),
      s(11, 'OMF', 54, 43),
      s(9, 'CF', 66, 34),
    ],
  },
  {
    id: '5-3-2',
    label: '5-3-2',
    desc: '5バックの撤退ブロック。ローブロック相手の検証向け。',
    slots: [
      s(1, 'GK', 6, 34),
      s(2, 'RSB', 28, 8),
      s(4, 'CB', 18, 22),
      s(5, 'CB', 15, 34),
      s(6, 'CB', 18, 46),
      s(3, 'LSB', 28, 60),
      s(8, 'DMF', 32, 34),
      s(7, 'CMF', 44, 24),
      s(10, 'CMF', 44, 44),
      s(11, 'ST', 60, 28),
      s(9, 'CF', 62, 40),
    ],
  },
];

export const formationById = (id: string): Formation =>
  FORMATIONS.find((f) => f.id === id) ?? FORMATIONS[0];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** スロットの座標を、そのチームの向きとライン高さに合わせて実座標へ変換する */
export const slotPosition = (slot: FormationSlot, team: TeamId, line: number) => {
  const x = team === 'home' ? slot.x + line : PITCH_LENGTH - slot.x - line;
  const y = team === 'home' ? slot.y : PITCH_WIDTH - slot.y;
  return { x: clamp(x, 1, PITCH_LENGTH - 1), y: clamp(y, 1, PITCH_WIDTH - 1) };
};

/**
 * フォーメーションを新規の選手配列に展開する（特性はポジション既定値）。
 * @param line 攻撃方向への全体押し上げ量 [m]（負値で自陣寄りに下げる）
 */
export const buildLineup = (team: TeamId, formationId: string, line: number): Player[] => {
  const formation = formationById(formationId);
  return formation.slots.map((slot) => {
    const defaults = DEFAULT_SKILLS[slot.position];
    return {
      id: `${team}-${slot.number}`,
      team,
      number: slot.number,
      position: slot.position,
      attackSkill: defaults.attack,
      defenseSkill: defaults.defense,
      pos: slotPosition(slot, team, line),
    };
  });
};

/**
 * 既にいる選手を、新しいフォーメーションの配置へ並べ替える。
 * 背番号で対応付け、**座標とポジションだけ**を差し替える。
 * 攻撃時・守備時の特性はそのまま引き継ぐ（新しいポジションで本来選べない
 * 特性であっても保持する）。
 */
export const rearrangeToFormation = (
  players: Player[],
  team: TeamId,
  formationId: string,
  line: number,
): Player[] => {
  const formation = formationById(formationId);
  const roster = players.filter((p) => p.team === team);
  const taken = new Set<string>();

  return formation.slots.map((slot, i) => {
    const src =
      roster.find((p) => p.number === slot.number && !taken.has(p.id)) ??
      (roster[i] && !taken.has(roster[i].id) ? roster[i] : undefined) ??
      roster.find((p) => !taken.has(p.id));

    const pos = slotPosition(slot, team, line);
    if (!src) {
      const defaults = DEFAULT_SKILLS[slot.position];
      return {
        id: `${team}-${slot.number}`,
        team,
        number: slot.number,
        position: slot.position,
        attackSkill: defaults.attack,
        defenseSkill: defaults.defense,
        pos,
      };
    }
    taken.add(src.id);
    return { ...src, number: slot.number, position: slot.position, pos };
  });
};

/**
 * 全22人の配列のうち、指定チームだけを新しいフォーメーションに差し替える。
 * 配列内の並び順は保つ（トークンの重なり順や選択状態がぶれないように）。
 */
export const withFormation = (
  players: Player[],
  team: TeamId,
  formationId: string,
  line: number,
): Player[] => {
  const queue = rearrangeToFormation(players, team, formationId, line);
  let i = 0;
  const next = players.map((p) => (p.team === team ? (queue[i++] ?? p) : p));
  if (i < queue.length) next.push(...queue.slice(i));
  return next;
};

/** そのチームの特性だけをポジション既定値に戻す（配置は変えない） */
export const resetSkills = (players: Player[], team: TeamId): Player[] =>
  players.map((p) => {
    if (p.team !== team) return p;
    const defaults = DEFAULT_SKILLS[p.position];
    return { ...p, attackSkill: defaults.attack, defenseSkill: defaults.defense };
  });
