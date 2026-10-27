/**
 * 利得行列の分散分解
 *   npx tsx tools/proto-interaction.ts
 *
 *   A[i][j] = μ + 自分の形の効果 a_i + 相手の形の効果 b_j + 相性 e_ij
 *
 * 「相手に合わせた提案」が成立するのは e_ij（相性）が十分に大きいときだけ。
 * a_i しか無いなら、相手が何をしようが答えは同じ ＝ 提案は相手を見ていない。
 */
import { DEFAULT_PARAMS } from '../src/constants';
import { FORMATIONS, FORMATION_FAMILIES, buildLineup } from '../src/data/formations';
import { evaluateBoard } from '../src/logic/evaluate';
import { outfieldHolders } from '../src/logic/holderAverage';
import type { Params, Player, TeamId, ValueModel } from '../src/types';

/**
 * カタログが大きいので、既定ではランダムに間引いて推定する。
 * SAMPLE=0 で全件。FAMILIES_ONLY=1 で基本形だけ。
 */
const SAMPLE = Number(process.env.SAMPLE ?? '60');
const seedRand = (() => {
  let x = 12345;
  return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
})();

const pool = process.env.FAMILIES_ONLY
  ? FORMATION_FAMILIES
  : // 左右反転しただけの形は片方だけ使う
    FORMATIONS.filter((f, _i, arr) => arr.find((x) => x.symmetryKey === f.symmetryKey) === f);

const CATALOG =
  SAMPLE > 0 && pool.length > SAMPLE
    ? [...pool].sort(() => seedRand() - 0.5).slice(0, SAMPLE)
    : pool;

const build = (valueModel: ValueModel) => {
  const paramsFor = (team: TeamId): Params => ({
    ...DEFAULT_PARAMS,
    possessionTeam: team,
    scene: 'possession',
    homeStyle: 'possession',
    awayStyle: 'shortCounter',
    valueModel,
  });
  const score = (players: Player[], team: TeamId): number => {
    const params = paramsFor(team);
    const holders = outfieldHolders(players, team);
    let sum = 0;
    for (const h of holders) sum += evaluateBoard(players, h.pos, params, h.id).total;
    return sum / holders.length;
  };
  const N = CATALOG.length;
  const A: number[][] = [];
  for (let i = 0; i < N; i++) {
    const home = buildLineup('home', CATALOG[i].id, 0);
    const row: number[] = [];
    for (let j = 0; j < N; j++) {
      const players = [...home, ...buildLineup('away', CATALOG[j].id, 8)];
      row.push(score(players, 'home') - score(players, 'away'));
    }
    A.push(row);
  }
  return A;
};

const decompose = (A: number[][]) => {
  const N = A.length;
  const grand = A.flat().reduce((a, b) => a + b, 0) / (N * N);
  const rowM = A.map((r) => r.reduce((a, b) => a + b, 0) / N);
  const colM = Array.from({ length: N }, (_, j) => A.reduce((s, r) => s + r[j], 0) / N);

  let ssRow = 0, ssCol = 0, ssInt = 0;
  for (let i = 0; i < N; i++) {
    ssRow += N * (rowM[i] - grand) ** 2;
    ssCol += N * (colM[i] - grand) ** 2;
  }
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      ssInt += (A[i][j] - rowM[i] - colM[j] + grand) ** 2;
  const total = ssRow + ssCol + ssInt;

  // 相性が実用上どれだけ効くか: 相手ごとに最適が変わるか
  const bestPerOpponent = Array.from({ length: N }, (_, j) => {
    let bi = 0;
    for (let i = 1; i < N; i++) if (A[i][j] > A[bi][j]) bi = i;
    return bi;
  });
  const distinct = new Set(bestPerOpponent).size;

  // 相手を読み違えたときの損: 真の相手 j に対し、別の相手 j' 用の最適形を使った場合
  let regretSum = 0;
  for (let j = 0; j < N; j++) {
    const best = A[bestPerOpponent[j]][j];
    for (let jp = 0; jp < N; jp++) regretSum += best - A[bestPerOpponent[jp]][j];
  }
  const avgRegret = regretSum / (N * N);

  return {
    grand,
    pctRow: (ssRow / total) * 100,
    pctCol: (ssCol / total) * 100,
    pctInt: (ssInt / total) * 100,
    sdInt: Math.sqrt(ssInt / (N * N)),
    sdRow: Math.sqrt(ssRow / (N * N)),
    distinct,
    avgRegret,
    bestPerOpponent,
  };
};

console.log(`カタログ: ${CATALOG.length} 形\n`);
for (const vm of ['progress', 'passOptions'] as ValueModel[]) {
  const A = build(vm);
  const d = decompose(A);
  console.log(`\n═══ ${vm === 'progress' ? '前進量モデル' : 'パスコースモデル'} ═══`);
  console.log(`  分散の内訳`);
  console.log(`    自分の形で決まる分 : ${d.pctRow.toFixed(1)}%   (SD ${d.sdRow.toFixed(2)})`);
  console.log(`    相手の形で決まる分 : ${d.pctCol.toFixed(1)}%`);
  console.log(`    相性（組み合わせ） : ${d.pctInt.toFixed(1)}%   (SD ${d.sdInt.toFixed(2)})`);
  console.log(`  相手${CATALOG.length}通りに対する最適形の種類: ${d.distinct} 通り / ${CATALOG.length}`);
  console.log(`  相手を読み違えたときの平均損失: ${d.avgRegret.toFixed(3)}`);
  const names = d.bestPerOpponent.map((i) => CATALOG[i].label);
  console.log(`  内訳: ${[...new Set(names)].map((n) => `${n}×${names.filter((x) => x === n).length}`).join(' / ')}`);
}
