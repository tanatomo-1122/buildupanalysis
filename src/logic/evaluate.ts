import { attackDir } from '../constants';
import type { Arrival, Evaluation, Params, Player, PlayerEvaluation, TeamId, Vec2 } from '../types';
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
 *   PC_i : 到達地点の空間支配率
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

  const dir = attackDir(attackingTeam);
  const holderId =
    forcedHolderId && attackers.some((p) => p.id === forcedHolderId)
      ? forcedHolderId
      : findHolder(players, ball, attackingTeam);

  const evaluations: PlayerEvaluation[] = attackers.map((p) => {
    const to = positions.get(p.id)!;
    const pc = pcForArrival(to, to, attackerPoints, defenderPoints, params.lambda, params.pcMode);
    const rawDx = (to.x - ball.x) * dir;
    const dx = params.clipNegativeProgress ? Math.max(0, rawDx) : rawDx;
    // パスの飛距離＝ボール現在地から到達地点までの直線距離
    const passDistance = dist(ball, to);
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
      dx,
      passDistance,
      distanceWeight,
      value: distanceWeight * pc * dx,
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
