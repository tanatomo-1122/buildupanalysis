import { useCallback, useRef, useState } from 'react';
import { PITCH_LENGTH, PITCH_WIDTH } from '../constants';
import { ZONES, allowedAt, correctPosition, togglePosition, zoneAt, zoneRect } from '../data/zones';
import type { Player, TeamId, Vec2 } from '../types';

/** ピッチ座標(y上向き) → SVG座標(y下向き) */
const Y = (y: number) => PITCH_WIDTH - y;

/** クリックとドラッグの境目（ピッチ上のメートル） */
const CLICK_SLOP = 1.2;

interface Props {
  /** 編集対象の11人 */
  players: Player[];
  /** どちらのゴールに向かって攻めるチームか。ゾーン判定の向きが決まる */
  team: TeamId;
  onChange: (players: Player[]) => void;
  /** ゾーンの枠線と名前を出すか */
  showZones?: boolean;
}

/**
 * フリーエディット用のピッチ。
 *
 * - トークンはピッチ上の任意の座標にドラッグできる
 * - 離した位置のゾーンでそのポジションが許されていなければ、既定ポジションへ自動是正する
 * - 動かさずにクリックすると、そのゾーンで許されるポジションを順に切り替える
 *
 * ゾーンの矩形は編集対象チームの実座標系に鏡映して描くので、
 * 「相手を編集している」ときも画面上の見た目と判定が一致する。
 */
export default function FreeEditPitch({ players, team, onChange, showZones = true }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const startRef = useRef<Vec2 | null>(null);
  const movedRef = useRef(false);

  const toPitch = useCallback((clientX: number, clientY: number): Vec2 => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * PITCH_LENGTH;
    const yTop = ((clientY - rect.top) / rect.height) * PITCH_WIDTH;
    return {
      x: Math.max(0.5, Math.min(PITCH_LENGTH - 0.5, x)),
      y: Math.max(0.5, Math.min(PITCH_WIDTH - 0.5, PITCH_WIDTH - yTop)),
    };
  }, []);

  const update = (id: string, fn: (p: Player) => Player) =>
    onChange(players.map((p) => (p.id === id ? fn(p) : p)));

  const handleDown = (id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragId(id);
    setSelectedId(id);
    startRef.current = toPitch(e.clientX, e.clientY);
    movedRef.current = false;
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!dragId) return;
    const p = toPitch(e.clientX, e.clientY);
    const s = startRef.current;
    if (s && Math.hypot(p.x - s.x, p.y - s.y) > CLICK_SLOP) movedRef.current = true;
    // ドラッグ中は座標だけ動かす。ポジションの是正は離したときに一度だけ行う
    update(dragId, (pl) => ({ ...pl, pos: p }));
  };

  const endDrag = () => {
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const target = players.find((p) => p.id === id);
    if (!target) return;
    if (movedRef.current) {
      // 自動是正：ドロップ先のゾーンで許されないポジションは既定へ落とす
      const next = correctPosition(target.pos, team, target.position);
      if (next !== target.position) update(id, (p) => ({ ...p, position: next }));
    } else {
      // 動かしていない ＝ クリック。許されるポジションをトグルする
      const next = togglePosition(target.pos, team, target.position);
      if (next !== target.position) update(id, (p) => ({ ...p, position: next }));
    }
  };

  const dragging = dragId ? players.find((p) => p.id === dragId) : null;
  const activeZone = dragging ? zoneAt(dragging.pos, team) : null;
  const selected = selectedId ? players.find((p) => p.id === selectedId) : null;

  return (
    <div className="space-y-2">
      <div className="relative w-full overflow-hidden rounded-xl border border-edge bg-[#14361f]">
        <svg
          ref={svgRef}
          className="no-select block w-full touch-none"
          viewBox={`0 0 ${PITCH_LENGTH} ${PITCH_WIDTH}`}
          style={{ aspectRatio: `${PITCH_LENGTH} / ${PITCH_WIDTH}` }}
          onPointerMove={handleMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerDown={() => setSelectedId(null)}
        >
          {/* ゾーン */}
          {showZones &&
            ZONES.map((z) => {
              const r = zoneRect(z, team);
              const active = activeZone?.id === z.id;
              return (
                <g key={z.id} pointerEvents="none">
                  <rect
                    x={r.x}
                    y={Y(r.y + r.h)}
                    width={r.w}
                    height={r.h}
                    fill={active ? 'rgba(253,224,71,0.16)' : 'rgba(255,255,255,0.02)'}
                    stroke={active ? 'rgba(253,224,71,0.9)' : 'rgba(255,255,255,0.22)'}
                    strokeWidth={active ? 0.4 : 0.18}
                    strokeDasharray={active ? undefined : '1.4 1.4'}
                  />
                  <text
                    x={r.x + r.w / 2}
                    y={Y(r.y + r.h) + 2.6}
                    textAnchor="middle"
                    fontSize={1.7}
                    fontFamily="ui-monospace, monospace"
                    fill={active ? 'rgba(253,224,71,0.95)' : 'rgba(255,255,255,0.4)'}
                  >
                    {z.allowed.join('/')}
                  </text>
                </g>
              );
            })}

          {/* ピッチライン */}
          <g stroke="rgba(255,255,255,0.42)" strokeWidth={0.25} fill="none" pointerEvents="none">
            <rect x={0.2} y={0.2} width={PITCH_LENGTH - 0.4} height={PITCH_WIDTH - 0.4} />
            <line x1={PITCH_LENGTH / 2} y1={0.2} x2={PITCH_LENGTH / 2} y2={PITCH_WIDTH - 0.2} />
            <circle cx={PITCH_LENGTH / 2} cy={PITCH_WIDTH / 2} r={9.15} />
            <rect x={0.2} y={Y(54.16)} width={16.5} height={40.32} />
            <rect x={PITCH_LENGTH - 16.7} y={Y(54.16)} width={16.5} height={40.32} />
          </g>

          {/* 選手トークン */}
          {players.map((p) => {
            const isSel = p.id === selectedId;
            const multi = allowedAt(p.pos, team).length > 1;
            return (
              <g key={p.id} className="cursor-grab" onPointerDown={handleDown(p.id)}>
                {isSel && (
                  <circle
                    cx={p.pos.x}
                    cy={Y(p.pos.y)}
                    r={3.2}
                    fill="none"
                    stroke="#fde047"
                    strokeWidth={0.4}
                  />
                )}
                <circle
                  cx={p.pos.x}
                  cy={Y(p.pos.y)}
                  r={2.2}
                  fill={team === 'home' ? '#0ea5e9' : '#f43f5e'}
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={0.3}
                />
                {multi && (
                  <circle
                    cx={p.pos.x + 1.9}
                    cy={Y(p.pos.y) - 1.9}
                    r={0.7}
                    fill="#fde047"
                    stroke="rgba(4,10,16,0.7)"
                    strokeWidth={0.2}
                    pointerEvents="none"
                  />
                )}
                <text
                  x={p.pos.x}
                  y={Y(p.pos.y) + 0.8}
                  textAnchor="middle"
                  fontSize={2.3}
                  fontWeight={700}
                  fill="#ffffff"
                  pointerEvents="none"
                  fontFamily="ui-monospace, monospace"
                >
                  {p.number}
                </text>
                <text
                  x={p.pos.x}
                  y={Math.min(PITCH_WIDTH - 0.6, Y(p.pos.y) + 4.6)}
                  textAnchor="middle"
                  fontSize={1.9}
                  fontWeight={700}
                  fill="rgba(255,255,255,0.95)"
                  stroke="rgba(4,10,16,0.85)"
                  strokeWidth={0.7}
                  paintOrder="stroke"
                  pointerEvents="none"
                  fontFamily="ui-monospace, monospace"
                >
                  {p.position}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        トークンをドラッグして任意の位置へ。離した先のエリアで今のポジションが使えない場合は、
        そのエリアの既定ポジションへ自動で切り替わります。動かさずにクリックすると、
        そのエリアで選べるポジション（<span className="text-amber-300">●</span> が付いているトークン）を切り替えられます。
        {selected && (
          <>
            {' '}
            選択中: <span className="font-mono text-slate-300">
              #{selected.number} {selected.position}
            </span>
            （{zoneAt(selected.pos, team).label} / 選択可 {allowedAt(selected.pos, team).join('・')}）
          </>
        )}
      </p>
    </div>
  );
}
