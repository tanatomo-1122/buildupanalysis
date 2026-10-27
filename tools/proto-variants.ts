/**
 * 試作: 形の変種（同じ 4-4-2 でも何パターンか）を足すと相性は増えるか
 *   npx tsx tools/proto-variants.ts
 *
 * 仮説: 「形の名前」より「ラインの高さ・幅」の方が相手との噛み合いを生むのではないか。
 * proto-interaction.ts と同じ分散分解を、変種を足した集合でやり直して確かめる。
 *
 * 変種はゾーン制約を守る。はみ出すぶんは元の座標側へ引き戻す（＝その形の限界）。
 */
import { DEFAULT_PARAMS } from '../src/constants';
import { FORMATIONS, slotPosition } from '../src/data/formations';
import type { Formation, FormationSlot } from '../src/data/formations';
import { isAllowedAt } from '../src/data/zones';
import { DEFAULT_SKILLS } from '../src/data/skills';
import { evaluateBoard } from '../src/logic/evaluate';
import { outfieldHolders } from '../src/logic/holderAverage';
import type { Params, Player, TeamId, ValueModel } from '../src/types';

/* ── 変種の定義 ───────────────────────────────────────────── */

interface Shape {
  id: string;
  label: string;
  /** x シフト [m]。+ で前がかり */
  line: number;
  /** y の広がり倍率。>1 でワイド */
  width: number;
  /** x の広がり倍率（GK を除く重心まわり）。<1 でコンパクト */
  compact: number;
}

const SHAPES: Shape[] = [
  { id: 'base', label: '標準', line: 0, width: 1, compact: 1 },
  { id: 'high', label: 'ハイライン', line: 7, width: 1, compact: 1 },
  { id: 'low', label: 'ローブロック', line: -7, width: 1, compact: 1 },
  { id: 'wide', label: 'ワイド', line: 0, width: 1.2, compact: 1 },
  { id: 'narrow', label: 'ナロー', line: 0, width: 0.8, compact: 1 },
  { id: 'compact', label: 'コンパクト', line: 0, width: 0.9, compact: 0.82 },
  { id: 'highNarrow', label: 'ハイライン・ナロー', line: 6, width: 0.82, compact: 0.88 },
  { id: 'lowWide', label: 'ローブロック・ワイド', line: -6, width: 1.15, compact: 1 },
];

/** ゾーンで許される範囲まで引き戻しながら座標を動かす */
const legalize = (slot: FormationSlot, tx: number, ty: number): FormationSlot => {
  // 目標座標から元座標へ 1→0 で二分的に戻し、最初に合法になる点を採る
  for (let t = 1; t >= 0; t -= 0.05) {
    const x = slot.x + (tx - slot.x) * t;
    const y = slot.y + (ty - slot.y) * t;
    if (isAllowedAt({ x, y }, 'home', slot.position)) {
      return { ...slot, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    }
  }
  return { ...slot };
};

const applyShape = (base: Formation, shape: Shape): Formation => {
  const out = base.slots.filter((sl) => sl.position !== 'GK');
  const cx = out.reduce((a, b) => a + b.x, 0) / out.length;

  const slots = base.slots.map((sl) => {
    if (sl.position === 'GK') return { ...sl };
    const tx = cx + (sl.x - cx) * shape.compact + shape.line;
    const ty = 34 + (sl.y - 34) * shape.width;
    return legalize(sl, tx, ty);
  });

  return {
    id: shape.id === 'base' ? base.id : `${base.id}@${shape.id}`,
    label: shape.id === 'base' ? base.label : `${base.label} ${shape.label}`,
    desc: base.desc,
    slots,
  };
};

/** その変種が元の形からどれだけ動いたか（0 なら制約で潰れて意味が無い） */
const shift = (a: Formation, b: Formation): number =>
  a.slots.reduce(
    (s2, sl, i) => s2 + Math.hypot(sl.x - b.slots[i].x, sl.y - b.slots[i].y),
    0,
  ) / a.slots.length;

/* ── 盤面スコア ───────────────────────────────────────────── */

const paramsFor = (team: TeamId, valueModel: ValueModel): Params => ({
  ...DEFAULT_PARAMS,
  possessionTeam: team,
  scene: 'possession',
  homeStyle: 'possession',
  awayStyle: 'shortCounter',
  valueModel,
});

const score = (players: Player[], team: TeamId, vm: ValueModel): number => {
  const params = paramsFor(team, vm);
  const holders = outfieldHolders(players, team);
  let sum = 0;
  for (const h of holders) sum += evaluateBoard(players, h.pos, params, h.id).total;
  return sum / holders.length;
};

/** Formation オブジェクトから直接11人を組む（id 参照の buildLineup は使えないため） */
const lineupOf = (f: Formation, team: TeamId, line: number): Player[] =>
  f.slots.map((slot) => {
    const d = DEFAULT_SKILLS[slot.position];
    return {
      id: `${team}-${slot.number}`,
      team,
      number: slot.number,
      position: slot.position,
      attackSkill: d.attack,
      defenseSkill: d.defense,
      pos: slotPosition(slot, team, line),
    };
  });

/* ── 分散分解 ─────────────────────────────────────────────── */

const decompose = (A: number[][], names: string[]) => {
  const N = A.length;
  const M = A[0].length;
  const grand = A.flat().reduce((a, b) => a + b, 0) / (N * M);
  const rowM = A.map((r) => r.reduce((a, b) => a + b, 0) / M);
  const colM = Array.from({ length: M }, (_, j) => A.reduce((s2, r) => s2 + r[j], 0) / N);

  let ssRow = 0, ssCol = 0, ssInt = 0;
  for (let i = 0; i < N; i++) ssRow += M * (rowM[i] - grand) ** 2;
  for (let j = 0; j < M; j++) ssCol += N * (colM[j] - grand) ** 2;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < M; j++) ssInt += (A[i][j] - rowM[i] - colM[j] + grand) ** 2;
  const total = ssRow + ssCol + ssInt;

  const bestPerOpponent = Array.from({ length: M }, (_, j) => {
    let bi = 0;
    for (let i = 1; i < N; i++) if (A[i][j] > A[bi][j]) bi = i;
    return bi;
  });
  const distinct = new Set(bestPerOpponent).size;

  let regret = 0;
  for (let j = 0; j < M; j++) {
    const best = A[bestPerOpponent[j]][j];
    for (let jp = 0; jp < M; jp++) regret += best - A[bestPerOpponent[jp]][j];
  }

  return {
    pctRow: (ssRow / total) * 100,
    pctCol: (ssCol / total) * 100,
    pctInt: (ssInt / total) * 100,
    sdInt: Math.sqrt(ssInt / (N * M)),
    distinct,
    avgRegret: regret / (M * M),
    bestNames: bestPerOpponent.map((i) => names[i]),
  };
};

/* ── 実行 ─────────────────────────────────────────────────── */

const run = (shapes: Shape[], tag: string, vm: ValueModel) => {
  const cat: Formation[] = [];
  for (const base of FORMATIONS) for (const sh of shapes) cat.push(applyShape(base, sh));

  const t0 = Date.now();
  const homes = cat.map((f) => lineupOf(f, 'home', 0));
  const aways = cat.map((f) => lineupOf(f, 'away', 8));
  const A: number[][] = [];
  for (let i = 0; i < cat.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < cat.length; j++) {
      const players = [...homes[i], ...aways[j]];
      row.push(score(players, 'home', vm) - score(players, 'away', vm));
    }
    A.push(row);
  }
  const ms = Date.now() - t0;
  const d = decompose(A, cat.map((f) => f.label));

  console.log(`\n── ${tag}（${cat.length}形 / ${vm === 'progress' ? '前進量' : 'パスコース'}）${ms}ms ──`);
  console.log(`  自分 ${d.pctRow.toFixed(1)}%  相手 ${d.pctCol.toFixed(1)}%  ` +
    `相性 ${d.pctInt.toFixed(1)}% (SD ${d.sdInt.toFixed(2)})`);
  console.log(`  相手ごとの最適形の種類: ${d.distinct} / ${cat.length}`);
  console.log(`  読み違えたときの平均損失: ${d.avgRegret.toFixed(3)}`);
  const counts = new Map<string, number>();
  for (const n of d.bestNames) counts.set(n, (counts.get(n) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`  最適形の内訳: ${top.map(([n, c]) => `${n}×${c}`).join(' / ')}`);
  return d;
};

// 変種が制約で潰れていないか先に確認
console.log('変種の実効的な移動量（0 に近いとゾーン制約で潰れている）');
for (const sh of SHAPES.slice(1)) {
  const shifts = FORMATIONS.map((b) => shift(b, applyShape(b, sh)));
  const mean = shifts.reduce((a, b) => a + b, 0) / shifts.length;
  console.log(`  ${sh.label.padEnd(20)} 平均 ${mean.toFixed(2)}m  最小 ${Math.min(...shifts).toFixed(2)}m  最大 ${Math.max(...shifts).toFixed(2)}m`);
}

run([SHAPES[0]], '現状（変種なし）', 'progress');
run(SHAPES.slice(0, 4), '変種3つ', 'progress');
run(SHAPES, '変種7つ', 'progress');
run(SHAPES, '変種7つ', 'passOptions');
