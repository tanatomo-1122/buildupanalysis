import { DEFAULT_PARAMS } from './constants';
import { buildLineup, formationByPositions } from './data/formations';
import type { BoardState, PositionId } from './types';

/**
 * 戦術ボードを最初に開いたときの盤面。
 *
 * フォーメーションの ID は生成カタログのもの（`4-3-3#CB_CB_…`）なので、
 * ここでは名前ではなく「ポジションの内訳」から引く。
 * （以前は '4-4-2' のような名前を ID として渡していて、カタログ刷新後は
 *   見つからず先頭の 2-6-2 に化けていた）
 */
const idOf = (positions: PositionId[]): string => {
  const f = formationByPositions(['GK', ...positions]);
  if (!f) throw new Error(`初期盤面の形がカタログにありません: ${positions.join(',')}`);
  return f.id;
};

const HOME_433: PositionId[] = ['CB', 'CB', 'LSB', 'RSB', 'DMF', 'CMF', 'CMF', 'LWG', 'RWG', 'ST'];
const AWAY_4231: PositionId[] = ['CB', 'CB', 'LSB', 'RSB', 'DMF', 'DMF', 'OMF', 'LMF', 'RMF', 'ST'];

/** 相手のラインの既定の高さ（戦術提案と同じ） */
export const DEFAULT_AWAY_LINE = 8;

/** 自分 4-3-3（ポゼッション） 対 相手 4-2-3-1（ショートカウンター） */
export const initialState = (): BoardState => {
  const homeFormation = idOf(HOME_433);
  const awayFormation = idOf(AWAY_4231);
  return {
    players: [
      ...buildLineup('home', homeFormation, 0),
      ...buildLineup('away', awayFormation, DEFAULT_AWAY_LINE),
    ],
    ball: { x: 17, y: 42 },
    params: {
      ...DEFAULT_PARAMS,
      possessionTeam: 'home',
      scene: 'possession',
      homeStyle: 'possession',
      awayStyle: 'shortCounter',
    },
    homeFormation,
    awayFormation,
    homeLine: 0,
    awayLine: DEFAULT_AWAY_LINE,
  };
};
