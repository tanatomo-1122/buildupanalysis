import { PITCH_CENTER_Y, PITCH_LENGTH, PITCH_WIDTH, attackDir, targetGoal } from '../constants';
import { skillById } from '../data/skills';
import { styleById, stylePhaseKey } from '../data/styles';
import type { Params, Player, SkillDef, Vec2, VectorCoeff } from '../types';

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export const clampToPitch = (p: Vec2): Vec2 => ({
  x: Math.min(PITCH_LENGTH, Math.max(0, p.x)),
  y: Math.min(PITCH_WIDTH, Math.max(0, p.y)),
});

/** a から b への単位ベクトル（同一点なら 0 ベクトル） */
export const unitToward = (from: Vec2, to: Vec2): Vec2 => {
  const d = sub(to, from);
  const len = Math.hypot(d.x, d.y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: d.x / len, y: d.y / len };
};

/**
 * 係数セットを実ベクトルに変換する。
 *
 *   forward   : 攻撃方向（home:+X / away:-X）
 *   width     : ピッチ中央線から外side（タッチライン）方向
 *   ballward  : ボールへ向かう単位ベクトル
 *   goalward  : 自陣ゴール方向（攻撃方向の逆）
 *   goalmouth : 相手ゴール中央へ向かう単位ベクトル
 */
export const coeffToVector = (
  coeff: VectorCoeff,
  player: Player,
  ball: Vec2,
  gain: number,
): Vec2 => {
  const dir = attackDir(player.team);
  // 中央線より上(y>34)なら +Y が外側、下なら -Y が外側。ちょうど中央なら外側なし。
  const side = player.pos.y === PITCH_CENTER_Y ? 0 : Math.sign(player.pos.y - PITCH_CENTER_Y);
  const toBall = unitToward(player.pos, ball);
  const toGoal = unitToward(player.pos, targetGoal(player.team));

  return {
    x:
      (coeff.forward * dir -
        coeff.goalward * dir +
        coeff.ballward * toBall.x +
        coeff.goalmouth * toGoal.x) *
      gain,
    y: (coeff.width * side + coeff.ballward * toBall.y + coeff.goalmouth * toGoal.y) * gain,
  };
};

/**
 * その局面でこの選手に発動している特性を返す。
 * ボールを保持している側は攻撃時特性、非保持側は守備時特性。
 */
export const activeSkill = (player: Player, params: Params): SkillDef => {
  const attacking = player.team === params.possessionTeam;
  return skillById(attacking ? player.attackSkill : player.defenseSkill);
};

/** その局面でこのチームに適用されるスタイル列 */
export const activeStylePhase = (player: Player, params: Params) => {
  const style = styleById(player.team === 'home' ? params.homeStyle : params.awayStyle);
  return { style, key: stylePhaseKey(params.scene, player.team, params.possessionTeam) };
};

/**
 * 暫定到達領域の自動算出。
 *   (選手の基本座標) + (チームスタイルのベクトル係数) + (選手特性のベクトル係数)
 */
export const arrivalOf = (player: Player, ball: Vec2, params: Params): Vec2 => {
  const { style, key } = activeStylePhase(player, params);
  const styleGain = player.team === 'home' ? params.homeStyleIntensity : params.awayStyleIntensity;

  const styleVec = coeffToVector(style.phases[key].coeff, player, ball, styleGain);
  const skillVec = coeffToVector(activeSkill(player, params).coeff, player, ball, params.skillIntensity);

  return clampToPitch(add(add(player.pos, styleVec), skillVec));
};

/** ボールに最も近い保持側の選手をボールホルダーとみなす */
export const findHolder = (players: Player[], ball: Vec2, team: string): string | null => {
  let best: string | null = null;
  let bestD = Infinity;
  for (const p of players) {
    if (p.team !== team) continue;
    const d = dist(p.pos, ball);
    if (d < bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
};
