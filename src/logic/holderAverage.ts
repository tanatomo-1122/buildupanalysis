import type { Params, Player, PositionId, TeamId, Vec2 } from '../types';
import { evaluateBoard } from './evaluate';

/**
 * 起点平均
 *
 *   期待前進値(平均) = (1/N) Σ_h [ Σ_i w_i × PC_i × ΔX_i ]   ボールを選手 h の足元に置いたとき
 *
 * h は保持側の **GK 以外**の選手（通常10人）。
 *
 * ボールを1点に置いた評価は「その位置に置いたから」の影響が強く出る。
 * GK 以外の全員を順に起点にして平均を取ると、ボールをどこに置いたかに左右されない
 * 「その配置そのものの前進しやすさ」になる。フォーメーション比較の公平性もこれで上がる。
 *
 * 各サブ評価では h をホルダーとして総和から除外するので、
 * 「自分を除く10人への前進の期待値」を10通り平均していることになる。
 */

export interface HolderEntry {
  playerId: string;
  number: number;
  position: PositionId;
  /** この評価でボールを置いた位置（＝その選手の現在地） */
  ball: Vec2;
  /** その起点での期待前進値 */
  total: number;
}

export interface HolderAverage {
  /** 起点平均。候補がいなければ現在のボール位置での値にフォールバックする */
  mean: number;
  /** 平均に使った起点の数 N */
  count: number;
  entries: HolderEntry[];
  best: HolderEntry | null;
  worst: HolderEntry | null;
}

/** 起点の候補＝保持側の GK 以外 */
export const outfieldHolders = (players: Player[], team: TeamId): Player[] =>
  players.filter((p) => p.team === team && p.position !== 'GK');

export const averageOverHolders = (
  players: Player[],
  fallbackBall: Vec2,
  params: Params,
  team: TeamId = params.possessionTeam,
  /** 起点を間引いて速く見積もりたいときの上限（探索用）。省略すると全員 */
  maxHolders?: number,
): HolderAverage => {
  const all = outfieldHolders(players, team);
  const candidates =
    maxHolders && maxHolders > 0 && all.length > maxHolders
      ? Array.from({ length: maxHolders }, (_, i) => all[Math.round((i * (all.length - 1)) / (maxHolders - 1))])
      : all;

  if (candidates.length === 0) {
    return {
      mean: evaluateBoard(players, fallbackBall, params).total,
      count: 0,
      entries: [],
      best: null,
      worst: null,
    };
  }

  const entries: HolderEntry[] = candidates.map((h) => {
    const ball = { ...h.pos };
    return {
      playerId: h.id,
      number: h.number,
      position: h.position,
      ball,
      total: evaluateBoard(players, ball, params, h.id).total,
    };
  });

  const mean = entries.reduce((sum, e) => sum + e.total, 0) / entries.length;
  const sorted = [...entries].sort((a, b) => b.total - a.total);

  return {
    mean,
    count: entries.length,
    entries,
    best: sorted[0] ?? null,
    worst: sorted[sorted.length - 1] ?? null,
  };
};

/** 現在のモードに応じたスコアを返す（比較表など、数値だけ欲しい場所用） */
export const scoreFor = (
  players: Player[],
  ball: Vec2,
  params: Params,
  team: TeamId = params.possessionTeam,
): number =>
  params.holderMode === 'averageOutfield'
    ? averageOverHolders(players, ball, params, team).mean
    : evaluateBoard(players, ball, params).total;
