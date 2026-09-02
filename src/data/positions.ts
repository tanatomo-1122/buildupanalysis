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

/** 適性のラベル（UI 表示用） */
export const fitLabel = (score: number): { label: string; tone: 'good' | 'ok' | 'weak' } => {
  if (score >= 95) return { label: '本職', tone: 'good' };
  if (score >= 70) return { label: '適性あり', tone: 'good' };
  if (score >= 50) return { label: '兼任可', tone: 'ok' };
  return { label: '専門外', tone: 'weak' };
};
