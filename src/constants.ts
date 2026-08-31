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
  passWeightEnabled: true,
  passMu: 18,
  passSigma: 12,
  opponentUsesVector: true,
  clipNegativeProgress: false,
};

export const STORAGE_KEY = 'buildup-board:v2';
