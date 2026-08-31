import type { Evaluation } from '../types';

const fmt = (n: number, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);

export default function ScorePanel({
  evaluation,
  total,
  title,
  subtitle,
  breakdownNote,
}: {
  evaluation: Evaluation;
  /** 見出しに出す値。起点平均モードでは平均値が入る */
  total: number;
  title: string;
  subtitle: string;
  /** 内訳表の上に出す注記 */
  breakdownNote?: string;
}) {
  const rows = [...evaluation.players].sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    return b.value - a.value;
  });
  const maxAbs = Math.max(1, ...rows.filter((r) => !r.excluded).map((r) => Math.abs(r.value)));

  return (
    <div className="rounded-lg border border-edge bg-panel2/60">
      <div className="flex items-baseline justify-between gap-3 border-b border-edge px-3 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {title}
          </div>
          <div className="text-[11px] text-slate-500">{subtitle}</div>
        </div>
        <div
          className="font-mono text-3xl font-bold tabular-nums"
          style={{ color: total >= 0 ? '#4ade80' : '#f87171' }}
        >
          {fmt(total, 1)}
        </div>
      </div>

      {breakdownNote && (
        <p className="border-b border-edge px-3 py-2 text-[11px] leading-snug text-slate-500">
          {breakdownNote}
        </p>
      )}

      <div className="max-h-[38vh] overflow-auto">
        <table className="w-full min-w-[680px] text-[12px]">
          <thead className="sticky top-0 bg-panel2 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">#</th>
              <th className="px-2 py-1.5 text-left font-medium">POS</th>
              <th className="px-2 py-1.5 text-left font-medium">発動中の特性</th>
              <th className="px-2 py-1.5 text-right font-medium" title="ボールから到達地点までの直線距離">
                距離
              </th>
              <th className="px-2 py-1.5 text-right font-medium" title="パス距離のガウス重み">
                w
              </th>
              <th className="px-2 py-1.5 text-right font-medium" title="到達地点だけで見た PC">
                終点
              </th>
              <th
                className="px-2 py-1.5 text-right font-medium"
                title="採用された PC（コース評価が ON ならコース上のボトルネック）"
              >
                PC
              </th>
              <th className="px-2 py-1.5 text-right font-medium">ΔX</th>
              <th className="px-2 py-1.5 text-right font-medium">寄与</th>
              <th className="w-20 px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.playerId}
                className={`border-t border-edge/60 ${r.excluded ? 'text-slate-600' : 'text-slate-300'}`}
              >
                <td className="px-2 py-1.5 font-mono">{r.number}</td>
                <td className="px-2 py-1.5 font-mono text-slate-400">{r.position}</td>
                <td className="px-2 py-1.5">
                  {r.skillLabel}
                  {r.excluded && <span className="ml-1 text-[10px] text-amber-500">ホルダー</span>}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400">
                  {r.passDistance.toFixed(1)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                  {r.distanceWeight.toFixed(2)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-500">
                  {r.pcEndpoint.toFixed(2)}
                </td>
                <td
                  className="px-2 py-1.5 text-right font-mono tabular-nums"
                  title={
                    r.pc < r.pcEndpoint - 1e-9
                      ? `コース上のボトルネック（ボールから ${(r.bottleneckT * 100).toFixed(0)}% 地点）で ${r.pcEndpoint.toFixed(2)} から低下`
                      : '到達地点がそのままボトルネック'
                  }
                >
                  {r.pc.toFixed(2)}
                  {r.pc < r.pcEndpoint - 0.005 && (
                    <span className="ml-1 text-[10px] text-amber-500">▼</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmt(r.dx, 1)}</td>
                <td
                  className="px-2 py-1.5 text-right font-mono font-semibold tabular-nums"
                  style={{ color: r.excluded ? undefined : r.value >= 0 ? '#4ade80' : '#f87171' }}
                >
                  {fmt(r.value, 1)}
                </td>
                <td className="px-2 py-1.5">
                  {!r.excluded && (
                    <div className="relative h-1.5 w-full rounded-full bg-edge">
                      <div
                        className="absolute top-0 h-1.5 rounded-full"
                        style={{
                          background: r.value >= 0 ? '#4ade80' : '#f87171',
                          left: r.value >= 0 ? '50%' : undefined,
                          right: r.value < 0 ? '50%' : undefined,
                          width: `${(Math.abs(r.value) / maxAbs) * 50}%`,
                        }}
                      />
                      <div className="absolute left-1/2 top-[-2px] h-[10px] w-px bg-slate-600" />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
