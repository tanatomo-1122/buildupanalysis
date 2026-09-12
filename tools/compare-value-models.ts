/**
 * 前進量モデル と パスコース探索型モデル の比較
 *
 *   npx tsx tools/compare-value-models.ts
 *
 * 同じ選手・同じ相手配置に対して2つのモデルで提案を走らせ、
 * スコア分布・順位・推奨される形がどう変わるかを出す。
 */
import { PASS_THRESHOLD } from '../src/constants';
import { DEFAULT_SKILLS } from '../src/data/skills';
import { opponentLineup, recommendFormations } from '../src/logic/recommend';
import type { RecommendResult } from '../src/logic/recommend';
import type { Player, PositionId, SquadPlayer, ValueModel } from '../src/types';

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

const preset = opponentLineup('4-2-3-1', 8);

const overloadLeft = (players: Player[]): Player[] =>
  players.map((p) =>
    p.position === 'GK' ? p : { ...p, pos: { x: p.pos.x, y: Math.min(66, p.pos.y * 0.35 + 2) } },
  );

const highLine = (players: Player[]): Player[] =>
  players.map((p) =>
    p.position === 'GK' ? p : { ...p, pos: { x: Math.max(4, p.pos.x - 26), y: p.pos.y } },
  );

const SCENARIOS: { label: string; away: Player[] }[] = [
  { label: 'プリセット 4-2-3-1', away: preset },
  { label: '極端な片攻め', away: overloadLeft(preset) },
  { label: 'ハイライン', away: highLine(preset) },
];

const run = (away: Player[], valueModel: ValueModel): RecommendResult =>
  recommendFormations({
    squad,
    homeStyle: 'possession',
    opponentPlayers: away,
    opponentStyle: 'shortCounter',
    scene: 'possession',
    homeLine: 0,
    rankMode: 'balance',
    valueModel,
  });

const stats = (xs: number[]) => {
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return { min, max, mean, sd, span: max - min };
};

const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].length * 1));

console.log(`パス開通の閾値 PASS_THRESHOLD = ${PASS_THRESHOLD}\n`);

for (const sc of SCENARIOS) {
  console.log(`\n${'='.repeat(78)}\n[${sc.label}]\n${'='.repeat(78)}`);

  const prog = run(sc.away, 'progress');
  const pass = run(sc.away, 'passOptions');

  for (const [name, r] of [['前進量', prog], ['パスコース', pass]] as const) {
    const a = stats(r.rows.map((x) => x.attack));
    const d = stats(r.rows.map((x) => x.defense));
    console.log(
      `\n  ${name}モデル  (${r.elapsedMs}ms / 評価 ${r.evaluations}回)\n` +
        `    自チーム: ${a.min.toFixed(2)} 〜 ${a.max.toFixed(2)}  ` +
        `平均 ${a.mean.toFixed(2)}  SD ${a.sd.toFixed(3)}  幅 ${a.span.toFixed(2)}\n` +
        `    相手    : ${d.min.toFixed(2)} 〜 ${d.max.toFixed(2)}  ` +
        `平均 ${d.mean.toFixed(2)}  SD ${d.sd.toFixed(3)}  幅 ${d.span.toFixed(2)}\n` +
        `    識別力（幅 / 平均の絶対値）: ${(a.span / Math.max(0.01, Math.abs(a.mean))).toFixed(2)}\n` +
        `    推奨: ${r.best.label}`,
    );
  }

  // 並びの比較
  const pRank = new Map(prog.rows.map((r, i) => [r.formationId, i + 1]));
  const qRank = new Map(pass.rows.map((r, i) => [r.formationId, i + 1]));
  console.log('\n  順位の比較（パスコース順）');
  console.log(
    `    ${pad('形', 10)} ${pad('前進量', 8)} ${pad('パスコース', 10)} ${pad('移動', 6)} 自/相手（パスコース）`,
  );
  for (const r of pass.rows) {
    const pr = pRank.get(r.formationId)!;
    const qr = qRank.get(r.formationId)!;
    const delta = pr - qr;
    const mark = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : '−';
    console.log(
      `    ${pad(r.label, 10)} ${pad(`${pr}位`, 8)} ${pad(`${qr}位`, 10)} ${pad(mark, 6)} ` +
        `${r.attack.toFixed(2)} / ${r.defense.toFixed(2)}`,
    );
  }

  // 順位相関（スピアマン）
  const ids = prog.rows.map((r) => r.formationId);
  const n = ids.length;
  const d2 = ids.reduce((s, id) => s + (pRank.get(id)! - qRank.get(id)!) ** 2, 0);
  const rho = 1 - (6 * d2) / (n * (n * n - 1));
  console.log(`\n  2モデルの順位相関 ρ = ${rho.toFixed(3)}（1に近いほど同じ結論）`);
}
