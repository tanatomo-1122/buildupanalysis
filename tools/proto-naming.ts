/**
 * eFootball の命名規則を「列ごとの人数」として確定させる
 *   npx tsx tools/proto-naming.ts
 *
 * ユーザー情報: 名前は GK を除く選手を列ごとに数えたもの。
 *
 * ポジション名だけでは列は決まらない（OMF は 4-1-3-2 では RMF/LMF と同じ列、
 * 3-3-1-3 では独立した列）。そこで **登録名と x の並び順から列を復元**し、
 * スロットに列番号として持たせる。以後は列番号を数えるだけで名前が出る。
 */
import { FORMATION_FAMILIES } from '../src/data/formations';
import type { Formation, FormationSlot } from '../src/data/formations';

/** 登録名の数字どおりに、x の小さい順で切り分ける */
const assignLines = (f: Formation): { slot: FormationSlot; line: number }[] => {
  const digits = f.label.split('-').map(Number);
  const outfield = [...f.slots.filter((s) => s.position !== 'GK')].sort((a, b) => a.x - b.x);
  const out: { slot: FormationSlot; line: number }[] = [];
  let i = 0;
  digits.forEach((n, li) => {
    for (let k = 0; k < n; k++) out.push({ slot: outfield[i++], line: li + 1 });
  });
  return out;
};

/** 列番号から名前を作る */
const nameFromLines = (rows: { line: number }[]): string => {
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.line, (counts.get(r.line) ?? 0) + 1);
  return [...counts.keys()].sort((a, b) => a - b).map((k) => counts.get(k)).join('-');
};

let ok = 0;
let overlap = 0;
for (const f of FORMATION_FAMILIES) {
  const rows = assignLines(f);
  const derived = nameFromLines(rows);
  const match = derived === f.label;
  if (match) ok++;

  // 列の境目で x が逆転していないか（＝切り方に無理がないか）
  const byLine = new Map<number, number[]>();
  for (const r of rows) byLine.set(r.line, [...(byLine.get(r.line) ?? []), r.slot.x]);
  const lines = [...byLine.entries()].sort((a, b) => a[0] - b[0]);
  const gaps = lines.slice(1).map(([, xs], i) => Math.min(...xs) - Math.max(...lines[i][1]));
  const bad = gaps.some((g) => g <= 0);
  if (bad) overlap++;

  console.log(
    `${match ? '✅' : '❌'} ${f.label.padEnd(9)} ` +
      lines.map(([l, xs]) => `L${l}:${xs.length}人(x ${Math.min(...xs)}〜${Math.max(...xs)})`).join(' ') +
      (bad ? '   ⚠ 列の境目で x が重なっている' : ''),
  );
}
console.log(`\n名前の一致 ${ok} / ${FORMATION_FAMILIES.length}   列が x で分離していない形 ${overlap}`);
