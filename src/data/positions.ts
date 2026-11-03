import type { PositionId } from '../types';

/**
 * ポジション適性
 *
 * 「メインポジション X の選手を、フォーメーションのスロット Y に置いたときの適性」を
 * 0〜100 で表す。数値はサッカー的な近さの目安で、ここを書き換えれば
 * 起用の癖（サイドバックを中に入れるか等）をチューニングできる。
 */
const FIT: Partial<Record<PositionId, Partial<Record<PositionId, number>>>> = {
  GK: { GK: 100 },
  CB: { CB: 100, RSB: 60, LSB: 60, DMF: 55 },
  RSB: { RSB: 100, LSB: 70, CB: 62, RMF: 68, RWG: 52, DMF: 45 },
  LSB: { LSB: 100, RSB: 70, CB: 62, LMF: 68, LWG: 52, DMF: 45 },
  DMF: { DMF: 100, CMF: 82, CB: 58, RSB: 45, LSB: 45 },
  CMF: { CMF: 100, DMF: 80, OMF: 76, RMF: 62, LMF: 62 },
  RMF: { RMF: 100, LMF: 70, RWG: 82, CMF: 62, RSB: 62, OMF: 55 },
  LMF: { LMF: 100, RMF: 70, LWG: 82, CMF: 62, LSB: 62, OMF: 55 },
  OMF: { OMF: 100, CMF: 76, ST: 72, RMF: 56, LMF: 56, RWG: 50, LWG: 50 },
  RWG: { RWG: 100, LWG: 70, RMF: 80, ST: 56, CF: 50, OMF: 55 },
  LWG: { LWG: 100, RWG: 70, LMF: 80, ST: 56, CF: 50, OMF: 55 },
  ST: { ST: 100, CF: 86, OMF: 70, RWG: 56, LWG: 56 },
  CF: { CF: 100, ST: 86, OMF: 60, RWG: 50, LWG: 50 },
};

/** 該当が無い組み合わせの下限値（一応置けるが明らかに専門外） */
const FALLBACK = 15;
/** GK とフィールドプレーヤーの取り違えは実質禁止 */
const FORBIDDEN = -10000;

export const positionFit = (main: PositionId, slot: PositionId): number => {
  if ((main === 'GK') !== (slot === 'GK')) return FORBIDDEN;
  return FIT[main]?.[slot] ?? FALLBACK;
};

/** 登録できる適性ポジションの数 */
export const MAX_SUB_POSITIONS = 4;

/**
 * 適性ポジションとして登録されているときの適性。
 *
 * **メインと同じ 100**。eFootball では適性ポジションに就いていれば
 * そのポジションの選手として扱われるので、選考で差を付けない。
 * （80 にしていた頃は、全ポジションで本職と適性を1人ずつ用意しても
 *   11枠すべてが本職側に取られていた＝適性ポジションが死んでいた）
 *
 * 違いが出るのはプレースタイルの側。スタイルは自分の適用ポジション一覧で
 * 発動の可否が決まるので、そこは `vectors.ts` の `activeSkill` が見ている。
 */
const SUB_FIT = 100;
/** 適性ポジションを登録済みの選手を、そこに無いポジションに置いたときの上限 */
const OFF_LIST_CAP = 40;

/**
 * 選手ごとの適性。
 *
 * 適性ポジションが登録されていれば、それが正解として扱われる。
 *   メイン                → 100
 *   適性ポジション         → 100（メインと対等）
 *   どちらでもない         → 推測値を OFF_LIST_CAP で頭打ち（＝専門外）
 *
 * 未登録（配列が空）の選手は、従来どおり近さの表だけで推測する。
 * 登録済みの選手と未登録の選手が混ざっていても破綻しない。
 */
export const playerFit = (
  player: { position: PositionId; subPositions?: PositionId[] },
  slot: PositionId,
): number => {
  const base = positionFit(player.position, slot);
  if (base === FORBIDDEN) return FORBIDDEN;
  const subs = player.subPositions ?? [];
  if (subs.length === 0) return base;
  if (slot === player.position) return 100;
  if (subs.includes(slot)) return Math.max(base, SUB_FIT);
  return Math.min(base, OFF_LIST_CAP);
};

/**
 * その枠がメインなのか適性ポジションなのか。
 *
 * 適性値はどちらも 100 で同じなので、スコアからは区別できない。
 * 画面では区別して見せたいのでこちらを使う。
 */
export const aptitudeOf = (
  player: { position: PositionId; subPositions?: PositionId[] },
  slot: PositionId,
): 'main' | 'sub' | 'off' => {
  if (slot === player.position) return 'main';
  return (player.subPositions ?? []).includes(slot) ? 'sub' : 'off';
};

/** 適性のラベル（UI 表示用） */
export const fitLabel = (score: number): { label: string; tone: 'good' | 'ok' | 'weak' } => {
  if (score >= 95) return { label: '本職', tone: 'good' };
  if (score >= 70) return { label: '適性あり', tone: 'good' };
  if (score >= 50) return { label: '兼任可', tone: 'ok' };
  return { label: '専門外', tone: 'weak' };
};
