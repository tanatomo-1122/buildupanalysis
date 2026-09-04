/**
 * E2E 用のデータ投入。モック Supabase に 23 名ぶんの選手を入れて、
 * 使うプロフィールの ID を標準出力に出す。
 */
const API = process.env.MOCK_API ?? 'http://localhost:54321/rest/v1';

const ROSTER = [
  'GK', 'GK',
  'CB', 'CB', 'CB', 'CB',
  'RSB', 'RSB', 'LSB', 'LSB',
  'DMF', 'DMF', 'CMF', 'CMF', 'CMF',
  'OMF', 'RMF', 'LMF',
  'RWG', 'LWG',
  'ST', 'CF', 'CF',
];

const DEFAULT_SKILLS = JSON.parse(process.env.DEFAULT_SKILLS_JSON ?? '{}');

const post = async (table, body) => {
  const res = await fetch(`${API}/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
};

const [profile] = await post('profiles', {
  user_name: 'E2E監督',
  efootball_id: `e2e-${Date.now()}`,
});

for (let i = 0; i < ROSTER.length; i++) {
  const pos = ROSTER[i];
  await post('squad_players', {
    profile_id: profile.id,
    slot_index: i,
    name: `選手${i + 1}`,
    position: pos,
    attack_skill: DEFAULT_SKILLS[pos]?.attack ?? 'none',
    defense_skill: DEFAULT_SKILLS[pos]?.defense ?? 'none',
  });
}

console.log(JSON.stringify(profile));
