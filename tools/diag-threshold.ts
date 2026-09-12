/**
 * パス開通判定の分布を調べる。
 *   npx tsx tools/diag-threshold.ts
 *
 * ボトルネック PC がどこに溜まっているかを見て、閾値 0.65 が妥当かを確認する。
 */
import { DEFAULT_PARAMS } from '../src/constants';
import { buildLineup } from '../src/data/formations';
import { evaluateBoard } from '../src/logic/evaluate';
import { outfieldHolders } from '../src/logic/holderAverage';
import { opponentLineup } from '../src/logic/recommend';
import type { Params, TeamId } from '../src/types';

const away = opponentLineup('4-2-3-1', 8);

const paramsFor = (team: TeamId): Params => ({
  ...DEFAULT_PARAMS,
  possessionTeam: team,
  scene: 'possession',
  homeStyle: 'possession',
  awayStyle: 'shortCounter',
  valueModel: 'passOptions',
});

/** 全起点ぶんの pc を集める */
const collect = (formationId: string, team: TeamId): number[] => {
  const home = buildLineup('home', formationId, 0);
  const players = [...home, ...away];
  const params = paramsFor(team);
  const out: number[] = [];
  for (const h of outfieldHolders(players, team)) {
    const ev = evaluateBoard(players, h.pos, params, h.id);
    for (const e of ev.players) if (!e.excluded) out.push(e.pc);
  }
  return out;
};

const quantiles = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), max: s[s.length - 1] };
};

const histogram = (xs: number[]) => {
  const bins = new Array(10).fill(0);
  for (const x of xs) bins[Math.min(9, Math.floor(x * 10))]++;
  return bins
    .map((n, i) => `${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}: ${String(n).padStart(4)}`)
    .join('\n      ');
};

for (const fid of ['4-4-2', '4-2-3-1', '3-4-3', '4-3-3']) {
  console.log(`\n=== ${fid} ===`);
  for (const team of ['home', 'away'] as TeamId[]) {
    const pcs = collect(fid, team);
    const q = quantiles(pcs);
    const openAt = (t: number) => pcs.filter((p) => p >= t).length / 10; // 起点10ぶんの平均本数
    console.log(
      `  ${team}  n=${pcs.length}\n` +
        `    分位: p10 ${q.p10.toFixed(3)} / p25 ${q.p25.toFixed(3)} / p50 ${q.p50.toFixed(3)} / ` +
        `p75 ${q.p75.toFixed(3)} / p90 ${q.p90.toFixed(3)} / max ${q.max.toFixed(3)}\n` +
        `    閾値別の平均開通本数: ` +
        [0.5, 0.55, 0.6, 0.65, 0.7, 0.75]
          .map((t) => `${t}→${openAt(t).toFixed(1)}`)
          .join('  ') +
        `\n      ${histogram(pcs)}`,
    );
  }
}
