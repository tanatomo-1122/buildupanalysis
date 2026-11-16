/**
 * 保存した戦術（tactics テーブル）。
 *
 * 1件 = 「この相手に対して、攻撃時はこの形・守備時はこの形、11人はこう置く」。
 * 見返す・共有するのに必要なものを payload にまとめて保存する。
 * 盤面の再計算に使う登録選手（squad）は持たない。起用した11人の名前と配置だけを残す。
 */
import type { FormationRecommendation, PhasePlan } from '../logic/recommend';
import type { Player, PositionId, SceneId, ValueModel } from '../types';
import { currentSession } from './auth';
import { sbDelete, sbInsert, sbSelect, sbUpdate } from './supabase';

export interface SavedFormation {
  formationId: string;
  familyLabel: string;
  typeLabel: string;
  lineShift: number;
  /** 盤面にそのまま置ける11人 */
  lineup: Player[];
  assignments: { number: number; slot: PositionId; name: string; main: PositionId; aptitude: 'main' | 'sub' | 'off' }[];
  attack: number;
  defense: number;
}

export interface TacticPayload {
  version: 1;
  homeStyle: string;
  opponentStyle: string;
  scene: SceneId;
  valueModel: ValueModel;
  opponent: { formationId: string; label: string; players: Player[] };
  attack: SavedFormation;
  defense: SavedFormation;
  /** 攻守で位置が変わる選手 */
  moves: { name: string; attack: PositionId; defense: PositionId }[];
  /** メモ（任意） */
  note?: string;
}

export interface Tactic {
  id: string;
  title: string;
  opponentLabel: string;
  attackLabel: string;
  defenseLabel: string;
  payload: TacticPayload;
  authorName: string;
  teamColor: string;
  shareId: string;
  isPublic: boolean;
  createdAt: string;
}

interface TacticRow {
  id: string;
  title: string;
  opponent_label: string;
  attack_label: string;
  defense_label: string;
  payload: TacticPayload;
  author_name: string | null;
  team_color: string | null;
  share_id: string;
  is_public: boolean;
  created_at: string;
}

/** 未ログインでも読める列だけ（owner は anon に見せない設定になっている） */
const PUBLIC_COLUMNS =
  'id,title,opponent_label,attack_label,defense_label,payload,author_name,team_color,share_id,is_public,created_at';

const toTactic = (r: TacticRow): Tactic => ({
  id: r.id,
  title: r.title,
  opponentLabel: r.opponent_label,
  attackLabel: r.attack_label,
  defenseLabel: r.defense_label,
  payload: r.payload,
  authorName: r.author_name ?? '',
  teamColor: r.team_color ?? 'blaze',
  shareId: r.share_id,
  isPublic: r.is_public,
  createdAt: r.created_at,
});

const saveFormation = (rec: FormationRecommendation): SavedFormation => ({
  formationId: rec.formationId,
  familyLabel: rec.familyLabel,
  typeLabel: rec.typeLabel,
  lineShift: rec.lineShift,
  lineup: rec.lineup,
  assignments: rec.assignments.map((a) => ({
    number: a.slot.number,
    slot: a.slot.position,
    name: a.player.name,
    main: a.player.position,
    aptitude: a.aptitude,
  })),
  attack: rec.attack,
  defense: rec.defense,
});

export const buildPayload = (
  plan: PhasePlan,
  ctx: {
    homeStyle: string;
    opponentStyle: string;
    scene: SceneId;
    opponentFormation: string;
    opponentLabel: string;
    opponentPlayers: Player[];
  },
): TacticPayload => ({
  version: 1,
  homeStyle: ctx.homeStyle,
  opponentStyle: ctx.opponentStyle,
  scene: ctx.scene,
  valueModel: plan.valueModel,
  opponent: { formationId: ctx.opponentFormation, label: ctx.opponentLabel, players: ctx.opponentPlayers },
  attack: saveFormation(plan.attack),
  defense: saveFormation(plan.defense),
  moves: plan.moves
    .filter((m) => m.attack.position !== m.defense.position)
    .map((m) => ({ name: m.player.name, attack: m.attack.position, defense: m.defense.position })),
});

export const listMyTactics = async (): Promise<Tactic[]> => {
  // 公開中の他人の戦術も select ポリシー上は見えるので、自分の ID で絞る
  const uid = currentSession()?.user.id;
  if (!uid) return [];
  const rows = await sbSelect<TacticRow>(
    'tactics',
    `select=${PUBLIC_COLUMNS}&owner=eq.${encodeURIComponent(uid)}&order=created_at.desc`,
  );
  return rows.map(toTactic);
};

export const createTactic = async (input: {
  title: string;
  payload: TacticPayload;
  authorName: string;
  teamColor: string;
}): Promise<Tactic> => {
  const p = input.payload;
  const rows = await sbInsert<TacticRow>('tactics', {
    title: input.title,
    opponent_label: p.opponent.label,
    attack_label: p.attack.familyLabel,
    defense_label: p.defense.familyLabel,
    payload: p,
    author_name: input.authorName,
    team_color: input.teamColor,
  });
  return toTactic(rows[0]);
};

export const updateTactic = async (
  id: string,
  patch: Partial<Pick<Tactic, 'title' | 'isPublic'>> & { note?: string; payload?: TacticPayload },
): Promise<Tactic> => {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.isPublic !== undefined) body.is_public = patch.isPublic;
  if (patch.payload !== undefined) body.payload = patch.payload;
  const rows = await sbUpdate<TacticRow>('tactics', `id=eq.${encodeURIComponent(id)}`, body);
  return toTactic(rows[0]);
};

export const deleteTactic = (id: string) => sbDelete('tactics', `id=eq.${encodeURIComponent(id)}`);

/** 共有リンクから開く。公開中のものだけ返る（ログイン不要） */
export const loadSharedTactic = async (shareId: string): Promise<Tactic | null> => {
  const rows = await sbSelect<TacticRow>(
    'tactics',
    `select=${PUBLIC_COLUMNS}&share_id=eq.${encodeURIComponent(shareId)}&is_public=is.true&limit=1`,
  );
  return rows[0] ? toTactic(rows[0]) : null;
};

/** 共有用の URL（?t=<share_id>） */
export const shareUrl = (shareId: string) =>
  `${location.origin}${location.pathname}?t=${encodeURIComponent(shareId)}`;
