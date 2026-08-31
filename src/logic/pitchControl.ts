import type { PcMode, Vec2 } from '../types';

/**
 * 距離ベースの簡略 Pitch Control。
 *
 * 各選手が地点 p に及ぼす影響力を  w = exp(-d / λ)  とし、
 *   PC(p) = Σ_home w / (Σ_home w + Σ_away w)
 * で 0.0〜1.0 の支配率を出す。λ（減衰率）が大きいほど遠くの選手も効いてくる。
 */
export const influence = (d: number, lambda: number): number => Math.exp(-d / Math.max(0.5, lambda));

const wsum = (points: Vec2[], p: Vec2, lambda: number): number => {
  let s = 0;
  for (const q of points) s += influence(Math.hypot(q.x - p.x, q.y - p.y), lambda);
  return s;
};

/** 集団としての支配率。ヒートマップ用でもある。 */
export const pitchControlAt = (
  p: Vec2,
  homePoints: Vec2[],
  awayPoints: Vec2[],
  lambda: number,
): number => {
  const h = wsum(homePoints, p, lambda);
  const a = wsum(awayPoints, p, lambda);
  const denom = h + a;
  if (denom < 1e-12) return 0.5;
  return h / denom;
};

/**
 * 保持側の選手 i の到達地点 p における PC。
 *  - 'team'      : 保持側全員の影響を合算（周囲のサポートが効く）
 *  - 'individual': 本人 vs 非保持側全員（1対1で受けられるか）
 */
export const pcForArrival = (
  p: Vec2,
  self: Vec2,
  attackerPoints: Vec2[],
  defenderPoints: Vec2[],
  lambda: number,
  mode: PcMode,
): number => {
  if (mode === 'individual') {
    const h = influence(Math.hypot(self.x - p.x, self.y - p.y), lambda);
    const a = wsum(defenderPoints, p, lambda);
    const denom = h + a;
    if (denom < 1e-12) return 0.5;
    return h / denom;
  }
  return pitchControlAt(p, attackerPoints, defenderPoints, lambda);
};
