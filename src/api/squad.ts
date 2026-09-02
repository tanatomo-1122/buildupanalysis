import { DEFAULT_SKILLS } from '../data/skills';
import type { PositionId, SquadPlayer, UserProfile } from '../types';
import { sbDelete, sbInsert, sbSelect, sbUpsert } from './supabase';

/** 登録する選手の人数 */
export const SQUAD_SIZE = 23;

interface ProfileRow {
  id: string;
  user_name: string;
  efootball_id: string;
  created_at: string;
}

interface SquadRow {
  id: string;
  profile_id: string;
  slot_index: number;
  name: string;
  position: string;
  attack_skill: string;
  defense_skill: string;
}

const toProfile = (r: ProfileRow): UserProfile => ({
  id: r.id,
  userName: r.user_name,
  efootballId: r.efootball_id,
  createdAt: r.created_at,
});

const toSquadPlayer = (r: SquadRow): SquadPlayer => ({
  id: r.id,
  slotIndex: r.slot_index,
  name: r.name,
  position: r.position as PositionId,
  attackSkill: r.attack_skill,
  defenseSkill: r.defense_skill,
});

/* ------------------------------------------------------------------ *
 * プロフィール
 * ------------------------------------------------------------------ */

export const listProfiles = async (): Promise<UserProfile[]> => {
  const rows = await sbSelect<ProfileRow>('profiles', 'select=*&order=created_at.asc');
  return rows.map(toProfile);
};

export const findProfile = async (efootballId: string): Promise<UserProfile | null> => {
  const rows = await sbSelect<ProfileRow>(
    'profiles',
    `select=*&efootball_id=eq.${encodeURIComponent(efootballId)}&limit=1`,
  );
  return rows[0] ? toProfile(rows[0]) : null;
};

/** 同じ eFootball ID があればそれを返し、無ければ作る */
export const registerProfile = async (
  userName: string,
  efootballId: string,
): Promise<UserProfile> => {
  const existing = await findProfile(efootballId);
  if (existing) return existing;
  const rows = await sbInsert<ProfileRow>('profiles', {
    user_name: userName,
    efootball_id: efootballId,
  });
  return toProfile(rows[0]);
};

export const deleteProfile = (id: string): Promise<void> =>
  sbDelete('profiles', `id=eq.${encodeURIComponent(id)}`);

/* ------------------------------------------------------------------ *
 * 登録選手
 * ------------------------------------------------------------------ */

/** 未入力のスロットを埋めた 23 人ぶんの初期値 */
export const blankSquad = (): SquadPlayer[] => {
  const layout: PositionId[] = [
    'GK', 'GK', 'GK',
    'CB', 'CB', 'CB', 'CB',
    'RSB', 'RSB', 'LSB', 'LSB',
    'DMF', 'DMF', 'CMF', 'CMF',
    'RMF', 'LMF', 'OMF',
    'RWG', 'LWG',
    'ST', 'CF', 'CF',
  ];
  return layout.map((position, i) => ({
    id: `local-${i}`,
    slotIndex: i,
    name: '',
    position,
    attackSkill: DEFAULT_SKILLS[position].attack,
    defenseSkill: DEFAULT_SKILLS[position].defense,
  }));
};

export const loadSquad = async (profileId: string): Promise<SquadPlayer[]> => {
  const rows = await sbSelect<SquadRow>(
    'squad_players',
    `select=*&profile_id=eq.${encodeURIComponent(profileId)}&order=slot_index.asc`,
  );
  if (rows.length === 0) return blankSquad();
  const saved = rows.map(toSquadPlayer);
  // 保存済みが 23 未満でも欠番を埋めて必ず 23 スロットにする
  const base = blankSquad();
  for (const p of saved) if (p.slotIndex >= 0 && p.slotIndex < base.length) base[p.slotIndex] = p;
  return base;
};

export const saveSquad = async (
  profileId: string,
  players: SquadPlayer[],
): Promise<SquadPlayer[]> => {
  const rows = players.map((p) => ({
    profile_id: profileId,
    slot_index: p.slotIndex,
    name: p.name,
    position: p.position,
    attack_skill: p.attackSkill,
    defense_skill: p.defenseSkill,
    updated_at: new Date().toISOString(),
  }));
  const saved = await sbUpsert<SquadRow>('squad_players', rows, 'profile_id,slot_index');
  return saved.map(toSquadPlayer).sort((a, b) => a.slotIndex - b.slotIndex);
};

/** 名前が入っている選手だけを起用対象とする */
export const usablePlayers = (squad: SquadPlayer[]): SquadPlayer[] =>
  squad.filter((p) => p.name.trim().length > 0);
