import { PITCH_LENGTH, PITCH_WIDTH } from '../constants';
import type { Player } from '../types';

/** ピッチ座標(y上向き) → SVG座標(y下向き) */
const Y = (y: number) => PITCH_WIDTH - y;

/**
 * 提案された布陣を表示するだけの軽量ピッチ。
 * 評価の可視化（矢印・支配領域）は戦術ボード側の役割なので、ここは配置と名前だけ。
 */
export default function LineupPitch({
  home,
  away,
  homeLabel,
  awayLabel,
}: {
  home: Player[];
  away: Player[];
  homeLabel: string;
  awayLabel: string;
}) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-edge bg-[#14361f]">
      <svg
        viewBox={`0 0 ${PITCH_LENGTH} ${PITCH_WIDTH}`}
        className="block w-full"
        style={{ aspectRatio: `${PITCH_LENGTH} / ${PITCH_WIDTH}` }}
      >
        <g stroke="rgba(255,255,255,0.4)" strokeWidth={0.25} fill="none">
          <rect x={0.2} y={0.2} width={PITCH_LENGTH - 0.4} height={PITCH_WIDTH - 0.4} />
          <line x1={PITCH_LENGTH / 2} y1={0.2} x2={PITCH_LENGTH / 2} y2={PITCH_WIDTH - 0.2} />
          <circle cx={PITCH_LENGTH / 2} cy={PITCH_WIDTH / 2} r={9.15} />
          <rect x={0.2} y={Y(54.16)} width={16.5} height={40.32} />
          <rect x={PITCH_LENGTH - 16.7} y={Y(54.16)} width={16.5} height={40.32} />
        </g>

        {[...away, ...home].map((p) => {
          const isHome = p.team === 'home';
          return (
            <g key={p.id}>
              <circle
                cx={p.pos.x}
                cy={Y(p.pos.y)}
                r={2.1}
                fill={isHome ? '#0ea5e9' : '#f43f5e'}
                fillOpacity={isHome ? 1 : 0.55}
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={0.3}
              />
              <text
                x={p.pos.x}
                y={Y(p.pos.y) + 0.8}
                textAnchor="middle"
                fontSize={2.3}
                fontWeight={700}
                fill="#ffffff"
                fontFamily="ui-monospace, monospace"
              >
                {p.number}
              </text>
              {isHome && (
                <>
                  <text
                    x={p.pos.x}
                    y={Math.min(PITCH_WIDTH - 3.2, Y(p.pos.y) + 4.4)}
                    textAnchor="middle"
                    fontSize={1.8}
                    fontWeight={600}
                    fill="rgba(255,255,255,0.92)"
                    stroke="rgba(4,10,16,0.85)"
                    strokeWidth={0.7}
                    paintOrder="stroke"
                    fontFamily="ui-monospace, monospace"
                  >
                    {p.position}
                  </text>
                  {p.name && (
                    <text
                      x={p.pos.x}
                      y={Math.min(PITCH_WIDTH - 0.8, Y(p.pos.y) + 6.8)}
                      textAnchor="middle"
                      fontSize={1.9}
                      fill="rgba(226,246,255,0.95)"
                      stroke="rgba(4,10,16,0.85)"
                      strokeWidth={0.75}
                      paintOrder="stroke"
                    >
                      {p.name.length > 10 ? `${p.name.slice(0, 10)}…` : p.name}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge px-3 py-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500" />
          {homeLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500/60" />
          {awayLabel}
        </span>
      </div>
    </div>
  );
}
