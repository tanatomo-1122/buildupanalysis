import { interceptFactor, loftAmount } from '../logic/passLane';

/**
 * パスの「浮き具合」loft(L) の曲線と、実際のパス距離の分布。
 *
 * 系列は1本なので凡例は置かず、見出し文で何かを示す。
 * 2本のしきい値（グラウンダー上限・完全フライ）は縦線で直接ラベルする。
 */

const W = 260;
const H = 78;
const PAD_L = 6;
const PAD_R = 6;
const PAD_T = 8;
const PAD_B = 16;

const CURVE = '#38bdf8';
const MAX_D = 70;

interface Props {
  shortMax: number;
  longMin: number;
  sharpness: number;
  /** 盤面上の各選手のパス距離 [m]（ホルダー除く） */
  distances: { number: number; d: number }[];
  enabled: boolean;
}

export default function LoftCurve({ shortMax, longMin, sharpness, distances, enabled }: Props) {
  const x = (d: number) => PAD_L + (Math.min(d, MAX_D) / MAX_D) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - v) * (H - PAD_T - PAD_B);

  const points: string[] = [];
  for (let i = 0; i <= 140; i++) {
    const d = (i / 140) * MAX_D;
    const v = enabled ? loftAmount(d, shortMax, longMin) : 0;
    points.push(`${x(d).toFixed(2)},${y(v).toFixed(2)}`);
  }

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`パスの浮き具合。${shortMax} メートル以下はグラウンダー、${longMin} メートル以上で完全なフライ。`}
      >
        <line x1={PAD_L} y1={y(0)} x2={W - PAD_R} y2={y(0)} stroke="rgba(148,163,184,0.28)" strokeWidth={1} />
        <line
          x1={PAD_L}
          y1={y(1)}
          x2={W - PAD_R}
          y2={y(1)}
          stroke="rgba(148,163,184,0.16)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />

        {enabled &&
          (
            [
              [shortMax, 'グラウンダー'],
              [longMin, 'フライ'],
            ] as [number, string][]
          ).map(([d, label], i) => (
            <g key={label}>
              <line
                x1={x(d)}
                y1={y(1)}
                x2={x(d)}
                y2={y(0)}
                stroke="rgba(148,163,184,0.4)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text
                x={x(d) + (i === 0 ? -2 : 2)}
                y={PAD_T - 1}
                textAnchor={i === 0 ? 'end' : 'start'}
                fontSize={7.5}
                fill="rgba(203,213,225,0.9)"
                fontFamily="ui-monospace, monospace"
              >
                {label} {d}m
              </text>
            </g>
          ))}

        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={CURVE}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {distances.map((p) => {
          const v = enabled ? loftAmount(p.d, shortMax, longMin) : 0;
          const mid = enabled ? interceptFactor(p.d / 2, p.d, shortMax, longMin, sharpness) : 1;
          return (
            <circle
              key={p.number}
              cx={x(p.d)}
              cy={y(v)}
              r={3.4}
              fill={CURVE}
              stroke="#1b222b"
              strokeWidth={1.4}
            >
              <title>{`#${p.number} 距離 ${p.d.toFixed(1)}m → 中間地点の I = ${mid.toFixed(2)}`}</title>
            </circle>
          );
        })}

        {[0, MAX_D / 2, MAX_D].map((t, i) => (
          <text
            key={t}
            x={x(t)}
            y={H - 4}
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
            fontSize={8}
            fill="rgba(148,163,184,0.75)"
            fontFamily="ui-monospace, monospace"
          >
            {t}m
          </text>
        ))}
      </svg>
      <figcaption className="mt-1 text-[10px] leading-snug text-slate-500">
        横軸＝パス距離、縦軸＝浮き具合（1 で中間地点の敵を完全に無視）。点は各選手の現在のパス距離。
      </figcaption>
    </figure>
  );
}
