import { attackDir } from '../constants';
import type { Arrival, Evaluation, Params, Player, PlayerEvaluation, TeamId, Vec2 } from '../types';
import { interceptFactor, loftAmount, segmentsFor } from './passLane';
import { passDistanceWeight } from './passWeight';
import { pcForArrival } from './pitchControl';
import { arrivalOf, dist, findHolder, heldSkill, isSkillActive } from './vectors';

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
 * パス1本の価値。params.valueModel で2つのモデルを切り替える。
 *
 * ■ progress（従来）
 *
 *     value = w × PC × ΔX
 *
 *   前進量に比例するので「どれだけ前に運べるか」を直接測る。
 *   反面、コースがどれだけ空いていても横パスは 0 点、バックパスはマイナスになるため、
 *   ポジショナルプレーでいう「保持を安定させる逃げ道」が一切評価されない。
 *
 * ■ passOptions（パスコース探索型）
 *
 *     value = 開通度(PC) × (1.0 + ΔX × 0.01 + w × 0.1)
 *     開通度 = PC >= 閾値 ? 1 : 0                     （passSoftness = 0：仕様どおりの硬い判定）
 *            = sigmoid((PC − 閾値) / passSoftness)    （passSoftness > 0：なめらかな判定）
 *
 *   ボトルネック PC が閾値を超えていれば「そのコースは通る」とみなして基本点 1.0 を与え、
 *   前進量と距離感はごく小さなボーナスに留める。合計は「いま通せるパスの本数」に近くなり、
 *   横パス・バックパスも1本として数えられる。
 *
 *   ボーナスの大きさの目安（基本点 1.0 に対して）:
 *     ΔX = +30m のロングフィード … +0.30
 *     ΔX = −10m のバックパス     … −0.10
 *     w = 1（μ=18m の理想距離）  … +0.10
 *   つまり「通る横パス1本」は「通らない決定的な縦パス」より常に上に来る。
 *   本数で並べたうえで、同数なら前向き・適切な距離感のものを採る、という優先順位になる。
 */
const passValue = (
  pc: number,
  dxProgress: number,
  distanceWeight: number,
  params: Params,
): number => {
  if (params.valueModel === 'progress') return distanceWeight * pc * dxProgress;
  const open = laneOpenness(pc, params);
  return open * (1.0 + dxProgress * 0.01 + distanceWeight * 0.1);
};

/**
 * コースの開通度 0〜1。
 * `passSoftness` が 0 なら仕様どおりの硬いステップ、正なら閾値まわりのシグモイド。
 */
export const laneOpenness = (pc: number, params: Params): number => {
  if (params.passSoftness <= 1e-9) return pc >= params.passThreshold ? 1 : 0;
  return 1 / (1 + Math.exp(-(pc - params.passThreshold) / params.passSoftness));
};

/**
 * 盤面のスコア = Σ value_i
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
      // 持っている特性を出しつつ、そのポジションで発動しないものには注記を付ける
      skillLabel: isSkillActive(p, params)
        ? heldSkill(p, params).label
        : `${heldSkill(p, params).label}（不適用）`,
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
      value: passValue(pc, dxProgress, distanceWeight, params),
      /** passOptions モデルでの「通る／通らない」。progress モデルでは常に false */
      laneOpen: params.valueModel === 'passOptions' && pc >= params.passThreshold,
      laneOpenness: params.valueModel === 'passOptions' ? laneOpenness(pc, params) : 0,
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
