import { DEFAULT_PARAMS } from './constants';
import { buildLineup } from './data/formations';
import type { BoardState, Params, Vec2 } from './types';

export interface ScenePreset {
  id: string;
  label: string;
  desc: string;
  build: () => BoardState;
}

interface SceneSpec {
  homeFormation: string;
  homeLine: number;
  awayFormation: string;
  awayLine: number;
  ball: Vec2;
  params: Partial<Params>;
}

const make = (spec: SceneSpec): BoardState => ({
  players: [
    ...buildLineup('home', spec.homeFormation, spec.homeLine),
    ...buildLineup('away', spec.awayFormation, spec.awayLine),
  ],
  ball: spec.ball,
  params: { ...DEFAULT_PARAMS, ...spec.params },
  homeFormation: spec.homeFormation,
  awayFormation: spec.awayFormation,
  homeLine: spec.homeLine,
  awayLine: spec.awayLine,
});

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: 'p1',
    label: 'ポゼッション × ショートカウンター',
    desc: '4-2-1-3 のCB起点。相手はラインを高く保って前から来る。プレスを外せているか。',
    build: () =>
      make({
        homeFormation: '4-2-1-3',
        homeLine: 0,
        awayFormation: '4-4-2',
        awayLine: 14,
        ball: { x: 17, y: 42 },
        params: { scene: 'possession', homeStyle: 'possession', awayStyle: 'shortCounter' },
      }),
  },
  {
    id: 'p2',
    label: 'オーバーロード × サイドアタック',
    desc: '3-2-4-1 で中央に人を集める。相手は中盤にブロックを構える。狭い局面の数的優位を見る。',
    build: () =>
      make({
        homeFormation: '3-2-4-1',
        homeLine: 2,
        awayFormation: '4-4-2',
        awayLine: 0,
        ball: { x: 18, y: 34 },
        params: { scene: 'possession', homeStyle: 'overload', awayStyle: 'sideAttack' },
      }),
  },
  {
    id: 'p3',
    label: 'サイドアタック × ロングボール（撤退）',
    desc: '押し込んだ局面。相手は5-3-2で自陣に低いブロック。ΔXが伸びない状況の比較用。',
    build: () =>
      make({
        homeFormation: '4-3-3',
        homeLine: 22,
        awayFormation: '5-3-2',
        awayLine: -6,
        ball: { x: 54, y: 34 },
        params: { scene: 'possession', homeStyle: 'sideAttack', awayStyle: 'longBall' },
      }),
  },
  {
    id: 'p4',
    label: 'ロングカウンター × ポゼッション（奪った直後）',
    desc: '局面「トランジション」。自陣で奪い、相手は前がかりのまま。背後のスペースの価値を見る。',
    build: () =>
      make({
        homeFormation: '4-2-3-1',
        homeLine: 0,
        awayFormation: '4-3-3',
        awayLine: 16,
        ball: { x: 33, y: 26 },
        params: { scene: 'transition', homeStyle: 'longCounter', awayStyle: 'possession' },
      }),
  },
];

export const initialState = (): BoardState => SCENE_PRESETS[0].build();
