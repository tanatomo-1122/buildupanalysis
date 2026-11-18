import { useEffect, useMemo, useState } from 'react';
import { countKey, formationById, formationByPositions } from '../data/formations';
import { UNITS, formationName } from '../data/generate';
import type { PositionId } from '../types';

/**
 * フォーメーションを「人数」で入れる（相手の形にも、自分の形にも使う）。
 *
 *   - よくある形はプリセット1タップ
 *   - それ以外はユニット（DF / MF / FW）ごとに、中央のポジションは＋−、サイドはオン／オフ
 *   - 上限（スプレッドシートの人数制限）に当たるボタンは押せなくなる
 *   - 名前（4-2-3-1 など）は入れた人数からその場で出す
 *
 * 人数の組み合わせはカタログ（generateFormations）と1対1に対応するので、
 * 10人そろってカタログに見つかった時点で onChange にその形の ID を渡す。
 */

type Counts = Record<PositionId, number>;

const OUTFIELD: PositionId[] = ['CB', 'LSB', 'RSB', 'DMF', 'CMF', 'LMF', 'RMF', 'OMF', 'LWG', 'RWG', 'ST', 'CF'];

const zero = (): Counts =>
  Object.fromEntries([...OUTFIELD, 'GK'].map((p) => [p, 0])) as Counts;

const countsOf = (positions: PositionId[]): Counts => {
  const c = zero();
  for (const p of positions) if (p !== 'GK') c[p] += 1;
  return c;
};

const positionsOf = (c: Counts) => OUTFIELD.flatMap((p) => Array<PositionId>(c[p]).fill(p));
const keyOf = (c: Counts) => countKey(positionsOf(c));

/** 人数の組み合わせ → カタログの形の ID */
const idOf = (c: Counts) => formationByPositions(positionsOf(c))?.id;

const PRESET_DEFS: Record<string, Partial<Counts>> = {
  '4-2-3-1': { CB: 2, LSB: 1, RSB: 1, DMF: 2, OMF: 1, LMF: 1, RMF: 1, ST: 1 },
  '4-3-3': { CB: 2, LSB: 1, RSB: 1, DMF: 1, CMF: 2, LWG: 1, RWG: 1, ST: 1 },
  '4-4-2': { CB: 2, LSB: 1, RSB: 1, CMF: 2, LMF: 1, RMF: 1, ST: 2 },
  '4-1-2-3': { CB: 2, LSB: 1, RSB: 1, DMF: 1, OMF: 2, LWG: 1, RWG: 1, CF: 1 },
  '3-4-3': { CB: 3, CMF: 2, LMF: 1, RMF: 1, LWG: 1, RWG: 1, ST: 1 },
  '3-2-4-1': { CB: 3, DMF: 2, OMF: 2, LMF: 1, RMF: 1, ST: 1 },
  '5-3-2': { CB: 3, LSB: 1, RSB: 1, DMF: 1, CMF: 2, ST: 2 },
  '4-3-1-2': { CB: 2, LSB: 1, RSB: 1, DMF: 1, CMF: 2, OMF: 1, ST: 2 },
};

/** カタログに実在するものだけをプリセットとして出す */
export const PRESETS = Object.entries(PRESET_DEFS)
  .map(([label, def]) => {
    const c = { ...zero(), ...def } as Counts;
    return { label, counts: c, id: idOf(c) };
  })
  .filter((p): p is { label: string; counts: Counts; id: string } => Boolean(p.id));

const LIMIT = new Map<PositionId, number>();
for (const u of UNITS) for (const l of u.limits) LIMIT.set(l.position, l.max);
const unitOf = (p: PositionId) => UNITS.find((u) => u.limits.some((l) => l.position === p))!;
const unitSum = (c: Counts, u: (typeof UNITS)[number]) => u.limits.reduce((s, l) => s + c[l.position], 0);
const total = (c: Counts) => OUTFIELD.reduce((s, p) => s + c[p], 0);

/** 1人足せるか（10人・ポジション上限・ユニット上限のどれにも当たらない） */
const canAdd = (c: Counts, p: PositionId) =>
  total(c) < 10 && c[p] < (LIMIT.get(p) ?? 0) && unitSum(c, unitOf(p)) < unitOf(p).total[1];

/** 画面の並び。上から FW / MF / DF（ピッチの向きと同じ） */
const ROWS: { unit: 'att' | 'mid' | 'def'; label: string; left: PositionId; center: PositionId[]; right: PositionId }[] = [
  { unit: 'att', label: 'FW', left: 'LWG', center: ['CF', 'ST'], right: 'RWG' },
  { unit: 'mid', label: 'MF', left: 'LMF', center: ['OMF', 'CMF', 'DMF'], right: 'RMF' },
  { unit: 'def', label: 'DF', left: 'LSB', center: ['CB'], right: 'RSB' },
];

interface Props {
  /** いま選ばれている形の ID。positions を渡すときは省略できる */
  value?: string;
  /**
   * いまの11人のポジション。盤面でドラッグして形が変わる場合はこちらを渡す
   * （カタログに無い人数配分になっていても、そのまま人数として表示する）。
   */
  positions?: PositionId[];
  onChange: (formationId: string) => void;
  /** 見出し（既定は「相手の形」） */
  label?: string;
  /** 狭い場所用。名前を小さめに出す */
  compact?: boolean;
  testId?: string;
}

export default function FormationPicker({
  value,
  positions: livePositions,
  onChange,
  label = '相手の形',
  compact = false,
  testId = 'opponent-picker',
}: Props) {
  const sourceKey = livePositions ? countKey(livePositions) : value ?? '';
  const fromValue = useMemo(
    () =>
      countsOf(livePositions ?? (value ? formationById(value).slots.map((s) => s.position) : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceKey],
  );
  const [counts, setCounts] = useState<Counts>(fromValue);

  // 外から形が変わったとき（プリセットに戻す・盤面で動かす等）は人数も合わせる
  useEffect(() => {
    if (keyOf(counts) !== keyOf(fromValue)) setCounts(fromValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromValue]);

  const apply = (next: Counts) => {
    setCounts(next);
    const id = idOf(next);
    if (id && keyOf(next) !== keyOf(fromValue)) onChange(id);
  };

  const positions = positionsOf(counts);
  const n = total(counts);
  const matched = n === 10 ? idOf(counts) : undefined;
  const unitError = n === 10 && !matched
    ? UNITS.map((u) => ({ u, s: unitSum(counts, u) })).find(({ u, s }) => s < u.total[0] || s > u.total[1])
    : undefined;
  const status = matched
    ? { tone: 'ok' as const, text: '10人 OK' }
    : n < 10
      ? { tone: 'wait' as const, text: `あと${10 - n}人` }
      : { tone: 'err' as const, text: unitError ? `${unitError.u.label}は${unitError.u.total[0]}〜${unitError.u.total[1]}人` : 'この組み合わせは組めません' };
  const name = positions.length ? formationName(positions) : '—';
  const activePreset = PRESETS.find((p) => p.id === matched)?.label;

  const step = (p: PositionId, d: 1 | -1) => apply({ ...counts, [p]: Math.max(0, counts[p] + d) });
  const toggle = (p: PositionId) => apply({ ...counts, [p]: counts[p] ? 0 : 1 });

  return (
    <div className="space-y-4" data-testid={testId}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
          <div
            className={`${compact ? 'numeral-solid text-[44px] text-team' : 'numeral text-[64px] sm:text-[80px]'} ${matched ? '' : 'opacity-40'}`}
            data-testid={`${testId}-name`}
          >
            {name}
          </div>
          <div className="mt-1 text-[12px] text-slate-400">
            {matched ? formationById(matched).typeLabel : '人数をそろえると形が決まります'}
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[12px] font-bold ${
            status.tone === 'ok'
              ? 'bg-team text-team-ink'
              : status.tone === 'err'
                ? 'bg-[#ff3b5c] text-white'
                : 'bg-panel2 text-slate-300'
          }`}
          role="status"
        >
          {status.text}
        </span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="よく使う形">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => apply({ ...p.counts })}
            aria-pressed={activePreset === p.label}
            className={`shrink-0 rounded-lg border px-3 py-1.5 font-mono text-[12px] font-bold transition-colors ${
              activePreset === p.label
                ? 'border-team bg-team text-team-ink'
                : 'border-edge bg-panel2 text-slate-200 hover:border-team/60'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => apply(zero())}
          className="shrink-0 rounded-lg border border-edge px-3 py-1.5 text-[12px] text-slate-400 hover:text-slate-200"
        >
          クリア
        </button>
      </div>

      <div className="space-y-2">
        {ROWS.map((row) => {
          const u = UNITS.find((x) => x.id === row.unit)!;
          const s = unitSum(counts, u);
          return (
            <div
              key={row.unit}
              className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2 rounded-xl border border-edge bg-panel2 p-2"
            >
              <div>
                <div className="numeral-solid text-[22px] text-slate-100">{row.label}</div>
                <div className="font-mono text-[10px] text-slate-500">
                  {s}/{u.total[0]}-{u.total[1]}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <SideToggle pos={row.left} on={counts[row.left] > 0} disabled={!counts[row.left] && !canAdd(counts, row.left)} onClick={() => toggle(row.left)} />
                {row.center.map((p) => (
                  <Stepper
                    key={p}
                    pos={p}
                    value={counts[p]}
                    canInc={canAdd(counts, p)}
                    onDec={() => step(p, -1)}
                    onInc={() => step(p, 1)}
                  />
                ))}
                <SideToggle pos={row.right} on={counts[row.right] > 0} disabled={!counts[row.right] && !canAdd(counts, row.right)} onClick={() => toggle(row.right)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SideToggle({
  pos,
  on,
  disabled,
  onClick,
}: {
  pos: PositionId;
  on: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      data-pos={pos}
      className={`min-w-[52px] rounded-lg border px-2 py-2 font-mono text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        on ? 'border-team bg-team text-team-ink' : 'border-edge text-slate-400 hover:border-team/60'
      }`}
    >
      {pos}
    </button>
  );
}

function Stepper({
  pos,
  value,
  canInc,
  onDec,
  onInc,
}: {
  pos: PositionId;
  value: number;
  canInc: boolean;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className={`flex items-center overflow-hidden rounded-lg border ${value ? 'border-team/70' : 'border-edge'}`} data-pos={pos}>
      <span className="px-2 font-mono text-[11px] font-bold text-slate-400">{pos}</span>
      <button
        type="button"
        aria-label={`${pos}を減らす`}
        disabled={value === 0}
        onClick={onDec}
        className="h-9 w-8 text-[16px] text-slate-200 hover:bg-[#2b2636] disabled:opacity-25"
      >
        −
      </button>
      <output className={`w-5 text-center font-mono text-[14px] font-bold tabular-nums ${value ? 'text-team' : 'text-slate-500'}`}>
        {value}
      </output>
      <button
        type="button"
        aria-label={`${pos}を増やす`}
        disabled={!canInc}
        onClick={onInc}
        className="h-9 w-8 text-[16px] text-slate-200 hover:bg-[#2b2636] disabled:opacity-25"
      >
        +
      </button>
    </div>
  );
}
