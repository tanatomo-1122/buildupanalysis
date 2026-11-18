/**
 * 戦術ボードの「自分の11人」を扱う補助。
 *
 *   - 登録選手を枠に当てはめる（自動・入れ替え）
 *   - 盤面の配置に名前を付ける（4-2-3-1 など）
 *   - 盤面の内容を、保存できる戦術の形（TacticPayload）にまとめる
 *
 * 盤面は攻撃時と守備時で別の配置を持てる（eFootball の仕様と同じ）。
 * 同じ人が局面ごとに違う枠にいるので、人の照合は squadId（無ければ名前）で行う。
 */
import type { SavedFormation, TacticPayload } from '../api/tactics';
import { formationByPositions } from '../data/formations';
import { formationName } from '../data/generate';
import { aptitudeOf } from '../data/positions';
import { correctPosition } from '../data/zones';
import { PITCH_LENGTH } from '../constants';
import type { BoardState, Player, PositionId, SquadPlayer, TeamId } from '../types';
import { assignByScore } from './assign';
import { averageOverHolders } from './holderAverage';
import { fitScore } from './recommend';

export const teamOf = (players: Player[], team: TeamId) => players.filter((p) => p.team === team);

/** 同じ人かどうかを見るためのキー。登録選手が入っていない枠は枠の ID */
export const personKey = (p: Player): string => p.squadId ?? (p.name ? `name:${p.name}` : `slot:${p.id}`);

const outfield = (players: Player[]) => players.filter((p) => p.position !== 'GK');

export interface ShapeInfo {
  /** 4-2-3-1 のような名前（人数から自動で決まる） */
  name: string;
  /** カタログにある形ならその ID と構成名。無ければ eFootball のエディットでは組めない配分 */
  formationId?: string;
  typeLabel?: string;
}

/** いまの11人の配置に名前を付ける */
export const shapeOf = (eleven: Player[]): ShapeInfo => {
  const positions = outfield(eleven).map((p) => p.position);
  const found = formationByPositions(eleven.map((p) => p.position));
  return {
    name: positions.length ? formationName(positions) : '—',
    formationId: found?.id,
    typeLabel: found?.typeLabel,
  };
};

type Occupant = Pick<Player, 'name' | 'squadId' | 'attackSkill' | 'defenseSkill'>;

const occupantOf = (sp: SquadPlayer): Occupant => ({
  name: sp.name,
  squadId: sp.id,
  attackSkill: sp.attackSkill,
  defenseSkill: sp.defenseSkill,
});

const occupantIn = (p: Player): Occupant => ({
  name: p.name,
  squadId: p.squadId,
  attackSkill: p.attackSkill,
  defenseSkill: p.defenseSkill,
});

/**
 * 11枠に登録選手を当てはめる（適性とプレースタイルの噛み合いが最大になる組み合わせ）。
 * pool が11人ちょうどなら「同じ11人の並べ直し」になる。
 */
export const assignSquad = (eleven: Player[], pool: SquadPlayer[]): Player[] => {
  if (pool.length < eleven.length) return eleven;
  const picks = assignByScore(eleven.map((slot) => pool.map((sp) => fitScore(slot.position, sp))));
  return eleven.map((slot, i) => ({ ...slot, ...occupantOf(pool[picks[i]]) }));
};

/** その11人に入っている登録選手（全員そろっていなければ null） */
export const squadIn = (eleven: Player[], squad: SquadPlayer[]): SquadPlayer[] | null => {
  const byId = new Map(squad.map((sp) => [sp.id, sp]));
  const out: SquadPlayer[] = [];
  for (const p of eleven) {
    const sp = p.squadId ? byId.get(p.squadId) : undefined;
    if (!sp) return null;
    out.push(sp);
  }
  return out;
};

/**
 * 1つの枠の選手を入れ替える。
 *   - 相手がスタメンにいる → その2人の枠を交換（もう一方の局面はそのまま）
 *   - 相手が控え → 交代。もう一方の局面でも同じ人を入れ替える
 */
export const putSquadPlayer = (
  eleven: Player[],
  other: Player[] | undefined,
  slotId: string,
  sp: SquadPlayer,
): { eleven: Player[]; other: Player[] | undefined } => {
  const target = eleven.find((p) => p.id === slotId);
  if (!target) return { eleven, other };
  const incoming = occupantOf(sp);
  const holder = eleven.find((p) => p.squadId === sp.id);

  if (holder) {
    if (holder.id === slotId) return { eleven, other };
    const outgoing = occupantIn(target);
    return {
      eleven: eleven.map((p) =>
        p.id === slotId ? { ...p, ...incoming } : p.id === holder.id ? { ...p, ...outgoing } : p,
      ),
      other,
    };
  }

  const leaving = personKey(target);
  return {
    eleven: eleven.map((p) => (p.id === slotId ? { ...p, ...incoming } : p)),
    other: other?.map((p) => (personKey(p) === leaving ? { ...p, ...incoming } : p)),
  };
};

/** GK 以外を前後に動かす（ラインの上げ下げ）。動かした先でポジションが変わる場合は合わせる */
export const shiftLine = (eleven: Player[], dx: number): Player[] =>
  eleven.map((p) => {
    if (p.position === 'GK') return p;
    const dir = p.team === 'home' ? 1 : -1;
    const x = Math.min(PITCH_LENGTH - 1, Math.max(1, p.pos.x + dx * dir));
    const pos = { x, y: p.pos.y };
    return { ...p, pos, position: correctPosition(pos, p.team, p.position) };
  });

/* ------------------------------------------------------------------ *
 * 保存
 * ------------------------------------------------------------------ */

const savedFormation = (
  eleven: Player[],
  away: Player[],
  board: BoardState,
  squad: SquadPlayer[],
): SavedFormation => {
  const shape = shapeOf(eleven);
  const byId = new Map(squad.map((sp) => [sp.id, sp]));
  const players = [...eleven, ...away];
  return {
    formationId: shape.formationId ?? '',
    familyLabel: shape.name,
    typeLabel: shape.typeLabel ?? 'オリジナルの配置',
    lineShift: 0,
    lineup: eleven,
    assignments: [...eleven]
      .sort((a, b) => a.number - b.number)
      .map((p) => {
        const sp = p.squadId ? byId.get(p.squadId) : undefined;
        return {
          number: p.number,
          slot: p.position,
          name: p.name ?? `${p.number}番`,
          main: (sp?.position ?? p.position) as PositionId,
          aptitude: sp ? aptitudeOf(sp, p.position) : ('main' as const),
        };
      }),
    attack: averageOverHolders(players, board.ball, { ...board.params, possessionTeam: 'home' }, 'home').mean,
    defense: averageOverHolders(players, board.ball, { ...board.params, possessionTeam: 'away' }, 'away').mean,
  };
};

/** 表示中の局面と、もう一方の局面の11人 */
export const phaseLineups = (board: BoardState): { attack: Player[]; defense: Player[] } => {
  const shown = teamOf(board.players, 'home');
  const other = board.homeOther ?? shown;
  return board.params.possessionTeam === 'home'
    ? { attack: shown, defense: other }
    : { attack: other, defense: shown };
};

export const opponentLabelOf = (away: Player[]): string => {
  const s = shapeOf(away);
  return s.typeLabel ? `${s.name}（${s.typeLabel}）` : s.name;
};

/** 盤面の内容を、マイ戦術に保存できる形へ */
export const boardPayload = (board: BoardState, squad: SquadPlayer[]): TacticPayload => {
  const away = teamOf(board.players, 'away');
  const { attack, defense } = phaseLineups(board);
  const defBy = new Map(defense.map((p) => [personKey(p), p]));
  return {
    version: 1,
    homeStyle: board.params.homeStyle,
    opponentStyle: board.params.awayStyle,
    scene: board.params.scene,
    valueModel: board.params.valueModel,
    opponent: {
      formationId: shapeOf(away).formationId ?? board.awayFormation,
      label: opponentLabelOf(away),
      players: away,
    },
    attack: savedFormation(attack, away, board, squad),
    defense: savedFormation(defense, away, board, squad),
    moves: attack
      .map((a) => ({ a, d: defBy.get(personKey(a)) }))
      .filter(({ a, d }) => d && d.position !== a.position)
      .map(({ a, d }) => ({ name: a.name ?? `${a.number}番`, attack: a.position, defense: d!.position })),
  };
};
