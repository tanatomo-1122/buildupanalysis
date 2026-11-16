/**
 * E2E 用のデータ投入。モック Supabase に 23 名ぶんの選手を入れて、
 * ログイン済みセッション（localStorage に入れる形）を標準出力に出す。
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

/** 署名なしの JWT（モックは中身の sub だけを見る） */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const USER_ID = `e2e-user-${Date.now()}`;
const token = `${b64({ alg: 'none' })}.${b64({
  sub: USER_ID,
  user_metadata: { full_name: 'E2E監督' },
})}.sig`;

const post = async (table, body) => {
  const res = await fetch(`${API}/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      Authorization: `Bearer ${token}`,
    },
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

// ブラウザの localStorage にそのまま入れるセッション
console.log(
  JSON.stringify({
    accessToken: token,
    refreshToken: 'mock-refresh',
    expiresAt: Math.floor(Date.now() / 1000) + 24 * 3600,
    user: { id: USER_ID, name: 'E2E監督' },
  }),
);
