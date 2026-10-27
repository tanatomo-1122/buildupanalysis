/**
 * 前線＋攻撃的MFの列のポジション構成を列挙して数を数える
 *   npx tsx tools/proto-frontline.ts
 */
import { FORMATIONS } from '../src/data/formations';
import { C_MID_SPLIT, ROW_MID_ATT, allowedAt, zoneAt } from '../src/data/zones';

const base = FORMATIONS.filter((f) => f.shape === 'base');
const FLEX_X = C_MID_SPLIT; // 51m から前を「攻撃的な列」とみなす

let total = 0;
for (const f of base) {
  const flex = f.slots.filter(
    (sl) => sl.x >= FLEX_X && allowedAt({ x: sl.x, y: sl.y }, 'home').length > 1,
  );
  const choices = flex.map((sl) => allowedAt({ x: sl.x, y: sl.y }, 'home'));
  const combos = choices.reduce((a, c) => a * c.length, 1);
  total += combos;
  console.log(
    `${f.label.padEnd(9)} 可変${flex.length}枚 ${String(combos).padStart(3)}通り  ` +
      flex
        .map((sl, i) => `${sl.position}(${sl.x},${sl.y})@${zoneAt({ x: sl.x, y: sl.y }).id}→${choices[i].join('/')}`)
        .join('  '),
  );
}
console.log(`\n合計 ${total} 形`);

// 前線(x>=68)だけに絞ったら
let frontOnly = 0;
for (const f of base) {
  const flex = f.slots.filter(
    (sl) => sl.x >= ROW_MID_ATT && allowedAt({ x: sl.x, y: sl.y }, 'home').length > 1,
  );
  frontOnly += flex.reduce((a, sl) => a * allowedAt({ x: sl.x, y: sl.y }, 'home').length, 1);
}
console.log(`参考: 前線(x>=68)だけなら ${frontOnly} 形`);
