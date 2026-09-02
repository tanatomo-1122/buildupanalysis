import { useCallback, useEffect, useMemo, useState } from 'react';
import ControlPanel from '../components/ControlPanel';
import HolderBreakdown from '../components/HolderBreakdown';
import Pitch from '../components/Pitch';
import ScorePanel from '../components/ScorePanel';
import { Notice } from '../components/ui';
import { DEFAULT_PARAMS } from '../constants';
import { withFormation } from '../data/formations';
import { SCENES, STYLE_PHASE_LABEL, styleById, stylePhaseKey } from '../data/styles';
import { controlPoints, evaluateBoard } from '../logic/evaluate';
import { averageOverHolders } from '../logic/holderAverage';
import { clampToPitch } from '../logic/vectors';
import { initialState } from '../presets';
import type { BoardState, Params, Player, TeamId, Vec2, ViewOptions } from '../types';

const DEFAULT_VIEW: ViewOptions = {
  heatmap: true,
  arrows: true,
  targets: true,
  lanes: false,
  positions: true,
  pcLabels: false,
  contribution: true,
};

const TEAM_LABEL: Record<TeamId, string> = { home: '自チーム', away: '相手チーム' };

interface Props {
  board: BoardState;
  onBoardChange: (next: BoardState) => void;
  /** 提案から渡ってきた布陣かどうか（説明文の出し分け用） */
  seededFrom: string | null;
}

export default function BoardPage({ board, onBoardChange, seededFrom }: Props) {
  const [view, setView] = useState<ViewOptions>(DEFAULT_VIEW);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(null);
  }, [seededFrom]);

  const evaluation = useMemo(
    () => evaluateBoard(board.players, board.ball, board.params),
    [board],
  );
  const points = useMemo(() => controlPoints(board.players, board.ball, board.params), [board]);
  const holderAverage = useMemo(
    () => averageOverHolders(board.players, board.ball, board.params),
    [board],
  );

  const update = useCallback(
    (patch: Partial<BoardState>) => onBoardChange({ ...board, ...patch }),
    [board, onBoardChange],
  );

  const movePlayer = useCallback(
    (id: string, pos: Vec2) =>
      update({
        players: board.players.map((p) => (p.id === id ? { ...p, pos: clampToPitch(pos) } : p)),
      }),
    [board.players, update],
  );

  const moveBall = useCallback((pos: Vec2) => update({ ball: clampToPitch(pos) }), [update]);

  const setParams = useCallback(
    (patch: Partial<Params>) => update({ params: { ...board.params, ...patch } }),
    [board.params, update],
  );

  const patchPlayer = useCallback(
    (id: string, patch: Partial<Player>) =>
      update({ players: board.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) }),
    [board.players, update],
  );

  const applyFormation = useCallback(
    (team: TeamId, formationId: string, line: number) =>
      update({
        players: withFormation(board.players, team, formationId, line),
        ...(team === 'home'
          ? { homeFormation: formationId, homeLine: line }
          : { awayFormation: formationId, awayLine: line }),
      }),
    [board.players, update],
  );

  const selected = board.players.find((p) => p.id === selectedId) ?? null;
  const scene = SCENES.find((s) => s.id === board.params.scene) ?? SCENES[0];
  const possessor = board.params.possessionTeam;
  const homeKey = stylePhaseKey(board.params.scene, 'home', possessor);
  const awayKey = stylePhaseKey(board.params.scene, 'away', possessor);

  const teamSummary = (team: TeamId, formation: string, styleId: string, key: typeof homeKey) => (
    <span className="flex items-center gap-1.5 text-slate-400">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: team === 'home' ? '#0ea5e9' : '#f43f5e' }}
      />
      {formation} ／ {styleById(styleId).label}
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] ${
          team === possessor ? 'bg-emerald-500/20 text-emerald-300' : 'bg-edge text-slate-300'
        }`}
      >
        {STYLE_PHASE_LABEL[key]}
      </span>
    </span>
  );

  return (
    <div className="space-y-4">
      {seededFrom && (
        <Notice>
          戦術提案の <b className="text-slate-200">{seededFrom}</b> を読み込んでいます。
          ドラッグで動かして検証できます（変更は提案結果には戻りません）。
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-edge bg-panel2/50 px-3 py-2 text-[12px]">
        <span className="font-medium text-slate-300">
          {possessor === 'home' ? '自チームが攻撃' : '自チームが守備'} ／ {scene.label}
        </span>
        {teamSummary('home', board.homeFormation, board.params.homeStyle, homeKey)}
        {teamSummary('away', board.awayFormation, board.params.awayStyle, awayKey)}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="space-y-4">
          <Pitch
            players={board.players}
            ball={board.ball}
            evaluation={evaluation}
            view={view}
            selectedId={selectedId}
            homePoints={points.homePoints}
            awayPoints={points.awayPoints}
            lambda={board.params.lambda}
            onSelect={setSelectedId}
            onMovePlayer={movePlayer}
            onMoveBall={moveBall}
          />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500" />
              自チーム（攻撃方向 →）
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
              相手チーム（攻撃方向 ←）
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-amber-300" />
              ボールホルダー（総和から除外）
            </span>
            <span>丸の色＝到達地点の PC（赤 0.0 → 緑 1.0）</span>
          </div>

          <ScorePanel
            evaluation={evaluation}
            total={holderAverage.mean}
            title={
              possessor === 'home' ? 'ビルドアップ期待値（起点平均）' : '相手の期待前進値（起点平均）'
            }
            subtitle={`GK 以外 ${holderAverage.count} 人それぞれが持った場合の平均`}
            breakdownNote={`下の内訳は現在のボール位置（x ${board.ball.x.toFixed(0)}, y ${board.ball.y.toFixed(0)}）1点での中身です。上のスコアは ${holderAverage.count} 起点の平均なので一致しません。`}
          />

          <HolderBreakdown
            average={holderAverage}
            team={possessor}
            active
            currentBall={board.ball}
            onFocus={moveBall}
          />
        </main>

        <aside className="lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-1">
          <ControlPanel
            params={board.params}
            view={view}
            selected={selected}
            homeFormation={board.homeFormation}
            awayFormation={board.awayFormation}
            homeLine={board.homeLine}
            awayLine={board.awayLine}
            onParams={setParams}
            onView={(patch) => setView((v) => ({ ...v, ...patch }))}
            onPlayer={patchPlayer}
            onPos={(id, x, y) => movePlayer(id, { x, y })}
            onFormation={applyFormation}
            onReset={() => {
              onBoardChange({ ...initialState(), params: { ...DEFAULT_PARAMS } });
              setSelectedId(null);
            }}
          />
        </aside>
      </div>
    </div>
  );
}

export { DEFAULT_VIEW, TEAM_LABEL };
