import { attackDir } from '../constants';
import type { Arrival, Evaluation, Params, Player, PlayerEvaluation, TeamId, Vec2 } from '../types';
import { interceptFactor, loftAmount, segmentsFor } from './passLane';
import { passDistanceWeight } from './passWeight';
import { pcForArrival } from './pitchControl';
import { activeSkill, arrivalOf, dist, findHolder } from './vectors';

/**
 * 全選手の「評価に使う座標」を求める。
 * 非保持側は params.opponentUsesVector が false のとき現在地のまま評価する。
 */
const evalPositions = (players: Player[], ball: Vec2, params: Params): Map<string, Vec2> => {
  const map = new Map<string, Vec2>();
  for (const p of players) {
    const attacking = p.team === params.possessionTeam;
    const useVector = attacking || params.opponentUsesVector;
    map.set(p.id, useVector ? arrivalOf(p, ball, params) : { ...p.pos });
  }
  return map;
};

/**
 * 期待前進値 = Σ ( w_i × PC_i × ΔX_i )
 *   対象：ボール保持側のうち、ボールホルダーを除く10人
 *   w_i  : パス距離のガウス重み exp(-(d_i-μ)²/2σ²)（無効化時は 1）
 *   PC_i : パスの成功確率。パスコース評価が ON ならコース上のボトルネック
 *   ΔX_i : 保持側の攻撃方向を正とした前進量
 */
export const evaluateBoard = (
  players: Player[],
  ball: Vec2,
  params: Params,
  /** ホルダーを明示指定する（起点平均で「この選手が持っている」を確定させるため） */
  forcedHolderId?: string,
): Evaluation => {
  const attackingTeam: TeamId = params.possessionTeam;
  const positions = evalPositions(players, ball, params);

  const attackers = players.filter((p) => p.team === attackingTeam);
  const defenders = players.filter((p) => p.team !== attackingTeam);
  const attackerPoints = attackers.map((p) => positions.get(p.id)!);
  const defenderPoints = defenders.map((p) => positions.get(p.id)!);

  // サンプリングのホットループ用にフラット配列へ展開しておく
  const ax = Float64Array.from(attackerPoints, (p) => p.x);
  const ay = Float64Array.from(attackerPoints, (p) => p.y);
  const dx_ = Float64Array.from(defenderPoints, (p) => p.x);
  const dy_ = Float64Array.from(defenderPoints, (p) => p.y);
  const invLambda = 1 / Math.max(0.5, params.lambda);

  /** 地点 (px,py) における保持側の支配率。守備側の影響力に係数 I を掛ける */
  const laneControlAt = (px: number, py: number, I: number): number => {
    let h = 0;
    for (let i = 0; i < ax.length; i++) {
      const ex = ax[i] - px;
      const ey = ay[i] - py;
      h += Math.exp(-Math.sqrt(ex * ex + ey * ey) * invLambda);
    }
    let a = 0;
    for (let j = 0; j < dx_.length; j++) {
      const ex = dx_[j] - px;
      const ey = dy_[j] - py;
      a += Math.exp(-Math.sqrt(ex * ex + ey * ey) * invLambda);
    }
    const denom = h + a * I;
    return denom < 1e-12 ? 0.5 : h / denom;
  };

  const dir = attackDir(attackingTeam);
  const holderId =
    forcedHolderId && attackers.some((p) => p.id === forcedHolderId)
      ? forcedHolderId
      : findHolder(players, ball, attackingTeam);

  const evaluations: PlayerEvaluation[] = attackers.map((p) => {
    const to = positions.get(p.id)!;
    const passDistance = dist(ball, to);

    // 到達地点の PC は従来どおり pcMode の意味（チーム合算 / 個人 vs 守備側）を保つ
    const pcEndpoint = pcForArrival(
      to,
      to,
      attackerPoints,
      defenderPoints,
      params.lambda,
      params.pcMode,
    );

    let pc = pcEndpoint;
    let bottleneck = to;
    let bottleneckT = 1;
    const loft = params.passLaneEnabled
      ? loftAmount(passDistance, params.laneShortMax, params.laneLongMin)
      : 0;

    if (params.passLaneEnabled && passDistance > 1e-6) {
      const segments = segmentsFor(passDistance);
      const vx = to.x - ball.x;
      const vy = to.y - ball.y;
      // 終点は pcEndpoint で見ているので、ここでは t < 1 のサンプルだけを見る
      for (let k = 0; k < segments; k++) {
        const t = k / segments;
        const px = ball.x + vx * t;
        const py = ball.y + vy * t;
        const I = interceptFactor(
          t * passDistance,
          passDistance,
          params.laneShortMax,
          params.laneLongMin,
          params.laneSharpness,
        );
        const sample = laneControlAt(px, py, I);
        if (sample < pc) {
          pc = sample;
          bottleneck = { x: px, y: py };
          bottleneckT = t;
        }
      }
    }

    const rawDx = (to.x - ball.x) * dir;
    const dxProgress = params.clipNegativeProgress ? Math.max(0, rawDx) : rawDx;
    const distanceWeight = params.passWeightEnabled
      ? passDistanceWeight(passDistance, params.passMu, params.passSigma)
      : 1;
    const excluded = p.id === holderId;

    return {
      playerId: p.id,
      number: p.number,
      position: p.position,
      skillLabel: activeSkill(p, params).label,
      from: { ...p.pos },
      to,
      pc,
      pcEndpoint,
      bottleneck,
      bottleneckT,
      loft,
      dx: dxProgress,
      passDistance,
      distanceWeight,
      value: distanceWeight * pc * dxProgress,
      excluded,
    };
  });

  const total = evaluations.filter((e) => !e.excluded).reduce((sum, e) => sum + e.value, 0);

  const arrivals: Arrival[] = players.map((p) => ({
    playerId: p.id,
    team: p.team,
    from: { ...p.pos },
    to: positions.get(p.id)!,
  }));

  return { total, attackingTeam, holderId, players: evaluations, arrivals };
};

/**
 * ヒートマップ用の座標。色付けは常に home=シアン / away=ローズ なので、
 * 保持側がどちらであってもチーム単位で返す。
 */
export const controlPoints = (players: Player[], ball: Vec2, params: Params) => {
  const positions = evalPositions(players, ball, params);
  const homePoints: Vec2[] = [];
  const awayPoints: Vec2[] = [];
  for (const p of players) {
    (p.team === 'home' ? homePoints : awayPoints).push(positions.get(p.id)!);
  }
  return { homePoints, awayPoints };
};
