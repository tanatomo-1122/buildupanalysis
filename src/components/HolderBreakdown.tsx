import type { HolderAverage } from '../logic/holderAverage';
import type { TeamId, Vec2 } from '../types';

/**
 * 起点別の内訳。
 *
 * 値は 0 をまたぎうる（前向きの選択肢が無い起点はマイナスになる）ので、
 * ゼロ基準の発散棒で描く。正負で色を分け、平均位置に参照線を引く。
 */

const POSITIVE = '#0284c7';
const NEGATIVE = '#e11d48';

const fmt = (n: number, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);

interface Props {
  average: HolderAverage;
  team: TeamId;
  active: boolean;
  currentBall: Vec2;
  onFocus: (ball: Vec2) => void;
}

export default function HolderBreakdown({ average, team, active, currentBall, onFocus }: Props) {
  if (average.entries.length === 0) return null;

  const values = average.entries.map((e) => e.total);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;
  const zero = pct(0);
  const rows = [...average.entries].sort((a, b) => b.total - a.total);

  return (
    <section className="rounded-lg border border-edge bg-panel2/60">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-edge px-3 py-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            起点別の内訳
          </h2>
          <p className="text-[11px] text-slate-500">
            {team === 'home' ? '自チーム' : '相手チーム'}の GK 以外 {average.count} 人が
            それぞれボールを持った場合。{active ? 'この平均がメインスコアです。' : '現在はメインスコアに使われていません。'}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">平均</div>
          <div
            className="font-mono text-2xl font-bold tabular-nums"
            style={{ color: average.mean >= 0 ? '#7dd3fc' : '#fda4af' }}
          >
            {fmt(average.mean)}
          </div>
        </div>
      </div>

      {average.best && average.worst && (
        <div className="grid grid-cols-2 gap-2 px-3 pt-3">
          <div className="rounded-md border border-edge bg-panel/50 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">最も前進できる起点</div>
            <div className="mt-0.5 font-mono text-[14px] font-bold text-slate-100">
              #{average.best.number} {average.best.position}
            </div>
            <div className="font-mono text-[12px] tabular-nums text-slate-400">
              {fmt(average.best.total)}
            </div>
          </div>
          <div className="rounded-md border border-edge bg-panel/50 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">最も詰まる起点</div>
            <div className="mt-0.5 font-mono text-[14px] font-bold text-slate-100">
              #{average.worst.number} {average.worst.position}
            </div>
            <div className="font-mono text-[12px] tabular-nums text-slate-400">
              {fmt(average.worst.total)}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto p-3">
        <table className="w-full min-w-[460px] text-[12px]">
          <thead className="text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">起点</th>
              <th className="px-2 py-1.5 text-right font-medium">期待前進値</th>
              <th className="w-[48%] px-2 py-1.5"></th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const here =
                Math.abs(e.ball.x - currentBall.x) < 0.01 &&
                Math.abs(e.ball.y - currentBall.y) < 0.01;
              const positive = e.total >= 0;
              const left = Math.min(zero, pct(e.total));
              const width = Math.abs(pct(e.total) - zero);
              return (
                <tr key={e.playerId} className={`border-t border-edge/60 ${here ? 'bg-sky-500/10' : ''}`}>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <span className="font-mono font-semibold text-slate-200">#{e.number}</span>
                    <span className="ml-1.5 font-mono text-slate-400">{e.position}</span>
                    {here && (
                      <span className="ml-1.5 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-200">
                        表示中
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-slate-300">
                    {fmt(e.total)}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="relative h-2 w-full rounded-full bg-edge/70">
                      <div
                        className="absolute top-0 h-2"
                        style={{
                          left: `${left}%`,
                          width: `${Math.max(width, 0.6)}%`,
                          background: positive ? POSITIVE : NEGATIVE,
                          borderRadius: positive ? '1px 4px 4px 1px' : '4px 1px 1px 4px',
                        }}
                      />
                      <div
                        className="absolute top-[-3px] h-[14px] w-px bg-slate-500"
                        style={{ left: `${zero}%` }}
                      />
                      <div
                        className="absolute top-[-4px] h-[16px] w-px bg-slate-300/70"
                        style={{ left: `${pct(average.mean)}%` }}
                        title={`平均 ${fmt(average.mean)}`}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      disabled={here}
                      onClick={() => onFocus(e.ball)}
                      className="whitespace-nowrap rounded border border-edge bg-panel2 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-[#243040] disabled:opacity-30"
                    >
                      盤面で見る
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          細い縦線は 0、明るい縦線が平均 {fmt(average.mean)} の位置です。
          「盤面で見る」でボールをその選手に移すと、上のピッチと内訳がその起点の状態になります。
        </p>
      </div>
    </section>
  );
}
