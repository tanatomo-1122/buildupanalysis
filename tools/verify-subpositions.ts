/**
 * 適性ポジションの検証
 *   npx tsx tools/verify-subpositions.ts
 *
 * ・未登録の選手は従来どおりの推測で動くか（後方互換）
 * ・登録すると、その選手をそのポジションで使えるようになるか
 * ・登録済みなのにリストに無いポジションは「専門外」に落ちるか
 * ・提案の幅（組める形の数）が実際に広がるか
 */
import { DEFAULT_PARAMS } from '../src/constants';
import { playerFit, positionFit } from '../src/data/positions';
import { ALL_SKILLS, DEFAULT_SKILLS } from '../src/data/skills';
import { activeSkill, arrivalOf, isSkillActive } from '../src/logic/vectors';
import { recommendFormations, opponentLineup } from '../src/logic/recommend';
import type { PositionId, SquadPlayer } from '../src/types';

let failures = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? `  ${extra}` : ''}`);
};

/* ── 1. 適性の計算そのもの ─────────────────────────────── */
console.log('── 適性の計算 ──');
{
  const plain: SquadPlayer = {
    id: 'a', slotIndex: 0, name: 'A', position: 'CMF',
    subPositions: [], attackSkill: 'none', defenseSkill: 'none',
  };
  const registered: SquadPlayer = { ...plain, id: 'b', subPositions: ['DMF', 'OMF'] };

  check(
    '未登録の選手は従来の推測どおり',
    playerFit(plain, 'DMF') === positionFit('CMF', 'DMF') &&
      playerFit(plain, 'RWG') === positionFit('CMF', 'RWG'),
    `DMF ${playerFit(plain, 'DMF')} / RWG ${playerFit(plain, 'RWG')}`,
  );
  check('メインは 100', playerFit(registered, 'CMF') === 100);
  check(
    '登録した適性ポジションは 80 以上',
    playerFit(registered, 'DMF') >= 80 && playerFit(registered, 'OMF') >= 80,
    `DMF ${playerFit(registered, 'DMF')} / OMF ${playerFit(registered, 'OMF')}`,
  );
  check(
    '登録済みでリストに無いポジションは専門外（50未満）',
    playerFit(registered, 'RMF') < 50,
    `RMF ${playerFit(registered, 'RMF')}（未登録なら ${positionFit('CMF', 'RMF')}）`,
  );
  check(
    'GK とフィールドの取り違えは禁止のまま',
    playerFit(registered, 'GK') < 0 && playerFit({ position: 'GK', subPositions: ['CB'] }, 'CB') < 0,
  );
}

/* ── 1b. プレースタイルは「発揮されるポジション」でだけ効く ──────── */
console.log('\n── プレースタイルの発動 ──');
{
  const params = { ...DEFAULT_PARAMS, possessionTeam: 'home' as const };
  const lineBreaker = DEFAULT_SKILLS.CF.attack; // CF 専用のラインブレイカー
  const at = (position: PositionId) => ({
    id: 'x', team: 'home' as const, number: 9, position,
    attackSkill: lineBreaker, defenseSkill: 'none',
    pos: { x: 20, y: 34 },
  });

  check('適用ポジション一覧にあれば発動する', isSkillActive(at('CF'), params));
  check('一覧に無いポジションでは発動しない', !isSkillActive(at('CB'), params));

  // スタイル側の一覧が複数ポジションにまたがる場合、メイン/適性の別は関係ない
  const playmaker = ALL_SKILLS.find((s2) => s2.label === 'プレーメイカー')!;
  const withPlaymaker = (position: PositionId) => ({
    id: 'y', team: 'home' as const, number: 8, position,
    attackSkill: playmaker.id, defenseSkill: 'none',
    pos: { x: 40, y: 34 },
  });
  check(
    'プレーメイカーは一覧の全ポジションで発動する',
    playmaker.positions.every((pos) => isSkillActive(withPlaymaker(pos), params)),
    `適用: ${playmaker.positions.join(',')}`,
  );
  check(
    'メインCMFの選手を適性のDMFで使っても発動する',
    isSkillActive(withPlaymaker('DMF'), params) &&
      playerFit({ position: 'CMF', subPositions: ['DMF'] }, 'DMF') >= 80,
  );
  check(
    '発動しないときは「特性なし」として扱う',
    activeSkill(at('CB'), params).id === 'none' && activeSkill(at('CF'), params).id === lineBreaker,
  );

  // 到達領域（動き）にも差が出るか
  const ball = { x: 20, y: 34 };
  const asCF = arrivalOf(at('CF'), ball, params);
  const asCB = arrivalOf(at('CB'), ball, params);
  check(
    '発動の有無で到達領域が変わる',
    Math.hypot(asCF.x - asCB.x, asCF.y - asCB.y) > 0.5,
    `CF (${asCF.x.toFixed(1)}, ${asCF.y.toFixed(1)}) / CB (${asCB.x.toFixed(1)}, ${asCB.y.toFixed(1)})`,
  );
}

/* ── 2. 提案が広がるか ─────────────────────────────────── */
console.log('\n── 提案の幅 ──');

/** CB を1枚しか持たない、偏ったスカッド */
const ROSTER: PositionId[] = [
  'GK', 'GK',
  'CB',
  'RSB', 'RSB', 'LSB', 'LSB',
  'DMF', 'DMF', 'CMF', 'CMF', 'CMF', 'CMF',
  'OMF', 'OMF', 'RMF', 'LMF',
  'RWG', 'LWG',
  'ST', 'ST', 'CF', 'CF',
];

const make = (subs: (pos: PositionId, i: number) => PositionId[]): SquadPlayer[] =>
  ROSTER.map((position, i) => ({
    id: `p${i}`,
    slotIndex: i,
    name: `選手${i + 1}`,
    position,
    subPositions: subs(position, i),
    attackSkill: DEFAULT_SKILLS[position].attack,
    defenseSkill: DEFAULT_SKILLS[position].defense,
  }));

const base = {
  homeStyle: 'possession',
  opponentPlayers: opponentLineup('4-2-3-1', 8),
  opponentStyle: 'shortCounter',
  scene: 'possession' as const,
  homeLine: 0,
  rankMode: 'balance' as const,
};

/**
 * 「無理なく組める形」の数で広さを測る。
 *
 * 平均適性だと1人だけ専門外でも 94 点になって閾値を超えてしまうので、
 * **11人全員が本職か登録済みの適性ポジション（fit 70以上）**を条件にする。
 */
const OK_FIT = 70;

const run = (squad: SquadPlayer[], label: string) => {
  const t0 = Date.now();
  const r = recommendFormations({ ...base, squad });
  /** その名前を全員 70 以上で組めるか */
  const ok = new Map<string, boolean>();
  for (const x of r.rows) {
    const all = x.assignments.every((a) => a.positionFit >= OK_FIT);
    ok.set(x.familyLabel, (ok.get(x.familyLabel) ?? false) || all);
  }
  const mannable = [...ok.values()].filter(Boolean).length;
  const offMain = r.best.assignments.filter((a) => a.positionFit < 100).length;
  console.log(
    `  ${label.padEnd(22)} ${Date.now() - t0}ms  ` +
      `全員が本職/適性で組める名前 ${String(mannable).padStart(2)}/${ok.size}  ` +
      `推奨 ${r.best.familyLabel.padEnd(8)} 本職外${offMain}人`,
  );
  return { r, mannable, names: ok };
};

// (a) 未登録（従来どおり）
const a = run(make(() => []), '未登録');
// (b) 狭く登録（メインしかできない）
const b = run(make(() => ['none' as PositionId].filter(() => false)), '未登録(同じはず)');
// (c) 広く登録（CMF が DMF/OMF もできる等）
const WIDE: Partial<Record<PositionId, PositionId[]>> = {
  CMF: ['DMF', 'OMF', 'RMF', 'LMF'],
  DMF: ['CMF', 'CB'],
  OMF: ['CMF', 'ST', 'RWG', 'LWG'],
  RSB: ['CB', 'RMF', 'RWG'],
  LSB: ['CB', 'LMF', 'LWG'],
  RMF: ['RWG', 'CMF', 'RSB'],
  LMF: ['LWG', 'CMF', 'LSB'],
  RWG: ['RMF', 'ST', 'OMF'],
  LWG: ['LMF', 'ST', 'OMF'],
  ST: ['CF', 'OMF', 'RWG', 'LWG'],
  CF: ['ST', 'OMF'],
  CB: ['DMF', 'RSB', 'LSB'],
};
const c = run(make((pos) => WIDE[pos] ?? []), '広く登録');
// (d) 極端に狭く登録（メイン以外は一切できない）
const d = run(make((pos) => (pos === 'GK' ? [] : [pos])), 'メインのみ登録');

check('未登録どうしは同じ結果', a.r.best.formationId === b.r.best.formationId);
check(
  '広く登録すると無理なく組める形が増える',
  c.mannable > d.mannable,
  `メインのみ ${d.mannable} → 広く登録 ${c.mannable}`,
);
check(
  'メインのみ登録だと無理なく組める形が減る',
  d.mannable < a.mannable,
  `未登録 ${a.mannable} → メインのみ ${d.mannable}`,
);
/*
 * 「推奨そのものが変わる」は必ずしも成り立たない。
 * スカッドに本職が揃っている形が最良なら、適性ポジションを足しても1位は動かない。
 * 適性ポジションの値打ちは **選べる形が増えること** なので、そこを見る。
 */
const onlyWide = [...c.names.entries()]
  .filter(([n, good]) => good && !d.names.get(n))
  .map(([n]) => n);
check(
  '広く登録してはじめて組める形がある',
  onlyWide.length > 0,
  `${onlyWide.length}種（例 ${onlyWide.slice(0, 4).join(' / ')}）`,
);
const backThree = (res: typeof c) =>
  [...res.names.entries()].filter(([n, good]) => Number(n.split('-')[0]) >= 3 && good).length;
check(
  'CB1枚でも広く登録すれば3バック以上を無理なく組める',
  backThree(c) > backThree(d),
  `メインのみ ${backThree(d)} → 広く登録 ${backThree(c)}`,
);

console.log(failures === 0 ? '\n✅ 全通過' : `\n❌ ${failures} 件失敗`);
process.exit(failures === 0 ? 0 : 1);
