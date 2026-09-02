import { FORMATIONS, withFormation } from '../data/formations';
import type { BoardState, TeamId, Vec2 } from '../types';
import { scoreFor } from './holderAverage';
import { dist, findHolder } from './vectors';

export interface FormationScore {
  formationId: string;
  label: string;
  desc: string;
  /** 自チームが保持しているときの期待前進値（大きいほど前進できる） */
  attack: number;
  /** 相手が保持しているときの相手の期待前進値（小さいほど前進を許さない＝守備が固い） */
  defense: number;
  attackRank: number;
  defenseRank: number;
}

export interface CompareResult {
  rows: FormationScore[];
  /** 起点平均モードかどうか（true なら下の2つのボール位置は使われていない） */
  averaged: boolean;
  /** 攻撃の比較に使ったボール位置（単一起点モードのときのみ意味を持つ） */
  attackBall: Vec2;
  /** 守備の比較に使ったボール位置（同上） */
  defenseBall: Vec2;
  /** 固定した相手チームの情報 */
  opponentFormation: string;
}

/**
 * チームスタイル・選手特性・相手チームを固定したまま、
 * 自チームのフォーメーションだけを総当たりで差し替えて期待値を比較する。
 *
 * **起点平均モード**（既定）では、どちらのカラムも保持側の GK 以外の全員を順に
 * 起点にした平均で評価するため、ボールをどこに置いてあるかに一切依存しない。
 *
 * 単一起点モードのときだけ、
 * - 攻撃時：現在のボール位置
 * - 守備時：相手の最寄り選手の足元（相手は固定なので全フォーメーション共通）
 * を使う。
 *
 * 選手特性は `withFormation()` が背番号で引き継ぐため、比較のあいだ一切変化しない。
 */
export const compareFormations = (board: BoardState): CompareResult => {
  const self: TeamId = 'home';
  const opponent: TeamId = 'away';
  const averaged = board.params.holderMode === 'averageOutfield';

  // 単一起点モード用：相手チームは固定なので全フォーメーション共通の起点になる
  const oppHolderId = findHolder(board.players, board.ball, opponent);
  const oppHolder = board.players.find((p) => p.id === oppHolderId);
  const defenseBall: Vec2 = oppHolder ? { ...oppHolder.pos } : { ...board.ball };

  const raw = FORMATIONS.map((f) => {
    const players = withFormation(board.players, self, f.id, board.homeLine);
    const attack = scoreFor(
      players,
      board.ball,
      { ...board.params, possessionTeam: self },
      self,
    );
    const defense = scoreFor(
      players,
      defenseBall,
      { ...board.params, possessionTeam: opponent },
      opponent,
    );
    return { formationId: f.id, label: f.label, desc: f.desc, attack, defense };
  });

  // 攻撃：大きいほど良い / 守備：小さいほど良い（許す前進が少ない）
  const byAttack = [...raw].sort((a, b) => b.attack - a.attack).map((r) => r.formationId);
  const byDefense = [...raw].sort((a, b) => a.defense - b.defense).map((r) => r.formationId);

  const rows: FormationScore[] = raw.map((r) => ({
    ...r,
    attackRank: byAttack.indexOf(r.formationId) + 1,
    defenseRank: byDefense.indexOf(r.formationId) + 1,
  }));

  return {
    rows,
    averaged,
    attackBall: { ...board.ball },
    defenseBall,
    opponentFormation: board.awayFormation,
  };
};

/** 比較のあいだ、ボールが自チームの選手から離れすぎていないか（単一起点モードのみ意味を持つ） */
export const attackBallIsPlausible = (board: BoardState): boolean => {
  if (board.params.holderMode === 'averageOutfield') return true;
  let mine = Infinity;
  let theirs = Infinity;
  for (const p of board.players) {
    const d = dist(p.pos, board.ball);
    if (p.team === 'home') mine = Math.min(mine, d);
    else theirs = Math.min(theirs, d);
  }
  return mine <= theirs + 0.5;
};
