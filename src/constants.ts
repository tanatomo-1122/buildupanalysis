import type { Params, PositionId, TeamId } from './types';

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;
export const PITCH_CENTER_Y = PITCH_WIDTH / 2;

/** チームの攻撃方向（+X / -X） */
export const attackDir = (team: TeamId): number => (team === 'home' ? 1 : -1);

/** そのチームが攻めるゴールの中央座標 */
export const targetGoal = (team: TeamId) => ({
  x: team === 'home' ? PITCH_LENGTH : 0,
  y: PITCH_CENTER_Y,
});

/** ポジションの表示色（ピッチ上のラベル用） */
export const POSITION_GROUP: Record<PositionId, 'GK' | 'DF' | 'MF' | 'FW'> = {
  GK: 'GK',
  CB: 'DF',
  LSB: 'DF',
  RSB: 'DF',
  DMF: 'MF',
  CMF: 'MF',
  LMF: 'MF',
  RMF: 'MF',
  OMF: 'MF',
  LWG: 'FW',
  RWG: 'FW',
  ST: 'FW',
  CF: 'FW',
};

/**
 * パスコース探索型モデルで「そのコースは開通している」とみなす PC の閾値。
 *
 * PC はボトルネック（コース上で最も詰まっている点）での保持側の支配率なので、
 * 0.5 は「その地点で保持側と守備側の影響力が拮抗している」点。上げるほど
 * 「本当にがら空きのコースしか数えない」保守的な判定になる。
 *
 * 当初の仮値は 0.65 だったが、実測（tools/sweep-threshold.ts）では
 * 自チーム側 1.16〜2.66・相手側 0.12〜0.48 と、相手側のレンジが1桁小さくなり、
 * バランス基準で守備側がほとんど効かなくなる。0.50 だと自チーム 4.00〜5.68 /
 * 相手 1.22〜3.03（SD 0.50 / 0.48）で両側のばらつきが揃うため、こちらを既定にしている。
 */
export const PASS_THRESHOLD = 0.5;

/**
 * 閾値の柔らかさ。0 にすると仕様どおりの硬いステップになる。
 *
 * 硬いステップだと、ボトルネック PC の分布が保持側・非保持側で 0.1 ほどずれている
 * ため、どの閾値を選んでも片側が 0 に張り付いて識別できなくなる（tools/sweep-threshold.ts）。
 * また山登り法から見ると「1人入れ替えても開通本数が1本も変わらない」場面が大半になり、
 * 勾配が消えて探索が即座に止まる。0.06 程度のシグモイドにすると、
 * 閾値付近の判定の意味は保ったまま両方の問題が解消する。
 */
export const PASS_SOFTNESS = 0.06;

export const DEFAULT_PARAMS: Params = {
  possessionTeam: 'home',
  holderMode: 'averageOutfield',
  scene: 'possession',
  homeStyle: 'possession',
  awayStyle: 'shortCounter',
  homeStyleIntensity: 1,
  awayStyleIntensity: 1,
  skillIntensity: 1,
  lambda: 8,
  pcMode: 'team',
  passLaneEnabled: true,
  laneShortMax: 12,
  laneLongMin: 35,
  laneSharpness: 2,
  passWeightEnabled: true,
  passMu: 18,
  passSigma: 12,
  opponentUsesVector: true,
  clipNegativeProgress: false,
  valueModel: 'progress',
  passThreshold: PASS_THRESHOLD,
  passSoftness: PASS_SOFTNESS,
};

export const STORAGE_KEY = 'buildup-board:v2';
