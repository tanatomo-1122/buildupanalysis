import { passDistanceWeight } from '../logic/passWeight';

/**
 * パス距離の重み曲線。
 *
 * 系列は1本だけなので凡例は置かず、タイトル文でそれが何かを示す。
 * 曲線上の点は「いま盤面にいる各選手のパス距離がどこに乗っているか」。
 * 横軸だけを持ち、縦軸は 0〜1 の重みなので目盛りは端のラベルで足りる。
 */

const W = 260;
const H = 76;
const PAD_L = 6;
const PAD_R = 6;
const PAD_T = 8;
const PAD_B = 16;

const CURVE = '#38bdf8';

interface Props {
  mu: number;
  sigma: number;
  /** 盤面上の各選手のパス距離 [m]（ホルダー除く） */
  distances: { number: number; d: number }[];
  enabled: boolean;
}

export default function PassWeightCurve({ mu, sigma, distances, enabled }: Props) {
  const maxD = Math.max(60, Math.ceil((mu + 3 * sigma) / 10) * 10, ...distances.map((p) => p.d + 5));
  const x = (d: number) => PAD_L + (d / maxD) * (W - PAD_L - PAD_R);
  const y = (w: number) => PAD_T + (1 - w) * (H - PAD_T - PAD_B);

  const points: string[] = [];
  const steps = 120;
  for (let i = 0; i <= steps; i++) {
    const d = (i / steps) * maxD;
    const w = enabled ? passDistanceWeight(d, mu, sigma) : 1;
    points.push(`${x(d).toFixed(2)},${y(w).toFixed(2)}`);
  }

  const ticks = [0, Math.round(maxD / 2), Math.round(maxD)];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`パス距離の重み曲線。ピーク ${mu} メートル、許容幅 ${sigma} メートル。`}
      >
        {/* 目盛り（控えめに） */}
        <line
          x1={PAD_L}
          y1={y(0)}
          x2={W - PAD_R}
          y2={y(0)}
          stroke="rgba(148,163,184,0.28)"
          strokeWidth={1}
        />
        <line
          x1={PAD_L}
          y1={y(1)}
          x2={W - PAD_R}
          y2={y(1)}
          stroke="rgba(148,163,184,0.16)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />

        {/* ピーク位置 μ */}
        {enabled && (
          <>
            <line
              x1={x(mu)}
              y1={y(1)}
              x2={x(mu)}
              y2={y(0)}
              stroke="rgba(148,163,184,0.45)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <text
              x={x(mu)}
              y={PAD_T - 1}
              textAnchor="middle"
              fontSize={8}
              fill="rgba(203,213,225,0.9)"
              fontFamily="ui-monospace, monospace"
            >
              μ {mu}m
            </text>
          </>
        )}

        {/* 重み曲線 */}
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={CURVE}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* 盤面上の各選手のパス距離 */}
        {distances.map((p) => {
          const w = enabled ? passDistanceWeight(p.d, mu, sigma) : 1;
          return (
            <circle
              key={p.number}
              cx={x(p.d)}
              cy={y(w)}
              r={3.4}
              fill={CURVE}
              stroke="#1b222b"
              strokeWidth={1.4}
            >
              <title>{`#${p.number} 距離 ${p.d.toFixed(1)}m → 重み ${w.toFixed(2)}`}</title>
            </circle>
          );
        })}

        {/* 横軸ラベル */}
        {ticks.map((t) => (
          <text
            key={t}
            x={x(t)}
            y={H - 4}
            textAnchor={t === 0 ? 'start' : t === ticks[ticks.length - 1] ? 'end' : 'middle'}
            fontSize={8}
            fill="rgba(148,163,184,0.75)"
            fontFamily="ui-monospace, monospace"
          >
            {t}m
          </text>
        ))}
        <text
          x={W - PAD_R}
          y={y(1) - 2}
          textAnchor="end"
          fontSize={8}
          fill="rgba(148,163,184,0.6)"
          fontFamily="ui-monospace, monospace"
        >
          w=1.0
        </text>
      </svg>
      <figcaption className="mt-1 text-[10px] leading-snug text-slate-500">
        横軸＝パス距離、縦軸＝重み w。点は盤面上の各選手（ホルダー除く）の現在のパス距離。
      </figcaption>
    </figure>
  );
}
