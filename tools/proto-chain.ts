/**
 * 試作: 連鎖モデル（EPV / 吸収マルコフ連鎖）
 *
 *   npx tsx tools/proto-chain.ts
 *
 * 現行の2モデルは「ボールを1回蹴ったらどうなるか」しか見ていない。
 * ここでは「失う前にシュートまで到達できる確率」を解く。
 *
 *   V(i) = s(x_i) + (1 − s(x_i)) × Σ_j π(j|i) × p_ij × V(j)
 *
 *     s(x)  : その位置からシュートに行く確率（ゴールに近いほど高い）
 *     π(j|i): 保持者 i が j を選ぶ確率（開通度と前向きさのソフトマックス）
 *     p_ij  : そのパスが通る確率（＝既存のボトルネック PC。ここは一切変えない）
 *     失敗したら吸収（価値 0）
 *
 * 1次方程式なので (I − M) V = S を解くだけ。評価回数は起点平均と同じ10回/盤面。
 */
import { DEFAULT_PARAMS } from '../src/constants';
import { FORMATIONS, buildLineup } from '../src/data/formations';
import { evaluateBoard } from '../src/logic/evaluate';
import { outfieldHolders } from '../src/logic/holderAverage';
import { opponentLineup } from '../src/logic/recommend';
import type { Params, Player, TeamId, ValueModel } from '../src/types';

/* ── モデルのつまみ ───────────────────────────────────────── */

/** その x からシュートに行く確率。ゴール前で立ち上がる */
const shootProb = (x: number, dir: number): number => {
  // dir=+1 なら x=105 が相手ゴール。自陣基準の前進量に直す
  const adv = dir > 0 ? x : 105 - x;
  return 1 / (1 + Math.exp(-(adv - 88) / 5));
};

/** 保持者の選好。開通度が高く前向きなパスほど選ばれやすい */
const BETA_PC = 3.0;
const BETA_FWD = 2.0;

/* ── 連鎖を解く ───────────────────────────────────────────── */

interface ChainResult {
  /** 各起点からの「失う前にシュートまで行ける確率」 */
  values: number[];
  /** 平均 */
  mean: number;
  /** 最も深い位置（自陣の起点）からの値 */
  deepest: number;
}

const solveChain = (players: Player[], params: Params, team: TeamId): ChainResult => {
  const holders = outfieldHolders(players, team);
  const n = holders.length;
  const dir = team === 'home' ? 1 : -1;

  // p[i][j] = 保持者 i から j へのパスの開通度（既存の評価をそのまま使う）
  const p: number[][] = [];
  for (let i = 0; i < n; i++) {
    const ev = evaluateBoard(players, { ...holders[i].pos }, params, holders[i].id);
    const byId = new Map(ev.players.map((e) => [e.playerId, e]));
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) { row.push(0); continue; }
      const e = byId.get(holders[j].id);
      row.push(e ? Math.max(0, Math.min(1, e.pc)) : 0);
    }
    p.push(row);
  }

  // 遷移行列 M[i][j] = (1 − s_i) × π(j|i) × p_ij
  const s = holders.map((h) => shootProb(h.pos.x, dir));
  const M: number[][] = [];
  for (let i = 0; i < n; i++) {
    const logits: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) { logits.push(-Infinity); continue; }
      const fwd = ((holders[j].pos.x - holders[i].pos.x) * dir) / 105;
      logits.push(BETA_PC * p[i][j] + BETA_FWD * fwd);
    }
    const max = Math.max(...logits.filter((v) => Number.isFinite(v)));
    const exp = logits.map((v) => (Number.isFinite(v) ? Math.exp(v - max) : 0));
    const sum = exp.reduce((a, b) => a + b, 0) || 1;
    M.push(exp.map((e, j) => ((1 - s[i]) * (e / sum) * p[i][j])));
  }

  // (I − M) V = s を解く（ガウスの消去法。n=10 なので何でもよい）
  const A: number[][] = M.map((row, i) => row.map((v, j) => (i === j ? 1 - v : -v)));
  const b = s.slice();
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    const d = A[col][col] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / d;
      if (!f) continue;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const values = b.map((v, i) => v / (A[i][i] || 1e-12));

  const mean = values.reduce((a, v) => a + v, 0) / n;
  // 自陣側の起点（＝ビルドアップの出発点）
  const deepIdx = holders
    .map((h, i) => ({ i, adv: dir > 0 ? h.pos.x : 105 - h.pos.x }))
    .sort((a, b2) => a.adv - b2.adv)[0].i;

  return { values, mean, deepest: values[deepIdx] };
};

/* ── 比較 ─────────────────────────────────────────────────── */

const away = opponentLineup('4-2-3-1', 8);

const paramsFor = (team: TeamId, valueModel: ValueModel): Params => ({
  ...DEFAULT_PARAMS,
  possessionTeam: team,
  scene: 'possession',
  homeStyle: 'possession',
  awayStyle: 'shortCounter',
  valueModel,
});

/** 既存モデルの起点平均 */
const flatScore = (players: Player[], team: TeamId, valueModel: ValueModel): number => {
  const params = paramsFor(team, valueModel);
  const holders = outfieldHolders(players, team);
  let sum = 0;
  for (const h of holders) sum += evaluateBoard(players, h.pos, params, h.id).total;
  return sum / holders.length;
};

const describe = (xs: number[]) => {
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return { min, max, mean, sd, span: max - min, cv: span2(max - min, mean) };
};
const span2 = (span: number, mean: number) => span / Math.max(1e-6, Math.abs(mean));

const rows = FORMATIONS.map((f) => {
  const players = [...buildLineup('home', f.id, 0), ...away];
  const t0 = Date.now();
  const chainH = solveChain(players, paramsFor('home', 'progress'), 'home');
  const chainA = solveChain(players, paramsFor('away', 'progress'), 'away');
  const ms = Date.now() - t0;
  return {
    id: f.id,
    label: f.label,
    progress: flatScore(players, 'home', 'progress'),
    passOptions: flatScore(players, 'home', 'passOptions'),
    chain: chainH.mean,
    chainDeep: chainH.deepest,
    chainAway: chainA.mean,
    ms,
  };
});

const prog = describe(rows.map((r) => r.progress));
const pass = describe(rows.map((r) => r.passOptions));
const chain = describe(rows.map((r) => r.chain));
const chainD = describe(rows.map((r) => r.chainDeep));
const chainA = describe(rows.map((r) => r.chainAway));

const line = (name: string, d: ReturnType<typeof describe>, unit: string) =>
  `  ${name.padEnd(22)} ${d.min.toFixed(3)}〜${d.max.toFixed(3)} ${unit}  ` +
  `平均 ${d.mean.toFixed(3)}  SD ${d.sd.toFixed(3)}  識別力(幅/平均) ${d.cv.toFixed(2)}`;

console.log('17フォーメーションのスコア分布（相手 4-2-3-1 固定）\n');
console.log(line('前進量（既存）', prog, 'm'));
console.log(line('パスコース（既存）', pass, '本'));
console.log(line('連鎖・全起点平均', chain, ' '));
console.log(line('連鎖・最深の起点', chainD, ' '));
console.log(line('連鎖・相手側', chainA, ' '));
console.log(`\n  1形あたりの計算時間: ${Math.max(...rows.map((r) => r.ms))}ms（両チームぶん）`);

console.log('\n順位（連鎖・全起点平均の降順）');
console.log(`  ${'形'.padEnd(10)} ${'連鎖'.padEnd(8)} ${'最深'.padEnd(8)} ${'前進量'.padEnd(8)} ${'パス本数'}`);
const sorted = [...rows].sort((a, b) => b.chain - a.chain);
const rank = (key: keyof (typeof rows)[0], desc = true) => {
  const o = [...rows].sort((a, b) => (desc ? (b[key] as number) - (a[key] as number) : 0));
  return new Map(o.map((r, i) => [r.id, i + 1]));
};
const rProg = rank('progress');
const rPass = rank('passOptions');
for (const r of sorted) {
  console.log(
    `  ${r.label.padEnd(10)} ${r.chain.toFixed(3).padEnd(8)} ${r.chainDeep.toFixed(3).padEnd(8)} ` +
      `${`${rProg.get(r.id)}位`.padEnd(8)} ${`${rPass.get(r.id)}位`}`,
  );
}

// 順位相関
const rChain = rank('chain');
const n = rows.length;
const rho = (a: Map<string, number>, b: Map<string, number>) => {
  const d2 = rows.reduce((s, r) => s + (a.get(r.id)! - b.get(r.id)!) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
};
console.log(
  `\n順位相関  連鎖 vs 前進量 ρ=${rho(rChain, rProg).toFixed(3)}  /  ` +
    `連鎖 vs パス本数 ρ=${rho(rChain, rPass).toFixed(3)}  /  ` +
    `前進量 vs パス本数 ρ=${rho(rProg, rPass).toFixed(3)}`,
);
