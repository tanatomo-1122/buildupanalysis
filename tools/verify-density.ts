/**
 * 検証: フリーエディット（変則配置）に提案が追随するか
 *
 *   npx tsx tools/verify-density.ts
 */
import { FORMATIONS } from '../src/data/formations';
import { DEFAULT_SKILLS } from '../src/data/skills';
import { allowedAt, correctPosition, togglePosition, zoneAt } from '../src/data/zones';
import { analyzeDensity } from '../src/logic/density';
import { opponentLineup, recommendFormations } from '../src/logic/recommend';
import type { Player, PositionId, SquadPlayer } from '../src/types';

const ok = (label: string, cond: boolean, extra = '') =>
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? `  ${extra}` : ''}`);

/* ── ダミーの23人。各ポジションを一通り本職で揃える ─────────────── */
const ROSTER: PositionId[] = [
  'GK', 'GK',
  'CB', 'CB', 'CB', 'CB',
  'RSB', 'RSB', 'LSB', 'LSB',
  'DMF', 'DMF', 'CMF', 'CMF', 'CMF',
  'OMF', 'RMF', 'LMF',
  'RWG', 'LWG',
  'ST', 'CF', 'CF',
];

const squad: SquadPlayer[] = ROSTER.map((pos, i) => ({
  id: `p${i}`,
  slotIndex: i,
  name: `選手${i + 1}`,
  position: pos,
  attackSkill: DEFAULT_SKILLS[pos].attack,
  defenseSkill: DEFAULT_SKILLS[pos].defense,
}));

const base = {
  squad,
  homeStyle: 'possession',
  opponentStyle: 'shortCounter',
  scene: 'possession' as const,
  homeLine: 0,
  rankMode: 'balance' as const,
};

/* ── 1. ゾーン定義の健全性 ──────────────────────────────────── */
console.log('\n── ゾーン定義 ──');
{
  let violations = 0;
  for (const f of FORMATIONS) {
    for (const s of f.slots) {
      if (!allowedAt({ x: s.x, y: s.y }, 'home').includes(s.position)) {
        violations++;
        console.log(`   ${f.id} #${s.number} ${s.position} @(${s.x},${s.y}) → ${zoneAt({ x: s.x, y: s.y }).id}`);
      }
    }
  }
  ok(`${FORMATIONS.length} フォーメーションすべてがゾーン適合`, violations === 0, `違反 ${violations}`);

  // 鏡映：home の座標と away の鏡像で同じゾーンになる
  let mismatch = 0;
  for (const f of FORMATIONS) {
    for (const s of f.slots) {
      const h = zoneAt({ x: s.x, y: s.y }, 'home').id;
      const a = zoneAt({ x: 105 - s.x, y: 68 - s.y }, 'away').id;
      if (h !== a) mismatch++;
    }
  }
  ok('鏡映しても同じゾーンに判定される', mismatch === 0, `不一致 ${mismatch}`);

  // 自動是正とトグル
  const corrected = correctPosition({ x: 20, y: 8 }, 'home', 'CB');
  ok('自動是正 CB@右サイド守備 → RSB', corrected === 'RSB', `→ ${corrected}`);
  const t1 = togglePosition({ x: 42, y: 34 }, 'home', 'DMF');
  const t2 = togglePosition({ x: 42, y: 34 }, 'home', t1);
  ok('トグル C2: DMF → CMF → DMF', t1 === 'CMF' && t2 === 'DMF', `${t1} → ${t2}`);
}

/* ── 2. 変則配置の密度解析 ─────────────────────────────────── */
console.log('\n── 密度解析 ──');

/** 相手を左サイド（自チームから見て左＝y 大）に極端に寄せる */
const overloadLeft = (players: Player[]): Player[] =>
  players.map((p) =>
    p.position === 'GK' ? p : { ...p, pos: { x: p.pos.x, y: Math.min(66, p.pos.y * 0.35 + 2) } },
  );

/** 相手を極端に前掛かりにする（ハイライン） */
const highLine = (players: Player[]): Player[] =>
  players.map((p) => (p.position === 'GK' ? p : { ...p, pos: { x: Math.max(4, p.pos.x - 26), y: p.pos.y } }));

const preset = opponentLineup('4-2-3-1', 8);
const scenes: { label: string; away: Player[] }[] = [
  { label: 'プリセット 4-2-3-1', away: preset },
  { label: '極端な片攻め（左に寄せる）', away: overloadLeft(preset) },
  { label: 'ハイライン（前掛かり）', away: highLine(preset) },
];

for (const s of scenes) {
  const d = analyzeDensity(s.away);
  console.log(`\n[${s.label}]`);
  console.log(`   右${d.rightCount} / 中${d.centerCount} / 左${d.leftCount}` +
    `  偏り ${(d.lateralBias * 100).toFixed(0)}%  前掛かり ${(d.advance * 100).toFixed(0)}%`);
  for (const line of d.summary) console.log(`   ・${line}`);
}

/* ── 3. 提案が配置に追随するか ─────────────────────────────── */
console.log('\n── 提案の追随 ──');
const results = scenes.map((s) => {
  const t0 = Date.now();
  const r = recommendFormations({ ...base, opponentPlayers: s.away });
  return { label: s.label, r, ms: Date.now() - t0 };
});

for (const { label, r, ms } of results) {
  const top = r.rows.slice(0, 3).map((x) => `${x.label}(${x.score.toFixed(1)})`).join(' / ');
  console.log(`\n[${label}] ${ms}ms  評価 ${r.evaluations} 回`);
  console.log(`   推奨: ${r.best.label}  攻 ${r.best.attack.toFixed(1)} 守 ${r.best.defense.toFixed(1)}` +
    `  空きの活用 ${(r.best.spaceScore * 100).toFixed(0)}  適性減点 ${r.best.fitPenalty.toFixed(1)}`);
  console.log(`   上位3: ${top}`);
}

const orders = results.map((x) => x.r.rows.map((y) => y.formationId).join(','));
ok('配置を変えると順位も変わる', new Set(orders).size > 1, `異なる並び ${new Set(orders).size}/${orders.length}`);

const spaces = results.map((x) => x.r.best.spaceScore);
ok('空きの活用スコアが配置ごとに変わる', new Set(spaces.map((s) => s.toFixed(4))).size > 1);

const allNative = results.every((x) => x.r.best.assignments.every((a) => a.positionFit >= 70));
ok('推奨11人が本職／適性ありのみ', allNative);

const slow = results.filter((x) => x.ms > 3000);
ok('1回の提案が 3 秒以内', slow.length === 0, `最大 ${Math.max(...results.map((x) => x.ms))}ms`);

console.log('');
