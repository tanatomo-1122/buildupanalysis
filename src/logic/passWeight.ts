/**
 * パス距離の重み（ガウス関数）
 *
 *   w_i = exp( -(d_i - μ)² / (2σ²) )
 *
 * d_i はボール現在地から選手 i の暫定到達地点までの直線距離 [m]。
 * つまり「そのパスの飛距離」であって、前進量 ΔX とは別の量。
 *
 *   μ : 最も価値を置くパス距離 [m]（ピークの位置）
 *   σ : 許容幅 [m]。大きいほど距離にこだわらず、小さいほど μ 付近だけを評価する
 *
 * 目的は、足元3mのパスと60mのロングボールを ΔX の大きさだけで評価してしまう問題を
 * 補正すること。w は常に (0, 1] なので、重みを掛けてもスコアの符号は変わらない。
 */
export const passDistanceWeight = (d: number, mu: number, sigma: number): number => {
  const s = Math.max(0.5, sigma);
  const z = (d - mu) / s;
  return Math.exp(-(z * z) / 2);
};

/** σ の下限（0 割り・発散を防ぐ） */
export const MIN_SIGMA = 1;
