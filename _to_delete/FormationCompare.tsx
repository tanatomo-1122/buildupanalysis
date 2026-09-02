import { useMemo, useState } from 'react';
import { styleById } from '../data/styles';
import { attackBallIsPlausible, compareFormations } from '../logic/compare';
import type { FormationScore } from '../logic/compare';
import type { BoardState } from '../types';

/**
 * 自チームのフォーメーション総当たり比較。
 *
 * 2つの指標は意味もスケールも別物なので、1枚のグラフに重ねず横並びの
 * 2カラム（スモールマルチプル）にしている。棒はどちらも単色で、色は
 * 「どちらの指標か」だけを表す。順位で色を変えることはしない。
 */

const ATTACK_COLOR = '#0284c7'; // 自チームの前進
const DEFENSE_COLOR = '#e11d48'; // 相手に許した前進

type SortKey = 'attack' | 'defense' | 'name';

/**
 * 「最下位との差」を描く横棒。
 *
 * 絶対値は行の数値で読めるうえ、守備側は値域が狭く（例：-88〜-102）ゼロ基準では
 * 差が潰れて読めない。そこで棒は最下位を 0 とした相対量にし、
 * 両カラムとも「長いほど良い選択」に向きを揃えている。
 */
function Bar({ amount, max, color }: { amount: number; max: number; color: string }) {
  const width = max <= 0 ? 0 : (amount / max) * 100;
  return (
    <div className="relative h-2 w-full rounded-full bg-edge/70">
      <div
        className="absolute left-0 top-0 h-2"
        style={{
          width: `${Math.max(width, 0.8)}%`,
          background: color,
          borderRadius: '1px 4px 4px 1px',
        }}
      />
    </div>
  );
}

function StatTile({
  caption,
  formation,
  value,
  color,
  note,
}: {
  caption: string;
  formation: string;
  value: number;
  color: string;
  note: string;
}) {
  return (
    <div className="rounded-md border border-edge bg-panel/50 p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{caption}</span>
      </div>
      <div className="mt-1 font-mono text-[15px] font-bold text-slate-100">{formation}</div>
      <div className="font-mono text-[12px] tabular-nums text-slate-400">
        {value >= 0 ? '+' : ''}
        {value.toFixed(1)}
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-slate-500">{note}</div>
    </div>
  );
}

interface Props {
  board: BoardState;
  onApply: (formationId: string) => void;
}

export default function FormationCompare({ board, onApply }: Props) {
  const [sort, setSort] = useState<SortKey>('attack');
  const result = useMemo(() => compareFormations(board), [board]);
  const plausible = useMemo(() => attackBallIsPlausible(board), [board]);

  // 棒は「最下位との差」。攻撃は最小値が最下位、守備は最大値（＝最も許す）が最下位。
  const attackFloor = Math.min(...result.rows.map((r) => r.attack));
  const defenseFloor = Math.max(...result.rows.map((r) => r.defense));
  const attackSpan = Math.max(...result.rows.map((r) => r.attack - attackFloor));
  const defenseSpan = Math.max(...result.rows.map((r) => defenseFloor - r.defense));

  const rows: FormationScore[] = [...result.rows].sort((a, b) => {
    if (sort === 'attack') return b.attack - a.attack;
    if (sort === 'defense') return a.defense - b.defense;
    return a.label.localeCompare(b.label);
  });

  const bestAttack = result.rows.find((r) => r.attackRank === 1)!;
  const worstAttack = result.rows.find((r) => r.attackRank === result.rows.length)!;
  const bestDefense = result.rows.find((r) => r.defenseRank === 1)!;
  const worstDefense = result.rows.find((r) => r.defenseRank === result.rows.length)!;

  return (
    <section className="rounded-lg border border-edge bg-panel2/60">
      <div className="border-b border-edge px-3 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          フォーメーション比較
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          チームスタイル・選手特性・相手チーム（{result.opponentFormation} ／{' '}
          {styleById(board.params.awayStyle).label}）を固定したまま、自チームの
          {result.rows.length}フォーメーションを総当たりで入れ替えた結果です。
          特性は背番号で引き継がれるため、比較のあいだ一切変化しません。
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          <b className="text-slate-300">自チームの前進</b>は大きいほど良く、
          <b className="text-slate-300">相手に許した前進</b>は小さいほど守備が固いという意味です。
          棒はどちらも「最下位との差」を描いているので、
          <b className="text-slate-300">長いほど良い選択</b>と読めます。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
        <StatTile
          caption="攻撃 ベスト"
          formation={bestAttack.label}
          value={bestAttack.attack}
          color={ATTACK_COLOR}
          note="最も前進できる形"
        />
        <StatTile
          caption="攻撃 ワースト"
          formation={worstAttack.label}
          value={worstAttack.attack}
          color={ATTACK_COLOR}
          note="最も前進できない形"
        />
        <StatTile
          caption="守備 ベスト"
          formation={bestDefense.label}
          value={bestDefense.defense}
          color={DEFENSE_COLOR}
          note="最も前進を許さない形"
        />
        <StatTile
          caption="守備 ワースト"
          formation={worstDefense.label}
          value={worstDefense.defense}
          color={DEFENSE_COLOR}
          note="最も前進を許す形"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 pb-2 text-[11px] text-slate-500">
        <span>並び順</span>
        {(
          [
            ['attack', '攻撃が良い順'],
            ['defense', '守備が固い順'],
            ['name', '名前順'],
          ] as [SortKey, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setSort(k)}
            className={`rounded border px-2 py-1 transition-colors ${
              sort === k
                ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                : 'border-edge bg-panel2 text-slate-400 hover:bg-[#243040]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!plausible && (
        <p className="mx-3 mb-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] leading-snug text-amber-200">
          攻撃側の比較は現在のボール位置で計算しています。いまボールは相手選手のほうが近いため、
          攻撃カラムの数値は参考程度に見てください。
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[12px]">
          <thead className="text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">フォーメーション</th>
              <th className="px-2 py-1.5 text-right font-medium">
                <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: ATTACK_COLOR }} />
                自チームの前進
              </th>
              <th className="w-[24%] px-2 py-1.5"></th>
              <th className="px-2 py-1.5 text-right font-medium">
                <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: DEFENSE_COLOR }} />
                相手に許した前進
              </th>
              <th className="w-[24%] px-2 py-1.5"></th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const current = r.formationId === board.homeFormation;
              return (
                <tr
                  key={r.formationId}
                  title={`${r.label} — ${r.desc}`}
                  className={`border-t border-edge/60 ${current ? 'bg-sky-500/10' : ''}`}
                >
                  <td className="px-2 py-1.5">
                    <span className="font-mono font-semibold text-slate-200">{r.label}</span>
                    {current && (
                      <span className="ml-1.5 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-200">
                        現在
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-slate-300">
                    <span className="mr-1.5 text-[10px] text-slate-600">{r.attackRank}位</span>
                    {r.attack >= 0 ? '+' : ''}
                    {r.attack.toFixed(1)}
                  </td>
                  <td className="px-2 py-1.5">
                    <Bar
                      amount={r.attack - attackFloor}
                      max={attackSpan}
                      color={ATTACK_COLOR}
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-slate-300">
                    <span className="mr-1.5 text-[10px] text-slate-600">{r.defenseRank}位</span>
                    {r.defense >= 0 ? '+' : ''}
                    {r.defense.toFixed(1)}
                  </td>
                  <td className="px-2 py-1.5">
                    <Bar
                      amount={defenseFloor - r.defense}
                      max={defenseSpan}
                      color={DEFENSE_COLOR}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      disabled={current}
                      onClick={() => onApply(r.formationId)}
                      className="rounded border border-edge bg-panel2 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-[#243040] disabled:opacity-30"
                    >
                      適用
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-edge px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        {result.averaged ? (
          <>
            <b className="text-slate-300">起点平均モード</b>で算出しています。どちらのカラムも
            保持側の GK 以外の全員を順に起点にした平均なので、ボールをどこに置いてあるかに
            一切依存しません。
          </>
        ) : (
          <>
            攻撃の比較は現在のボール位置（x {result.attackBall.x.toFixed(0)}, y{' '}
            {result.attackBall.y.toFixed(0)}）、守備の比較は相手の最寄り選手の足元（x{' '}
            {result.defenseBall.x.toFixed(0)}, y {result.defenseBall.y.toFixed(0)}）にボールを置いて
            算出しています。相手チームは固定なので、守備側の起点も全フォーメーションで共通です。
          </>
        )}
      </p>
    </section>
  );
}
