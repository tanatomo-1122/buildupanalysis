import { PITCH_LENGTH, PITCH_WIDTH } from '../constants';
import type { PositionId, Player, TeamId } from '../types';
import { generateFormations } from './generate';
import { DEFAULT_SKILLS } from './skills';
import { isAllowedAt } from './zones';

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
  /**
   * 何列目か（1 = 最終ライン、2 = その前 …）。GK は 0。
   *
   * eFootball のフォーメーション名は **列ごとの人数**を並べたもの（4-2-3-1 なら
   * 最終ライン4・ボランチ2・2列目3・前線1）。ポジション名だけでは列は決まらない
   * （OMF は 4-1-3-2 では RMF/LMF と同じ列、3-3-1-3 では独立した列）ので、
   * 列は座標リテラルとは別に持つ。値は読み込み時に登録名と x の並び順から復元する。
   */
  line: number;
}

export interface Formation {
  /** 一意な ID。変種は `<family>@<shape>` の形 */
  id: string;
  label: string;
  desc: string;
  slots: FormationSlot[];
  /** 元になった基本形の ID（例 '4-4-2'）。基本形自身は自分の ID */
  family: string;
  /** 基本形の表示名（例 '4-4-2'） */
  familyLabel: string;
  /** タイプ ID（可変スロットのポジションを並べたもの。例 'RWG-CF-LWG'） */
  typeId: string;
  /** タイプの表示名（例 'CF+両WG'） */
  typeLabel: string;
  /** 前線の構成（例 'CF+両WG'） */
  frontLabel: string;
  /** 二列目の構成（例 '2CMF'） */
  secondLabel: string;
  /** 左右反転しても同じ形なら一致するキー。一覧の重複まとめに使う */
  symmetryKey: string;
}

const s = (number: number, position: PositionId, x: number, y: number): FormationSlot => ({
  number,
  position,
  x,
  y,
  line: 0, // 下の assignLines で埋める
});

type BaseFormation = Omit<
  Formation,
  | 'family'
  | 'familyLabel'
  | 'typeId'
  | 'typeLabel'
  | 'frontLabel'
  | 'secondLabel'
  | 'symmetryKey'
>;

const BASE_FORMATIONS: BaseFormation[] = [
  {
    id: '4-3-3',
    label: '4-3-3',
    desc: 'CMF3枚の逆三角形。ウイングが幅を取る。',
    slots: [
      s(1, 'GK', 7, 34),
      s(2, 'RSB', 26, 10),
      s(4, 'CB', 18, 27),
      s(5, 'CB', 18, 41),
      s(3, 'LSB', 26, 58),
      s(6, 'CMF', 42, 34),
      s(8, 'CMF', 58, 26),
      s(10, 'CMF', 58, 42),
      s(7, 'RWG', 78, 12),
      s(9, 'CF', 92, 34),
      s(11, 'LWG', 78, 56),
    ],
  },
  {
    id: '4-1-2-3',
    label: '4-1-2-3',
    desc: 'アンカー1枚＋インサイド2枚。4-3-3 との差はDMFを置くかどうか。',
    slots: [
      s(1, 'GK', 7, 34),
      s(2, 'RSB', 26, 10),
      s(4, 'CB', 18, 27),
      s(5, 'CB', 18, 41),
      s(3, 'LSB', 26, 58),
      s(6, 'DMF', 40, 34),
      s(8, 'CMF', 58, 27),
      s(10, 'CMF', 58, 41),
      s(7, 'RWG', 78, 12),
      s(9, 'CF', 92, 34),
      s(11, 'LWG', 78, 56),
    ],
  },
  {
    id: '4-1-3-2',
    label: '4-1-3-2',
    desc: 'アンカー＋2列目3枚＋2トップ。中央を厚くする。',
    slots: [
      s(1, 'GK', 7, 34),
      s(2, 'RSB', 26, 10),
      s(4, 'CB', 18, 27),
      s(5, 'CB', 18, 41),
      s(3, 'LSB', 26, 58),
      s(6, 'DMF', 40, 34),
      s(7, 'RMF', 58, 13),
      s(10, 'OMF', 60, 34),
      s(11, 'LMF', 58, 55),
      s(8, 'ST', 88, 27),
      s(9, 'CF', 90, 41),
    ],
  },
  {
    id: '4-1-4-1',
    label: '4-1-4-1',
    desc: 'アンカー＋中盤4枚のブロック。撤退時の守備が固い。',
    slots: [
      s(1, 'GK', 7, 34),
      s(2, 'RSB', 26, 10),
      s(4, 'CB', 18, 27),
      s(5, 'CB', 18, 41),
      s(3, 'LSB', 26, 58),
      s(6, 'DMF', 40, 34),
      s(7, 'RMF', 58, 12),
      s(8, 'CMF', 56, 27),
      s(10, 'CMF', 56, 41),
      s(11, 'LMF', 58, 56),
      s(9, 'CF', 90, 34),
    ],
  },
  {
    id: '3-4-3',
    label: '3-4-3',
    desc: '3バック＋中盤4枚＋3トップ。前線の幅が最大。',
    slots: [
      s(1, 'GK', 7, 34),
      s(4, 'CB', 19, 25),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 19, 43),
      s(2, 'RMF', 46, 11),
      s(7, 'CMF', 44, 28),
      s(8, 'CMF', 44, 40),
      s(3, 'LMF', 46, 57),
      s(10, 'RWG', 80, 13),
      s(9, 'CF', 92, 34),
      s(11, 'LWG', 80, 55),
    ],
  },
  {
    id: '3-2-3-2',
    label: '3-2-3-2',
    desc: '3バック＋2ボランチ＋2列目3枚＋2トップ。',
    slots: [
      s(1, 'GK', 7, 34),
      s(4, 'CB', 19, 25),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 19, 43),
      s(8, 'DMF', 42, 28),
      s(7, 'DMF', 42, 40),
      s(2, 'RMF', 60, 12),
      s(10, 'OMF', 62, 34),
      s(3, 'LMF', 60, 56),
      s(11, 'ST', 88, 27),
      s(9, 'CF', 90, 41),
    ],
  },
  {
    id: '3-2-2-3',
    label: '3-2-2-3',
    desc: '3バック＋2ボランチ＋トップ下2枚＋3トップ。前に人数を割く。',
    slots: [
      s(1, 'GK', 7, 34),
      s(4, 'CB', 19, 25),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 19, 43),
      s(8, 'DMF', 42, 28),
      s(7, 'DMF', 42, 40),
      s(10, 'OMF', 60, 27),
      s(11, 'OMF', 60, 41),
      s(2, 'RWG', 80, 11),
      s(9, 'CF', 92, 34),
      s(3, 'LWG', 80, 57),
    ],
  },
  {
    id: '3-3-1-3',
    label: '3-3-1-3',
    desc: '3バック＋中盤3枚＋トップ下＋3トップ。中央の縦の連結が強い。',
    slots: [
      s(1, 'GK', 7, 34),
      s(4, 'CB', 19, 25),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 19, 43),
      s(8, 'CMF', 44, 26),
      s(7, 'CMF', 40, 34),
      s(10, 'CMF', 44, 42),
      s(11, 'OMF', 62, 34),
      s(2, 'RWG', 80, 12),
      s(9, 'CF', 92, 34),
      s(3, 'LWG', 80, 56),
    ],
  },
  {
    id: '3-1-2-4',
    label: '3-1-2-4',
    desc: '3バック＋アンカー＋前線4枚。極端に前がかりな形。',
    slots: [
      s(1, 'GK', 7, 34),
      s(4, 'CB', 19, 25),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 19, 43),
      s(8, 'DMF', 40, 34),
      s(7, 'CMF', 58, 27),
      s(10, 'CMF', 58, 41),
      s(2, 'RWG', 82, 10),
      s(11, 'ST', 90, 26),
      s(9, 'CF', 92, 42),
      s(3, 'LWG', 82, 58),
    ],
  },
  {
    id: '2-2-4-2',
    label: '2-2-4-2',
    desc: '2バック＋2ボランチ＋中盤4枚＋2トップ。後方が薄い代わりに前が厚い。',
    slots: [
      s(1, 'GK', 7, 34),
      s(4, 'CB', 18, 28),
      s(5, 'CB', 18, 40),
      s(6, 'DMF', 40, 27),
      s(8, 'DMF', 40, 41),
      s(2, 'RMF', 58, 10),
      s(7, 'CMF', 58, 27),
      s(10, 'CMF', 58, 41),
      s(3, 'LMF', 58, 58),
      s(11, 'ST', 88, 27),
      s(9, 'CF', 90, 41),
    ],
  },
  {
    id: '4-2-1-3',
    label: '4-2-1-3',
    desc: 'ダブルボランチ＋トップ下。3トップで最終ラインを固定。',
    slots: [
      s(1, 'GK', 7, 34),
      s(2, 'RSB', 26, 10),
      s(4, 'CB', 18, 27),
      s(5, 'CB', 18, 41),
      s(3, 'LSB', 26, 58),
      s(6, 'DMF', 42, 27),
      s(8, 'DMF', 42, 41),
      s(10, 'OMF', 60, 34),
      s(7, 'RWG', 78, 12),
      s(9, 'CF', 92, 34),
      s(11, 'LWG', 78, 56),
    ],
  },
  {
    id: '4-2-3-1',
    label: '4-2-3-1',
    desc: '2列目3枚。サイドハーフがクロス／内側どちらも取れる。',
    slots: [
      s(1, 'GK', 7, 34),
      s(2, 'RSB', 26, 10),
      s(4, 'CB', 18, 27),
      s(5, 'CB', 18, 41),
      s(3, 'LSB', 26, 58),
      s(6, 'DMF', 42, 27),
      s(8, 'DMF', 42, 41),
      s(7, 'RMF', 62, 12),
      s(10, 'OMF', 62, 34),
      s(11, 'LMF', 62, 56),
      s(9, 'CF', 90, 34),
    ],
  },
  {
    id: '4-4-2',
    label: '4-4-2',
    desc: '2ラインのブロック。相手役として使いやすい。',
    slots: [
      s(1, 'GK', 7, 34),
      s(2, 'RSB', 26, 10),
      s(4, 'CB', 18, 27),
      s(5, 'CB', 18, 41),
      s(3, 'LSB', 26, 58),
      s(7, 'RMF', 54, 11),
      s(6, 'CMF', 50, 27),
      s(8, 'CMF', 50, 41),
      s(11, 'LMF', 54, 57),
      s(10, 'ST', 88, 27),
      s(9, 'CF', 88, 41),
    ],
  },
  {
    id: '4-2-2-2',
    label: '4-2-2-2',
    desc: 'ボックス型の中盤＋2トップ。中央の密度が高い。',
    slots: [
      s(1, 'GK', 7, 34),
      s(2, 'RSB', 26, 10),
      s(4, 'CB', 18, 27),
      s(5, 'CB', 18, 41),
      s(3, 'LSB', 26, 58),
      s(6, 'DMF', 42, 27),
      s(8, 'DMF', 42, 41),
      s(7, 'RMF', 62, 13),
      s(11, 'LMF', 62, 55),
      s(10, 'ST', 88, 27),
      s(9, 'CF', 88, 41),
    ],
  },
  {
    id: '3-2-4-1',
    label: '3-2-4-1',
    desc: '3バック＋2ボランチ。5レーン占位のビルドアップ検証向け。',
    slots: [
      s(1, 'GK', 7, 34),
      s(4, 'CB', 19, 25),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 19, 43),
      s(8, 'DMF', 42, 28),
      s(7, 'DMF', 42, 40),
      s(2, 'RWG', 72, 9),
      s(10, 'OMF', 60, 27),
      s(11, 'OMF', 60, 41),
      s(3, 'LWG', 72, 59),
      s(9, 'CF', 92, 34),
    ],
  },
  {
    id: '3-4-2-1',
    label: '3-4-2-1',
    desc: '3バック＋4枚の中盤。ウイングバックが上下する。',
    slots: [
      s(1, 'GK', 7, 34),
      s(4, 'CB', 19, 25),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 19, 43),
      s(2, 'RMF', 48, 10),
      s(7, 'CMF', 44, 28),
      s(8, 'CMF', 44, 40),
      s(3, 'LMF', 48, 58),
      s(10, 'OMF', 64, 27),
      s(11, 'OMF', 64, 41),
      s(9, 'CF', 90, 34),
    ],
  },
  {
    id: '5-3-2',
    label: '5-3-2',
    desc: '5バックの撤退ブロック。ローブロック相手の検証向け。',
    slots: [
      s(1, 'GK', 7, 34),
      s(2, 'RSB', 30, 9),
      s(4, 'CB', 20, 26),
      s(5, 'CB', 16, 34),
      s(6, 'CB', 20, 42),
      s(3, 'LSB', 30, 59),
      s(8, 'DMF', 42, 34),
      s(7, 'CMF', 58, 27),
      s(10, 'CMF', 58, 41),
      s(11, 'ST', 88, 28),
      s(9, 'CF', 88, 40),
    ],
  },
];
/**
 * 登録名と x の並び順から各スロットの列番号を復元する。
 *
 * 「4-2-3-1」なら x の小さい順に 4人・2人・3人・1人 と切る。
 * 17形すべてで名前が再現でき、どの形も列どうしが x で重なっていないことを
 * `tools/proto-naming.ts` で確認済み。
 */
const assignLines = (base: BaseFormation): void => {
  const digits = base.label.split('-').map(Number);
  const outfield = base.slots.filter((sl) => sl.position !== 'GK').sort((a, b) => a.x - b.x);
  let i = 0;
  digits.forEach((n, li) => {
    for (let k = 0; k < n; k++) {
      if (outfield[i]) outfield[i].line = li + 1;
      i++;
    }
  });
};
for (const b of BASE_FORMATIONS) assignLines(b);

/**
 * eFootball の命名規則。GK を除いて**列ごとの人数**を並べる。
 * 列は `FormationSlot.line` が持っているので、数えるだけで名前になる。
 */
export const formationName = (slots: FormationSlot[]): string => {
  const counts = new Map<number, number>();
  for (const sl of slots) {
    if (sl.position === 'GK' || sl.line === 0) continue;
    counts.set(sl.line, (counts.get(sl.line) ?? 0) + 1);
  }
  return [...counts.keys()]
    .sort((a, b) => a - b)
    .map((k) => counts.get(k))
    .join('-');
};

/* ------------------------------------------------------------------ *
 * フォーメーションの「タイプ」
 *
 * 同じ 4-3-3 でも、3トップが
 *   CF + 両ウイング / ST + 両ウイング / CF + 両ST / 3枚ともST …
 * のどれなのかで別の戦術になる。フォーメーション名は形を決めきらない。
 *
 * どのスロットがどのポジションを取れるかは `zones.ts` が既に持っているので
 * （R_ATT なら RWG か ST、C5 なら CF か ST、C3 なら OMF か CMF）、
 * **前線と二列目の組み合わせを総当たりで展開する**だけでタイプが出る。
 *
 * ポジションが変われば立ち位置も変わる（ワイドの ST はウイングより内側に絞るし、
 * CF は ST より前で張る）ので、座標も合わせて動かす。動かした先がそのポジションで
 * 許されないゾーンなら手前で止める（`legalize`）。
 * ------------------------------------------------------------------ */

/**
 * 目標座標まで動かすが、そのポジションで許されない位置なら元の座標側へ引き戻す。
 *
 * 丸めてから判定すること。先に判定して後から丸めると 67.96 → 68.0 で
 * 隣のゾーンへ滑り込む（ゾーンは [x0, x1) の半開区間）。
 */
const legalize = (
  slot: FormationSlot,
  position: PositionId,
  tx: number,
  ty: number,
): FormationSlot => {
  for (let t = 1; t >= 0; t -= 0.05) {
    const x = Math.round((slot.x + (tx - slot.x) * t) * 10) / 10;
    const y = Math.round((slot.y + (ty - slot.y) * t) * 10) / 10;
    if (isAllowedAt({ x, y }, 'home', position)) return { ...slot, position, x, y };
  }
  return { ...slot, position };
};

/**
 * ラインの高さを変える。GK は動かさず、フィールドの10人だけを前後させる。
 * 動かした先がそのポジションで許されないゾーンなら手前で止める。
 */
export const withLineShift = (slots: FormationSlot[], dx: number): FormationSlot[] => {
  if (dx === 0) return slots;
  return slots.map((sl) =>
    sl.position === 'GK' ? sl : legalize(sl, sl.position, sl.x + dx, sl.y),
  );
};

/**
 * 全カタログ。
 *
 * 手で書いた17形を展開するのはやめ、**4エリアの人数配分とエリア内の構成から生成**している
 * （`generate.ts`）。eFootball の名前は 最終ライン / ボランチ / 2列目 / 前線 の人数で
 * 決まるので、構成を作れば名前は自動的に決まる。手書きの17形は名前と中身が食い違っていた
 * （例: 旧「4-4-2」は RMF,CMF,CMF,LMF ＝ 規則どおりなら 4-2-2-2）。
 */
export const FORMATIONS: Formation[] = generateFormations();

/** 名前ごとの代表（＝その名前で最初に出てくる構成） */
export const FORMATION_FAMILIES: Formation[] = FORMATIONS.filter(
  (f, _i, arr) => arr.find((x) => x.family === f.family) === f,
);

/** その基本形のタイプをすべて返す */
export const typesOf = (family: string): Formation[] =>
  FORMATIONS.filter((f) => f.family === family);

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
