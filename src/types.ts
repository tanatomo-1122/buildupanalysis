/**
 * ドメイン型定義
 *
 * 座標系：ピッチ左下を原点とする実寸メートル系。
 *   x: 0 (自陣ゴールライン) 〜 105 (相手ゴールライン)  ※ home の攻撃方向は +X
 *   y: 0 (下タッチライン)   〜 68 (上タッチライン)
 */

export type TeamId = 'home' | 'away';

export interface Vec2 {
  x: number;
  y: number;
}

/** eFootball のポジション表記 */
export type PositionId =
  | 'GK'
  | 'CB'
  | 'LSB'
  | 'RSB'
  | 'DMF'
  | 'CMF'
  | 'LMF'
  | 'RMF'
  | 'OMF'
  | 'LWG'
  | 'RWG'
  | 'ST'
  | 'CF';

/** 選手特性の発動フェーズ */
export type SkillPhase = 'attack' | 'defense';

/**
 * 局面（シーン）。チームスタイルの4列のどれを両チームに適用するかを決める。
 * 「保持側」はボールを持っているチーム（Params.possessionTeam）。
 *   possession : 保持側=「攻撃時」   / 非保持側=「守備時」
 *   transition : 保持側=「奪った時」 / 非保持側=「奪われた時」
 */
export type SceneId = 'possession' | 'transition';

/** チームスタイルの4局面キー */
export type StylePhaseKey = 'attack' | 'defense' | 'transitionWin' | 'transitionLose';

/**
 * ベクトル係数。5つの基底方向の合成としてベクトルを自動算出する。
 * 単位はすべてメートル。
 */
export interface VectorCoeff {
  /** 攻撃方向（自チームが攻める向き）への距離 */
  forward: number;
  /** ピッチ中央線(y=34)から外側＝タッチライン方向への距離。負値で内側に絞る */
  width: number;
  /** ボールへ向かう方向への距離。負値でボールから離れる */
  ballward: number;
  /** 自陣ゴール方向（撤退）への距離 */
  goalward: number;
  /** 相手ゴール中央 (105, 34) へ向かう方向への距離 */
  goalmouth: number;
}

export const ZERO_COEFF: VectorCoeff = {
  forward: 0,
  width: 0,
  ballward: 0,
  goalward: 0,
  goalmouth: 0,
};

/** 選手特性の定義 */
export interface SkillDef {
  id: string;
  label: string;
  phase: SkillPhase;
  /** この特性を設定できるポジション */
  positions: PositionId[];
  /** ゲーム内の説明文 */
  desc: string;
  coeff: VectorCoeff;
}

/** チームスタイルの定義（4局面ぶんの係数と説明を持つ） */
export interface StyleDef {
  id: string;
  label: string;
  phases: Record<StylePhaseKey, { desc: string; coeff: VectorCoeff }>;
}

export interface Player {
  id: string;
  team: TeamId;
  /** 背番号（表示用） */
  number: number;
  position: PositionId;
  /** 攻撃時に発動する特性 ID（'none' で特性なし） */
  attackSkill: string;
  /** 守備時に発動する特性 ID（'none' で特性なし） */
  defenseSkill: string;
  pos: Vec2;
}

/** Pitch Control の算出方式 */
export type PcMode = 'team' | 'individual';

/**
 * 評価の起点の取り方。
 *   current         : いま盤面に置いてあるボールの位置だけで評価する
 *   averageOutfield : 保持側の GK 以外の各選手がボールを持った場合をすべて計算し、その平均を取る
 */
export type HolderMode = 'current' | 'averageOutfield';

export interface Params {
  /**
   * ボールを保持しているチーム。攻撃時／守備時の切り替えはこれで行う。
   * 保持側は攻撃時特性、非保持側は守備時特性が発動し、
   * 期待前進値も保持側の攻撃方向で算出される。
   */
  possessionTeam: TeamId;
  /**
   * 評価の起点。'averageOutfield' なら GK 以外の各選手を順にボールホルダーに置いて
   * 期待前進値を計算し、その平均をスコアとする。
   */
  holderMode: HolderMode;
  /** 局面。チームスタイルのどの列を適用するかを決める */
  scene: SceneId;
  /** 自チームのチームスタイル ID */
  homeStyle: string;
  /** 相手チームのチームスタイル ID */
  awayStyle: string;
  /** スタイル係数の強度倍率（0〜2） */
  homeStyleIntensity: number;
  awayStyleIntensity: number;
  /** 選手特性係数の強度倍率（0〜2） */
  skillIntensity: number;
  /** Pitch Control の距離減衰率 λ [m]。大きいほど遠くまで影響が及ぶ */
  lambda: number;
  /** PC の算出方式 */
  pcMode: PcMode;
  /**
   * パスコース評価。ON にすると、到達地点だけでなく
   * ボール → 到達地点 の線分上で PC をサンプリングし、最小値（ボトルネック）を採る。
   */
  passLaneEnabled: boolean;
  /** この距離までは完全なグラウンダー扱い（コース上の敵を全員数える）[m] */
  laneShortMax: number;
  /** この距離以上で完全なフライ扱い（中間地点の敵を無視する）[m] */
  laneLongMin: number;
  /** U 字の底の広さ p。1 で素の 4(t-0.5)²、大きいほど中間の無視域が広がる */
  laneSharpness: number;
  /**
   * パス距離のガウス重み w = exp(-(d-μ)²/2σ²) を目的関数に掛けるか。
   * OFF にすると w = 1 となり、距離を問わない従来の式に戻る。
   */
  passWeightEnabled: boolean;
  /** 最も価値を置くパス距離 μ [m] */
  passMu: number;
  /** パス距離の許容幅 σ [m]。大きいほど距離にこだわらない */
  passSigma: number;
  /** 相手選手も到達領域（ベクトル適用後）で評価するか。false なら現在地で評価 */
  opponentUsesVector: boolean;
  /** ΔX がマイナスの寄与を 0 で切り捨てるか */
  clipNegativeProgress: boolean;
}

export interface ViewOptions {
  heatmap: boolean;
  arrows: boolean;
  targets: boolean;
  /** パスコースとボトルネック地点を描く */
  lanes: boolean;
  positions: boolean;
  pcLabels: boolean;
  contribution: boolean;
}

/** 1 人分の評価結果 */
export interface PlayerEvaluation {
  playerId: string;
  number: number;
  position: PositionId;
  /** この局面で実際に適用された特性のラベル */
  skillLabel: string;
  from: Vec2;
  /** 暫定到達領域（計算用座標） */
  to: Vec2;
  /**
   * そのパスの成功確率 0.0〜1.0。
   * パスコース評価が ON ならコース上のボトルネック、OFF なら到達地点の値。
   */
  pc: number;
  /** 到達地点だけで見た PC（コース評価との比較用） */
  pcEndpoint: number;
  /** ボトルネックになった地点。コース評価が OFF なら到達地点そのもの */
  bottleneck: Vec2;
  /** ボトルネックがコース上のどこか（0=ボール, 1=到達地点） */
  bottleneckT: number;
  /** そのパス距離での浮き具合 0〜1（1 に近いほど完全なフライ扱い） */
  loft: number;
  /** ボール現在地から到達地点への X 方向進度 [m] */
  dx: number;
  /** ボール現在地から到達地点までの直線距離＝パスの飛距離 [m] */
  passDistance: number;
  /** パス距離のガウス重み w（重みOFFのときは 1） */
  distanceWeight: number;
  /** w × PC × ΔX */
  value: number;
  /** ボールホルダーとして総和から除外されたか */
  excluded: boolean;
}

export interface Arrival {
  playerId: string;
  team: TeamId;
  from: Vec2;
  to: Vec2;
}

export interface Evaluation {
  /** 期待前進値 = Σ(PC_i × ΔX_i) */
  total: number;
  /** 評価対象となったチーム（＝ボール保持側） */
  attackingTeam: TeamId;
  holderId: string | null;
  /** 保持側11人の評価 */
  players: PlayerEvaluation[];
  /** 全22人の到達領域（描画用） */
  arrivals: Arrival[];
}

export interface BoardState {
  players: Player[];
  ball: Vec2;
  params: Params;
  /** 現在適用中のフォーメーション（表示・再適用用） */
  homeFormation: string;
  awayFormation: string;
  /** フォーメーション適用時の全体押し上げ量 [m] */
  homeLine: number;
  awayLine: number;
}

/** ポジションの並び順（UI・整列用） */
export const POSITION_ORDER: PositionId[] = [
  'GK',
  'CB',
  'RSB',
  'LSB',
  'DMF',
  'CMF',
  'RMF',
  'LMF',
  'OMF',
  'RWG',
  'LWG',
  'ST',
  'CF',
];
