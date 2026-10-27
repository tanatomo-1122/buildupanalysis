/**
 * 試作: 相手が反応する場合（ゼロ和ゲームとして解く）
 *
 *   npx tsx tools/proto-game.ts
 *
 * いまの提案は「相手の配置を固定して、自分だけ最適化する」片側最適化。
 * 相手もこちらに合わせて選び直すなら、話はゲームになる。
 *
 *   1. 17×17 の利得行列を作る（自分の形 × 相手の形 → バランス）
 *   2. 片側最適化の答えが、相手の最善手に対してどこまで落ちるかを見る
 *   3. マックスミン（最悪ケース最大化）と混合戦略ナッシュ均衡を解く
 */
import { DEFAULT_PARAMS } from '../src/constants';
import { FORMATIONS, buildLineup } from '../src/data/formations';
import { evaluateBoard } from '../src/logic/evaluate';
import { outfieldHolders } from '../src/logic/holderAverage';
import type { Params, Player, TeamId } from '../src/types';

const paramsFor = (team: TeamId): Params => ({
  ...DEFAULT_PARAMS,
  possessionTeam: team,
  scene: 'possession',
  homeStyle: 'possession',
  awayStyle: 'shortCounter',
  valueModel: 'progress',
});

const score = (players: Player[], team: TeamId): number => {
  const params = paramsFor(team);
  const holders = outfieldHolders(players, team);
  let sum = 0;
  for (const h of holders) sum += evaluateBoard(players, h.pos, params, h.id).total;
  return sum / holders.length;
};

/* ── 利得行列 A[i][j] = 自分が形 i・相手が形 j のときの（自分の前進 − 相手の前進） ── */
const N = FORMATIONS.length;
const t0 = Date.now();
const A: number[][] = [];
for (let i = 0; i < N; i++) {
  const home = buildLineup('home', FORMATIONS[i].id, 0);
  const row: number[] = [];
  for (let j = 0; j < N; j++) {
    const players = [...home, ...buildLineup('away', FORMATIONS[j].id, 8)];
    row.push(score(players, 'home') - score(players, 'away'));
  }
  A.push(row);
}
console.log(`利得行列 ${N}×${N} を ${Date.now() - t0}ms で構築\n`);

const label = (i: number) => FORMATIONS[i].label;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/* ── 1. 片側最適化（いまの提案）── 相手を 4-2-3-1 に固定 ── */
const fixedJ = FORMATIONS.findIndex((f) => f.id === '4-2-3-1');
const oneSided = A.map((row, i) => ({ i, v: row[fixedJ] })).sort((a, b) => b.v - a.v);
console.log('【1】片側最適化（相手 4-2-3-1 固定）＝ いまの提案のやり方');
console.log(`  最善: ${label(oneSided[0].i)}  バランス ${oneSided[0].v.toFixed(2)}`);
console.log(`  次点: ${label(oneSided[1].i)}  ${oneSided[1].v.toFixed(2)}`);

/* ── 2. 相手が最善で返してきたら ── */
const worst = A.map((row, i) => ({ i, v: Math.min(...row), arg: row.indexOf(Math.min(...row)) }));
const byWorst = [...worst].sort((a, b) => b.v - a.v);
console.log('\n【2】相手が最善手で返してきたときの値（＝その形の最悪ケース）');
for (const o of oneSided.slice(0, 3)) {
  const w = worst[o.i];
  console.log(
    `  ${label(o.i).padEnd(9)} 固定相手には ${o.v.toFixed(2)} → ` +
      `最悪 ${w.v.toFixed(2)}（相手が ${label(w.arg)} に変えたとき）  落差 ${(o.v - w.v).toFixed(2)}`,
  );
}
console.log(`\n  マックスミン（最悪ケース最大化）の答え: ${label(byWorst[0].i)}  保証値 ${byWorst[0].v.toFixed(2)}`);
console.log(`  片側最適化の答え ${label(oneSided[0].i)} は最悪ケース順だと ` +
  `${byWorst.findIndex((w) => w.i === oneSided[0].i) + 1}位 / ${N}`);

/* ── 3. 混合戦略ナッシュ均衡（擬似プレイで近似）── */
const ITER = 200000;
const cntI = new Array(N).fill(0);
const cntJ = new Array(N).fill(0);
const payI = new Array(N).fill(0); // 各 i の累積利得（相手の経験分布に対して）
const payJ = new Array(N).fill(0);
cntJ[0] = 1;
for (let k = 0; k < N; k++) payI[k] = A[k][0];
for (let t = 0; t < ITER; t++) {
  // 自分は相手の経験分布に対する最善手
  let bi = 0;
  for (let k = 1; k < N; k++) if (payI[k] > payI[bi]) bi = k;
  cntI[bi]++;
  for (let k = 0; k < N; k++) payJ[k] += A[bi][k];
  // 相手は自分の経験分布に対する最善手（ゼロ和なので最小化）
  let bj = 0;
  for (let k = 1; k < N; k++) if (payJ[k] < payJ[bj]) bj = k;
  cntJ[bj]++;
  for (let k = 0; k < N; k++) payI[k] += A[k][bj];
}
const mixI = cntI.map((c) => c / cntI.reduce((a, b) => a + b, 0));
const mixJ = cntJ.map((c) => c / cntJ.reduce((a, b) => a + b, 0));
const gameValue = mixI.reduce((s, pi, i) => s + pi * mixJ.reduce((s2, pj, j) => s2 + pj * A[i][j], 0), 0);

console.log('\n【3】混合戦略ナッシュ均衡（擬似プレイ 20万回）');
console.log(`  ゲームの値: ${gameValue.toFixed(3)}`);
console.log('  自分の最適な使い分け:');
mixI
  .map((p, i) => ({ p, i }))
  .filter((x) => x.p > 0.01)
  .sort((a, b) => b.p - a.p)
  .forEach((x) => console.log(`    ${label(x.i).padEnd(9)} ${(x.p * 100).toFixed(1)}%`));
console.log('  相手の最適な使い分け:');
mixJ
  .map((p, i) => ({ p, i }))
  .filter((x) => x.p > 0.01)
  .sort((a, b) => b.p - a.p)
  .forEach((x) => console.log(`    ${label(x.i).padEnd(9)} ${(x.p * 100).toFixed(1)}%`));

/* ── 4. 相手の分布に対するロバスト最適化 ── */
console.log('\n【4】相手が一様ランダムなら（＝相手を読まない場合）');
const avg = A.map((row, i) => ({ i, v: mean(row) })).sort((a, b) => b.v - a.v);
console.log(`  最善: ${label(avg[0].i)}  平均 ${avg[0].v.toFixed(2)}`);
console.log(`  片側最適化の答え ${label(oneSided[0].i)} は平均順だと ` +
  `${avg.findIndex((a) => a.i === oneSided[0].i) + 1}位 / ${N}`);

/* ── 5. 「相性」の強さ ── */
console.log('\n【5】相性の強さ（行ごとの最大 − 最小）');
const spreads = A.map((row, i) => ({ i, s: Math.max(...row) - Math.min(...row) }))
  .sort((a, b) => b.s - a.s);
console.log(`  相手次第で最も振れる形: ${label(spreads[0].i)}  振れ幅 ${spreads[0].s.toFixed(2)}`);
console.log(`  最も振れない形        : ${label(spreads[N - 1].i)}  振れ幅 ${spreads[N - 1].s.toFixed(2)}`);
console.log(`  全体の平均振れ幅      : ${mean(spreads.map((s) => s.s)).toFixed(2)}`);
console.log(`  （参考）片側最適化での1位と2位の差: ${(oneSided[0].v - oneSided[1].v).toFixed(2)}`);
