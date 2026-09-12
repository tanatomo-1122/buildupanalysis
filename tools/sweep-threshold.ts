/**
 * 閾値スイープ。
 *   npx tsx tools/sweep-threshold.ts
 *
 * PASS_THRESHOLD をいくつか振って、17フォーメーションのスコアが
 * 「ちゃんとばらけるか（識別力があるか）」「床や天井に張り付いていないか」を見る。
 */
import { DEFAULT_PARAMS } from '../src/constants';
import { FORMATIONS, buildLineup } from '../src/data/formations';
import { evaluateBoard } from '../src/logic/evaluate';
import { outfieldHolders } from '../src/logic/holderAverage';
import { opponentLineup } from '../src/logic/recommend';
import type { Params, Player, TeamId } from '../src/types';

const away = opponentLineup('4-2-3-1', 8);

const SOFTNESS = Number(process.env.SOFTNESS ?? '0');

const paramsFor = (team: TeamId, threshold: number): Params => ({
  ...DEFAULT_PARAMS,
  possessionTeam: team,
  scene: 'possession',
  homeStyle: 'possession',
  awayStyle: 'shortCounter',
  valueModel: 'passOptions',
  passThreshold: threshold,
  passSoftness: SOFTNESS,
});

/** 起点平均した「通るパスの本数」 */
const score = (players: Player[], team: TeamId, threshold: number): number => {
  const params = paramsFor(team, threshold);
  const holders = outfieldHolders(players, team);
  let sum = 0;
  for (const h of holders) sum += evaluateBoard(players, h.pos, params, h.id).total;
  return sum / holders.length;
};

const THRESHOLDS = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7];

console.log(`柔らかさ passSoftness = ${SOFTNESS}${SOFTNESS === 0 ? '（仕様どおりの硬いステップ）' : ''}\n`);
console.log(
  '閾値   | 自チーム(17形)                         | 相手(17形)                             | 判定',
);
console.log('-'.repeat(120));

for (const t of THRESHOLDS) {
  const homeScores: number[] = [];
  const awayScores: number[] = [];
  for (const f of FORMATIONS) {
    const players = [...buildLineup('home', f.id, 0), ...away];
    homeScores.push(score(players, 'home', t));
    awayScores.push(score(players, 'away', t));
  }

  const describe = (xs: number[]) => {
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    const zeros = xs.filter((x) => x === 0).length;
    const distinct = new Set(xs.map((x) => x.toFixed(3))).size;
    return { min, max, mean, sd, zeros, distinct };
  };

  const h = describe(homeScores);
  const a = describe(awayScores);

  // 使い物になる条件: 両側ともスコアが0に張り付かず、17形が十分に区別できている
  const usable =
    h.zeros <= 2 && a.zeros <= 2 && h.distinct >= 12 && a.distinct >= 12 ? 'OK' : '×';
  const why =
    a.zeros > 2
      ? `相手が${a.zeros}形で0（守備側の識別不能）`
      : h.zeros > 2
        ? `自チームが${h.zeros}形で0`
        : h.distinct < 12 || a.distinct < 12
          ? `同点が多い(自${h.distinct}/相${a.distinct}種)`
          : '';

  const fmt = (d: ReturnType<typeof describe>) =>
    `${d.min.toFixed(2)}〜${d.max.toFixed(2)} 平均${d.mean.toFixed(2)} SD${d.sd.toFixed(2)} 0が${String(d.zeros).padStart(2)}形`;

  console.log(`${t.toFixed(2)}   | ${fmt(h)} | ${fmt(a)} | ${usable} ${why}`);
}
