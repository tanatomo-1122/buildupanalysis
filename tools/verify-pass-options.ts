/**
 * パスコース探索型モデルの挙動確認
 *   npx tsx tools/verify-pass-options.ts
 *
 * 「横パス・バックパスが評価されるようになったか」「本数として読めるか」
 * 「探索が機能しているか」を、狙った場面を作って確かめる。
 */
import { DEFAULT_PARAMS, PASS_SOFTNESS, PASS_THRESHOLD } from '../src/constants';
import { DEFAULT_SKILLS } from '../src/data/skills';
import { evaluateBoard } from '../src/logic/evaluate';
import { opponentLineup, recommendFormations } from '../src/logic/recommend';
import type { Params, Player, PositionId, SquadPlayer, ValueModel } from '../src/types';

const FORMATIONS_COUNT = 17;

let failures = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? `  ${extra}` : ''}`);
};

const paramsFor = (valueModel: ValueModel): Params => ({
  ...DEFAULT_PARAMS,
  possessionTeam: 'home',
  valueModel,
});

const P = (
  id: string,
  team: 'home' | 'away',
  number: number,
  position: PositionId,
  x: number,
  y: number,
): Player => ({
  id,
  team,
  number,
  position,
  attackSkill: 'none',
  defenseSkill: 'none',
  pos: { x, y },
});

console.log(`閾値 ${PASS_THRESHOLD} / 柔らかさ ${PASS_SOFTNESS}\n`);

/* ── 1. 横パスとバックパスが評価されるか ───────────────────────── */
console.log('── 横パス・バックパスの扱い ──');
{
  // ボールは (40,34)。受け手を3人だけ置き、相手は遠くに固める。
  //   縦: (60,34) / 横: (40,54) / 後ろ: (25,34)
  const ball = { x: 40, y: 34 };
  const home: Player[] = [
    P('h1', 'home', 1, 'GK', 6, 34),
    P('h2', 'home', 2, 'CMF', 40, 34), // ホルダー
    P('h3', 'home', 3, 'OMF', 60, 34), // 縦パス
    P('h4', 'home', 4, 'LMF', 40, 54), // 横パス
    P('h5', 'home', 5, 'CB', 25, 34), // バックパス
  ];
  // 相手はコースに絡まない位置（右下の隅）にまとめる
  const away: Player[] = Array.from({ length: 5 }, (_, i) =>
    P(`a${i}`, 'away', 90 + i, 'CB', 100, 2 + i * 0.5),
  );
  const players = [...home, ...away];

  for (const model of ['progress', 'passOptions'] as ValueModel[]) {
    const ev = evaluateBoard(players, ball, paramsFor(model), 'h2');
    const v = (id: string) => ev.players.find((e) => e.playerId === id)!;
    console.log(
      `\n  ${model}\n` +
        `    縦パス(+20m)   value ${v('h3').value.toFixed(3)}  pc ${v('h3').pc.toFixed(3)}\n` +
        `    横パス( 0m)    value ${v('h4').value.toFixed(3)}  pc ${v('h4').pc.toFixed(3)}\n` +
        `    バックパス(-15m) value ${v('h5').value.toFixed(3)}  pc ${v('h5').pc.toFixed(3)}\n` +
        `    合計 ${ev.total.toFixed(3)}`,
    );

    if (model === 'progress') {
      // 同じくらい開通しているのに、縦との差が一桁つく＝横パスが実質評価されていない
      check(
        '  前進量モデルでは横パスが縦パスの1/5未満',
        v('h4').value < v('h3').value / 5,
        `横 ${v('h4').value.toFixed(2)} vs 縦 ${v('h3').value.toFixed(2)}（${(v('h3').value / v('h4').value).toFixed(1)}倍）`,
      );
      check('  前進量モデルではバックパスがマイナス', v('h5').value < 0, `${v('h5').value.toFixed(3)}`);
    } else {
      check('  パスコースモデルでは横パスが1点前後', v('h4').value > 0.8, `${v('h4').value.toFixed(3)}`);
      check('  パスコースモデルでもバックパスがプラス', v('h5').value > 0.5, `${v('h5').value.toFixed(3)}`);
      check(
        '  同じ開通なら縦 > 横 > 後ろ の順',
        v('h3').value > v('h4').value && v('h4').value > v('h5').value,
        `${v('h3').value.toFixed(3)} > ${v('h4').value.toFixed(3)} > ${v('h5').value.toFixed(3)}`,
      );
    }
  }
}

/* ── 2. コースを塞ぐと本数が減るか ──────────────────────────── */
console.log('\n── コースを塞いだときの反応 ──');
{
  const ball = { x: 40, y: 34 };
  const base: Player[] = [
    P('h1', 'home', 1, 'GK', 6, 34),
    P('h2', 'home', 2, 'CMF', 40, 34),
    P('h3', 'home', 3, 'OMF', 60, 34),
    P('h4', 'home', 4, 'LMF', 40, 54),
    P('h5', 'home', 5, 'CB', 25, 34),
  ];
  const far: Player[] = Array.from({ length: 4 }, (_, i) =>
    P(`a${i}`, 'away', 90 + i, 'CB', 100, 2 + i * 0.5),
  );
  /** 縦パスのコース上（50,34）付近に守備者を n 枚置いたときの価値 */
  const withBlockers = (n: number) => {
    const blockers = Array.from({ length: n }, (_, i) =>
      P(`ax${i}`, 'away', 99 - i, 'DMF', 50, 34 + (i - (n - 1) / 2) * 3),
    );
    const ev = evaluateBoard([...base, ...far, ...blockers], ball, paramsFor('passOptions'), 'h2');
    const e = ev.players.find((x) => x.playerId === 'h3')!;
    return { value: e.value, pc: e.pc, total: ev.total };
  };

  const r0 = withBlockers(0);
  console.log('  コース上の守備者の枚数と縦パスの価値');
  for (const n of [0, 1, 2, 3]) {
    const r = withBlockers(n);
    console.log(
      `    ${n}枚: pc ${r.pc.toFixed(3)}  value ${r.value.toFixed(3)}` +
        `  (開通時比 ${((r.value / r0.value) * 100).toFixed(0)}%)  合計 ${r.total.toFixed(2)}`,
    );
  }
  check('  1枚置くと価値が下がる', withBlockers(1).value < r0.value);
  check(
    '  2枚で囲むと明確に落ちる（半分以下）',
    withBlockers(2).value < r0.value * 0.5,
    `${((withBlockers(2).value / r0.value) * 100).toFixed(0)}%`,
  );
  check(
    '  合計本数も単調に減る',
    withBlockers(1).total < r0.total && withBlockers(2).total < withBlockers(1).total,
  );
}

/* ── 3. 提案エンジンとしての健全性 ──────────────────────────── */
console.log('\n── 提案エンジン ──');
{
  const ROSTER: PositionId[] = [
    'GK', 'GK',
    'CB', 'CB', 'CB', 'CB',
    'RSB', 'RSB', 'LSB', 'LSB',
    'DMF', 'DMF', 'CMF', 'CMF', 'CMF',
    'OMF', 'RMF', 'LMF',
    'RWG', 'LWG',
    'ST', 'CF', 'CF',
  ];
  const squad: SquadPlayer[] = ROSTER.map((pos, i) => ({
    id: `p${i}`,
    slotIndex: i,
    name: `選手${i + 1}`,
    position: pos,
    attackSkill: DEFAULT_SKILLS[pos].attack,
    defenseSkill: DEFAULT_SKILLS[pos].defense,
  }));

  const r = recommendFormations({
    squad,
    homeStyle: 'possession',
    opponentPlayers: opponentLineup('4-2-3-1', 8),
    opponentStyle: 'shortCounter',
    scene: 'possession',
    homeLine: 0,
    rankMode: 'balance',
    valueModel: 'passOptions',
  });

  const attacks = r.rows.map((x) => x.attack);
  const defenses = r.rows.map((x) => x.defense);
  console.log(
    `  推奨 ${r.best.label}  自 ${r.best.attack.toFixed(2)}本 / 相手 ${r.best.defense.toFixed(2)}本` +
      `  (${r.elapsedMs}ms / 評価 ${r.evaluations}回)`,
  );

  check('  スコアが0に張り付いていない（自チーム）', Math.min(...attacks) > 0.5);
  check('  スコアが0に張り付いていない（相手）', Math.min(...defenses) > 0.1);
  check(
    '  17形が区別できている（同点が少ない）',
    new Set(attacks.map((x) => x.toFixed(3))).size >= 15,
    `${new Set(attacks.map((x) => x.toFixed(3))).size}/17 種`,
  );
  check('  本数スケールとして妥当（0〜10本の範囲）', Math.max(...attacks) <= 10);
  check('  推奨11人が本職／適性あり', r.best.assignments.every((a) => a.positionFit >= 70));
  check(
    '  山登り法が動いている（初期割当より評価回数が多い）',
    r.evaluations > FORMATIONS_COUNT * 4,
    `${r.evaluations}回`,
  );
}

console.log(failures === 0 ? '\n✅ 全通過' : `\n❌ ${failures} 件失敗`);
process.exit(failures === 0 ? 0 : 1);
