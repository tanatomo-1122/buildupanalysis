import { useCallback, useRef, useState } from 'react';
import { PITCH_LENGTH, PITCH_WIDTH } from '../constants';
import type { Evaluation, Player, Vec2, ViewOptions } from '../types';
import Heatmap from './Heatmap';

/** ピッチ座標(y上向き) → SVG座標(y下向き) */
const Y = (y: number) => PITCH_WIDTH - y;

const pcColor = (pc: number) => {
  // 0.0 赤 → 0.5 黄 → 1.0 緑
  const t = Math.max(0, Math.min(1, pc));
  return `hsl(${(t * 120).toFixed(0)} 85% 55%)`;
};

const clampX = (x: number) => Math.min(PITCH_LENGTH - 4, Math.max(4, x));
const clampY = (y: number) => Math.min(PITCH_WIDTH - 1, Math.max(2.4, y));

interface Props {
  players: Player[];
  ball: Vec2;
  evaluation: Evaluation;
  view: ViewOptions;
  selectedId: string | null;
  homePoints: Vec2[];
  awayPoints: Vec2[];
  lambda: number;
  onSelect: (id: string | null) => void;
  onMovePlayer: (id: string, pos: Vec2) => void;
  onMoveBall: (pos: Vec2) => void;
}

type DragTarget = { kind: 'player'; id: string } | { kind: 'ball' } | null;

/** 影付きの小さなラベル。重なっても読めるように太い暗色ストロークを敷く */
function Label({
  x,
  y,
  children,
  size = 1.7,
  fill = 'rgba(255,255,255,0.92)',
  weight = 600,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  size?: number;
  fill?: string;
  weight?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={size}
      fontWeight={weight}
      fill={fill}
      stroke="rgba(4,10,16,0.85)"
      strokeWidth={size * 0.38}
      paintOrder="stroke"
      pointerEvents="none"
      fontFamily="ui-monospace, SFMono-Regular, monospace"
    >
      {children}
    </text>
  );
}

export default function Pitch({
  players,
  ball,
  evaluation,
  view,
  selectedId,
  homePoints,
  awayPoints,
  lambda,
  onSelect,
  onMovePlayer,
  onMoveBall,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragTarget>(null);

  const toPitch = useCallback((clientX: number, clientY: number): Vec2 => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * PITCH_LENGTH;
    const yTop = ((clientY - rect.top) / rect.height) * PITCH_WIDTH;
    return {
      x: Math.max(0, Math.min(PITCH_LENGTH, x)),
      y: Math.max(0, Math.min(PITCH_WIDTH, PITCH_WIDTH - yTop)),
    };
  }, []);

  const handleDown = (target: DragTarget) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag(target);
    if (target?.kind === 'player') onSelect(target.id);
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toPitch(e.clientX, e.clientY);
    if (drag.kind === 'ball') onMoveBall(p);
    else onMovePlayer(drag.id, p);
  };

  const endDrag = () => setDrag(null);

  const evalById = new Map(evaluation.players.map((e) => [e.playerId, e]));
  const home = players.filter((p) => p.team === 'home');
  const away = players.filter((p) => p.team === 'away');

  const playerLabels = (list: Player[]) =>
    list.map((p) => {
      const ev = evalById.get(p.id);
      const rows: React.ReactNode[] = [];
      if (view.positions) {
        rows.push(
          <Label key={`pos-${p.id}`} x={p.pos.x} y={clampY(Y(p.pos.y) + 4.1)} size={1.65}>
            {p.position}
          </Label>,
        );
      }
      if (view.pcLabels && ev) {
        rows.push(
          <Label
            key={`pc-${p.id}`}
            x={p.pos.x}
            y={clampY(Y(p.pos.y) + (view.positions ? 6.2 : 4.1))}
            size={1.55}
            weight={500}
            fill="rgba(186,240,255,0.95)"
          >
            {ev.pc.toFixed(2)}
          </Label>,
        );
      }
      return rows;
    });

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-edge bg-[#14361f] shadow-lg">
      <div className="relative w-full" style={{ aspectRatio: `${PITCH_LENGTH} / ${PITCH_WIDTH}` }}>
        <Heatmap
          homePoints={homePoints}
          awayPoints={awayPoints}
          lambda={lambda}
          visible={view.heatmap}
        />
        <svg
          ref={svgRef}
          className="no-select absolute inset-0 h-full w-full touch-none"
          viewBox={`0 0 ${PITCH_LENGTH} ${PITCH_WIDTH}`}
          onPointerMove={handleMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerDown={() => onSelect(null)}
        >
          <defs>
            <marker
              id="arrow-home"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#e2f6ff" />
            </marker>
            <marker
              id="arrow-away"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffd9de" />
            </marker>
          </defs>

          {/* ピッチライン */}
          <g stroke="rgba(255,255,255,0.42)" strokeWidth={0.25} fill="none">
            <rect x={0.2} y={0.2} width={PITCH_LENGTH - 0.4} height={PITCH_WIDTH - 0.4} />
            <line x1={PITCH_LENGTH / 2} y1={0.2} x2={PITCH_LENGTH / 2} y2={PITCH_WIDTH - 0.2} />
            <circle cx={PITCH_LENGTH / 2} cy={PITCH_WIDTH / 2} r={9.15} />
            <circle
              cx={PITCH_LENGTH / 2}
              cy={PITCH_WIDTH / 2}
              r={0.4}
              fill="rgba(255,255,255,0.42)"
            />
            <rect x={0.2} y={Y(54.16)} width={16.5} height={40.32} />
            <rect x={PITCH_LENGTH - 16.7} y={Y(54.16)} width={16.5} height={40.32} />
            <rect x={0.2} y={Y(43.16)} width={5.5} height={18.32} />
            <rect x={PITCH_LENGTH - 5.7} y={Y(43.16)} width={5.5} height={18.32} />
          </g>

          {/* 5レーン補助線 */}
          <g stroke="rgba(255,255,255,0.12)" strokeWidth={0.15} strokeDasharray="1.2 1.6">
            {[13.84, 24.84, 43.16, 54.16].map((y) => (
              <line key={y} x1={0} y1={Y(y)} x2={PITCH_LENGTH} y2={Y(y)} />
            ))}
          </g>

          {/* ベクトル：保持側は明るく、非保持側は控えめに */}
          {view.arrows &&
            [...evaluation.arrivals]
              .sort((a) => (a.team === evaluation.attackingTeam ? 1 : -1))
              .map((a) => {
                const attacking = a.team === evaluation.attackingTeam;
                return (
                  <line
                    key={`vec-${a.playerId}`}
                    x1={a.from.x}
                    y1={Y(a.from.y)}
                    x2={a.to.x}
                    y2={Y(a.to.y)}
                    stroke={
                      a.team === 'home' ? 'rgba(226,246,255,0.72)' : 'rgba(255,217,222,0.62)'
                    }
                    strokeWidth={attacking ? 0.32 : 0.26}
                    strokeDasharray={attacking ? '1.4 0.8' : '1 0.9'}
                    markerEnd={a.team === 'home' ? 'url(#arrow-home)' : 'url(#arrow-away)'}
                  />
                );
              })}

          {/* 保持側の到達領域（PC で着色） */}
          {view.targets &&
            evaluation.players.map((e) => (
              <circle
                key={`ht-${e.playerId}`}
                cx={e.to.x}
                cy={Y(e.to.y)}
                r={2.6}
                fill={pcColor(e.pc)}
                fillOpacity={e.excluded ? 0.1 : 0.28}
                stroke={pcColor(e.pc)}
                strokeWidth={0.35}
                strokeOpacity={e.excluded ? 0.3 : 1}
              />
            ))}

          {/* 選手トークン */}
          {players.map((p) => {
            const isHome = p.team === 'home';
            const isHolder = p.id === evaluation.holderId;
            const selected = p.id === selectedId;
            return (
              <g
                key={p.id}
                className="cursor-grab"
                onPointerDown={handleDown({ kind: 'player', id: p.id })}
              >
                {selected && (
                  <circle
                    cx={p.pos.x}
                    cy={Y(p.pos.y)}
                    r={3.1}
                    fill="none"
                    stroke="#fde047"
                    strokeWidth={0.4}
                  />
                )}
                <circle
                  cx={p.pos.x}
                  cy={Y(p.pos.y)}
                  r={2.0}
                  fill={isHome ? '#0ea5e9' : '#f43f5e'}
                  stroke={isHolder ? '#fde047' : 'rgba(255,255,255,0.85)'}
                  strokeWidth={isHolder ? 0.55 : 0.3}
                />
                <text
                  x={p.pos.x}
                  y={Y(p.pos.y) + 0.75}
                  textAnchor="middle"
                  fontSize={2.2}
                  fontWeight={700}
                  fill="#ffffff"
                  pointerEvents="none"
                  fontFamily="ui-monospace, monospace"
                >
                  {p.number}
                </text>
              </g>
            );
          })}

          {/* ボール */}
          <g className="cursor-grab" onPointerDown={handleDown({ kind: 'ball' })}>
            <line
              x1={ball.x}
              y1={0}
              x2={ball.x}
              y2={PITCH_WIDTH}
              stroke="#fde047"
              strokeWidth={0.18}
              strokeDasharray="1 1.4"
              opacity={0.7}
              pointerEvents="none"
            />
            <circle
              cx={ball.x}
              cy={Y(ball.y)}
              r={1.5}
              fill="#fef9c3"
              stroke="#1f2937"
              strokeWidth={0.35}
            />
          </g>

          {/* ラベル層：トークンより上に描いて、重なっても読めるようにする */}
          <g>
            {playerLabels(away)}
            {playerLabels(home)}
            {view.contribution &&
              evaluation.players
                .filter((e) => !e.excluded)
                .map((e) => (
                  <Label
                    key={`cv-${e.playerId}`}
                    x={clampX(e.to.x)}
                    y={clampY(Y(e.to.y) - 3.5)}
                    size={2.1}
                    weight={700}
                    fill={e.value >= 0 ? '#bbf7d0' : '#fecaca'}
                  >
                    {e.value >= 0 ? '+' : ''}
                    {e.value.toFixed(1)}
                  </Label>
                ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
