/**
 * メインポジションと適性ポジションが対等に扱われているかを測る
 *   npx tsx tools/check-main-bias.ts
 *
 * 他の条件を揃えた「メイン持ち」と「適性持ち」を同じ枠で競わせて、
 * どちらが選ばれるか・減点がどれだけ違うかを見る。
 */
import { playerFit } from '../src/data/positions';
import { DEFAULT_SKILLS } from '../src/data/skills';
import { fitScore, opponentLineup, recommendFormations } from '../src/logic/recommend';
import type { PositionId, SquadPlayer } from '../src/types';

const mk = (
  id: string,
  name: string,
  position: PositionId,
  subPositions: PositionId[],
  skillFrom: PositionId = position,
): SquadPlayer => ({
  id,
  slotIndex: Number(id.replace(/\D/g, '')),
  name,
  position,
  subPositions,
  attackSkill: DEFAULT_SKILLS[skillFrom].attack,
  defenseSkill: DEFAULT_SKILLS[skillFrom].defense,
});

console.log('── 適性値そのもの ──');
const mainDMF = mk('p0', 'メインDMF', 'DMF', ['CMF']);
const subDMF = mk('p1', '適性DMF', 'CMF', ['DMF']);
console.log(`  DMF 枠での適性値   メイン持ち ${playerFit(mainDMF, 'DMF')} / 適性持ち ${playerFit(subDMF, 'DMF')}`);
console.log(`  CMF 枠での適性値   メイン持ち ${playerFit(subDMF, 'CMF')} / 適性持ち ${playerFit(mainDMF, 'CMF')}`);

console.log('\n── 選考スコア（プレースタイルの噛み合いも込み） ──');
// プレースタイルの差を消すため、両者とも DMF 用のスタイルを持たせる
const mainDMF2 = mk('p0', 'メインDMF', 'DMF', ['CMF'], 'DMF');
const subDMF2 = mk('p1', '適性DMF', 'CMF', ['DMF'], 'DMF');
console.log(`  DMF 枠  メイン持ち ${fitScore('DMF', mainDMF2)} / 適性持ち ${fitScore('DMF', subDMF2)}`);

console.log('\n── 減点の差（目的関数に入る分） ──');
for (const w of [8, 0.5]) {
  const pen = (f: number) => (w * (100 - Math.min(100, f))) / 100;
  console.log(
    `  重み ${w}:  メイン ${pen(playerFit(mainDMF, 'DMF')).toFixed(2)} / ` +
      `適性 ${pen(playerFit(subDMF, 'DMF')).toFixed(2)}`,
  );
}

/* ── 実際の提案で、適性ポジション枠がどれだけ使われるか ────────── */
console.log('\n── 提案での使われ方 ──');

/**
 * 11ポジションを「メインで持つ選手」と「適性で持つ選手」を1人ずつ用意する。
 * 対等なら、どちらが選ばれるかは五分に近いはず。
 */
const PAIRS: [PositionId, PositionId][] = [
  ['CB', 'RSB'], ['RSB', 'CB'], ['LSB', 'CB'],
  ['DMF', 'CMF'], ['CMF', 'DMF'], ['OMF', 'CMF'],
  ['RMF', 'RWG'], ['LMF', 'LWG'], ['RWG', 'RMF'],
  ['ST', 'CF'], ['CF', 'ST'],
];

const squad: SquadPlayer[] = [mk('p0', 'GK1', 'GK', []), mk('p1', 'GK2', 'GK', [])];
let n = 2;
for (const [a, b] of PAIRS) {
  // a をメインに持つ選手と、a を適性に持つ選手（メインは b）
  squad.push(mk(`p${n++}`, `${a}本職`, a, [b], a));
  squad.push(mk(`p${n++}`, `${a}適性`, b, [a], a)); // スタイルは a 用に揃える
}

const r = recommendFormations({
  squad,
  homeStyle: 'possession',
  opponentPlayers: opponentLineup('4-2-3-1', 8),
  opponentStyle: 'shortCounter',
  scene: 'possession',
  homeLine: 0,
  rankMode: 'balance',
});

const picked = r.best.assignments.filter((x) => x.slot.position !== 'GK');
const byMain = picked.filter((x) => x.player.position === x.slot.position).length;
const bySub = picked.filter(
  (x) => x.player.position !== x.slot.position && x.player.subPositions.includes(x.slot.position),
).length;
const other = picked.length - byMain - bySub;

console.log(`  推奨 ${r.best.familyLabel}（${r.best.typeLabel}）`);
console.log(`  起用の内訳: 本職で起用 ${byMain}人 / 適性ポジションで起用 ${bySub}人 / その他 ${other}人`);
console.log(`  平均適性 ${r.best.fitAverage.toFixed(1)}`);
console.log(
  byMain > bySub * 3
    ? '  → メインに強く偏っている'
    : '  → おおむね対等',
);
