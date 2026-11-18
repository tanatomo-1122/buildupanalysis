import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createTactic, updateTactic } from '../api/tactics';
import ControlPanel from '../components/ControlPanel';
import FormationPicker from '../components/FormationPicker';
import HolderBreakdown from '../components/HolderBreakdown';
import Pitch from '../components/Pitch';
import SaveCard from '../components/SaveCard';
import ScorePanel from '../components/ScorePanel';
import { Button, Notice, Select } from '../components/ui';
import { withFormation } from '../data/formations';
import { aptitudeOf, playerFit } from '../data/positions';
import { DEFAULT_SKILLS } from '../data/skills';
import { TEAM_STYLES } from '../data/styles';
import { allowedAt, correctPosition } from '../data/zones';
import {
  assignSquad,
  boardPayload,
  personKey,
  phaseLineups,
  putSquadPlayer,
  shapeOf,
  shiftLine,
  squadIn,
  teamOf,
} from '../logic/boardTactic';
import { controlPoints, evaluateBoard } from '../logic/evaluate';
import { averageOverHolders } from '../logic/holderAverage';
import { scoreUnit } from '../logic/recommend';
import { clampToPitch } from '../logic/vectors';
import { initialState } from '../presets';
import type {
  BoardState,
  Params,
  Player,
  PositionId,
  SquadPlayer,
  TeamId,
  UserProfile,
  Vec2,
  ViewOptions,
} from '../types';

/**
 * 戦術ボード。
 *
 * 戦術提案が「答えを出す」画面なのに対して、ここは自分で形を探る場所。
 * 選手を動かすたびに「ビルドアップ期待値」が1つだけ返ってくる、という作りにしている。
 * 数式や内訳は「くわしく見る」を開いたときだけ出す。
 */

/** ふだんの表示。盤面と数字だけ */
const SIMPLE_VIEW: ViewOptions = {
  heatmap: false,
  arrows: false,
  targets: false,
  lanes: false,
  positions: true,
  pcLabels: false,
  contribution: false,
  ball: false,
  names: true,
};

/** 「くわしく見る」の初期表示 */
const DETAIL_VIEW: ViewOptions = {
  heatmap: true,
  arrows: true,
  targets: true,
  lanes: false,
  positions: true,
  pcLabels: false,
  contribution: true,
  ball: true,
  names: false,
};

type Phase = 'attack' | 'defense';

const HISTORY_LIMIT = 40;
/** ラインの上げ下げ1回ぶん [m] */
const LINE_STEP = 3;

/** 画面幅がしきい値以下か。スマホではピッチを縦向きにする */
const useNarrow = (query = '(max-width: 640px)') => {
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return narrow;
};

const signed = (n: number, d = 2) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(d);

interface Props {
  board: BoardState;
  onBoardChange: (next: BoardState) => void;
  /** 戦術提案やマイ戦術から渡ってきた場合の説明 */
  seededFrom: string | null;
  /** 名前が入っている登録選手（未ログインなら空） */
  squad: SquadPlayer[];
  profile: UserProfile | null;
  onSaved: (tacticId: string) => void;
  onLogin: () => void;
}

interface Snapshot {
  board: BoardState;
  score: number;
  phase: Phase;
}

export default function BoardPage({
  board,
  onBoardChange,
  seededFrom,
  squad,
  profile,
  onSaved,
  onLogin,
}: Props) {
  const [detail, setDetail] = useState(false);
  const vertical = useNarrow();
  const [detailView, setDetailView] = useState<ViewOptions>(DETAIL_VIEW);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const history = useRef<Snapshot[]>([]);
  /** 履歴は ref に持つので、変わったことを画面に伝えるためのカウンタ */
  const [, setHistoryTick] = useState(0);
  /** この相手に対して、これまでで一番良かった配置（局面ごと） */
  const [best, setBest] = useState<{
    key: string;
    attack?: { score: number; home: Player[] };
    defense?: { score: number; home: Player[] };
  }>({ key: '' });

  useEffect(() => {
    setSelectedId(null);
    history.current = [];
    setHistoryTick((n) => n + 1);
  }, [seededFrom]);

  const possessor = board.params.possessionTeam;
  const phase: Phase = possessor === 'home' ? 'attack' : 'defense';
  const home = useMemo(() => teamOf(board.players, 'home'), [board.players]);
  const away = useMemo(() => teamOf(board.players, 'away'), [board.players]);
  const homeShape = useMemo(() => shapeOf(home), [home]);
  const awayShape = useMemo(() => shapeOf(away), [away]);
  const otherShape = useMemo(
    () => (board.homeOther ? shapeOf(board.homeOther) : homeShape),
    [board.homeOther, homeShape],
  );

  const evaluation = useMemo(
    () => evaluateBoard(board.players, board.ball, board.params),
    [board.players, board.ball, board.params],
  );
  const points = useMemo(
    () => controlPoints(board.players, board.ball, board.params),
    [board.players, board.ball, board.params],
  );
  const holderAverage = useMemo(
    () => averageOverHolders(board.players, board.ball, board.params),
    [board.players, board.ball, board.params],
  );
  const score = holderAverage.mean;
  /** 攻撃時は大きいほど、守備時（相手の値）は小さいほど良い */
  const better = useCallback((a: number, b: number) => (phase === 'attack' ? a > b : a < b), [phase]);

  /* ── ベストの記録。相手や条件が変わったら比べられないので捨てる ── */
  const bestKey = useMemo(
    () =>
      [
        away.map((p) => `${p.position}${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)}`).join('|'),
        board.params.homeStyle,
        board.params.awayStyle,
        board.params.scene,
        board.params.valueModel,
        // 選手を入れ替えたら別のチームなので、比べ直す
        home.map(personKey).sort().join(','),
      ].join('/'),
    [away, home, board.params.homeStyle, board.params.awayStyle, board.params.scene, board.params.valueModel],
  );
  useEffect(() => {
    setBest((b) => {
      const base = b.key === bestKey ? b : { key: bestKey };
      const cur = base[phase];
      if (cur && !better(score, cur.score)) return base;
      return { ...base, [phase]: { score, home } };
    });
  }, [bestKey, phase, score, home, better]);

  /*
   * ── 変更の出口。record を呼んでから変えると「1つ戻す」で戻れる ──
   * 選手をタップしただけ（何も変えていない）でも呼ばれるので、
   * 「いまの盤面と同じ記録」は無いものとして扱う。
   */
  const record = useCallback(() => {
    const top = history.current[history.current.length - 1];
    if (top?.board === board) return;
    history.current.push({ board, score, phase });
    if (history.current.length > HISTORY_LIMIT) history.current.shift();
  }, [board, score, phase]);

  /** 直前の操作を始める前の盤面（「1つ前より」の基準と、「1つ戻す」の戻り先） */
  const previous = [...history.current].reverse().find((h) => h.board !== board);

  const undo = () => {
    while (history.current.length) {
      const last = history.current.pop()!;
      if (last.board === board) continue;
      setSelectedId(null);
      onBoardChange(last.board);
      break;
    }
    setHistoryTick((n) => n + 1);
  };

  const update = useCallback(
    (patch: Partial<BoardState>) => onBoardChange({ ...board, ...patch }),
    [board, onBoardChange],
  );

  /** 自チームの11人だけを差し替える */
  const withHome = useCallback(
    (nextHome: Player[]): Player[] => {
      const queue = [...nextHome];
      return board.players.map((p) => (p.team === 'home' ? (queue.shift() ?? p) : p));
    },
    [board.players],
  );

  /** ドラッグ中の移動。置いた場所で組めないポジションなら、その場所のポジションへ切り替える */
  const movePlayer = useCallback(
    (id: string, raw: Vec2) => {
      const pos = clampToPitch(raw);
      update({
        players: board.players.map((p) => {
          if (p.id !== id) return p;
          const position = correctPosition(pos, p.team, p.position);
          if (position === p.position) return { ...p, pos };
          // 登録選手が入っていない枠は、ポジションに合わせてプレースタイルも既定に替える
          const skills = p.squadId
            ? {}
            : {
                attackSkill: DEFAULT_SKILLS[position].attack,
                defenseSkill: DEFAULT_SKILLS[position].defense,
              };
          return { ...p, pos, position, ...skills };
        }),
      });
    },
    [board.players, update],
  );

  const moveBall = useCallback((pos: Vec2) => update({ ball: clampToPitch(pos) }), [update]);

  const setPhase = useCallback(
    (next: Phase) => {
      if (next === phase) return;
      record();
      setSelectedId(null);
      const incoming = board.homeOther ?? home.map((p) => ({ ...p }));
      onBoardChange({
        ...board,
        players: [...incoming, ...away],
        homeOther: home,
        params: { ...board.params, possessionTeam: next === 'attack' ? 'home' : 'away' },
      });
    },
    [phase, record, board, home, away, onBoardChange],
  );

  const setParams = useCallback(
    (patch: Partial<Params>) => {
      // 保持の切り替えは局面の切り替えなので、配置の入れ替えも一緒に行う
      if (patch.possessionTeam && patch.possessionTeam !== possessor) {
        setPhase(patch.possessionTeam === 'home' ? 'attack' : 'defense');
        return;
      }
      record();
      update({ params: { ...board.params, ...patch } });
    },
    [board.params, possessor, record, setPhase, update],
  );

  const patchPlayer = useCallback(
    (id: string, patch: Partial<Player>) => {
      record();
      update({ players: board.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
    },
    [board.players, record, update],
  );

  const applyFormation = useCallback(
    (team: TeamId, formationId: string, line?: number) => {
      record();
      const useLine = line ?? (team === 'home' ? board.homeLine : board.awayLine);
      let players = withFormation(board.players, team, formationId, useLine).map((p) =>
        // 登録選手が入っていない枠は、新しいポジションの既定のプレースタイルにする
        p.team === team && !p.squadId
          ? {
              ...p,
              attackSkill: DEFAULT_SKILLS[p.position].attack,
              defenseSkill: DEFAULT_SKILLS[p.position].defense,
            }
          : p,
      );
      if (team === 'home') {
        // 同じ11人を、新しい形で一番合う枠へ並べ直す
        const eleven = teamOf(players, 'home');
        const same = squadIn(eleven, squad);
        if (same) {
          const queue = assignSquad(eleven, same);
          players = players.map((p) => (p.team === 'home' ? (queue.shift() ?? p) : p));
        }
      }
      setSelectedId(null);
      update({
        players,
        ...(team === 'home'
          ? { homeFormation: formationId, homeLine: useLine }
          : { awayFormation: formationId, awayLine: useLine }),
      });
    },
    [board.players, board.homeLine, board.awayLine, record, squad, update],
  );

  /** 登録選手を、いまの形で一番合う枠に並べる（もう一方の局面も同じ11人で並べ直す） */
  const autoFill = useCallback(
    (withRecord: boolean) => {
      if (squad.length < 11) return;
      if (withRecord) record();
      const eleven = assignSquad(home, squad);
      const picked = squadIn(eleven, squad);
      update({
        players: withHome(eleven),
        homeOther: board.homeOther && picked ? assignSquad(board.homeOther, picked) : board.homeOther,
      });
    },
    [squad, record, home, update, withHome, board.homeOther],
  );

  // まっさらな盤面（誰も入っていない）を開いたら、登録選手を並べておく
  const pristine = home.every((p) => !p.squadId && !p.name);
  useEffect(() => {
    if (pristine && squad.length >= 11) autoFill(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pristine, squad.length]);

  const swapIn = (slotId: string, squadId: string) => {
    const sp = squad.find((x) => x.id === squadId);
    if (!sp) return;
    record();
    const next = putSquadPlayer(home, board.homeOther, slotId, sp);
    update({ players: withHome(next.eleven), homeOther: next.other });
  };

  const moveLine = (dx: number) => {
    record();
    update({ players: withHome(shiftLine(home, dx)) });
  };

  const reset = () => {
    record();
    setSelectedId(null);
    onBoardChange(initialState());
  };

  const restoreBest = () => {
    const b = best[phase];
    if (!b) return;
    record();
    setSelectedId(null);
    update({ players: withHome(b.home) });
  };

  const selected = board.players.find((p) => p.id === selectedId) ?? null;
  const unit = scoreUnit(board.params.valueModel);
  const delta = previous && previous.phase === phase ? score - previous.score : null;
  const deltaGood =
    delta !== null && Math.abs(delta) >= 0.005 ? better(score, previous!.score) : null;
  const bestNow = best.key === bestKey ? best[phase] : undefined;
  const atBest = !bestNow || Math.abs(bestNow.score - score) < 0.005 || better(score, bestNow.score);

  /* ── 保存 ── */
  const lineups = phaseLineups(board);
  const defaultTitle = `対${awayShape.name} ${shapeOf(lineups.attack).name}/${shapeOf(lineups.defense).name}`;

  return (
    <div className="space-y-4">
      {seededFrom && (
        <Notice>
          <b className="text-slate-200">{seededFrom}</b> を読み込みました。ここから自由に動かして試せます。
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0 space-y-3">
          {/* 局面の切り替えと、たった1つの数字 */}
          <section className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 rounded-2xl border border-edge bg-panel px-4 py-4 sm:px-5">
            <div className="min-w-0 space-y-3">
              <div
                className="inline-flex rounded-xl border border-edge bg-panel2 p-1"
                role="tablist"
                aria-label="局面"
              >
                {(
                  [
                    { id: 'attack', label: '攻撃のとき' },
                    { id: 'defense', label: '守備のとき' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={phase === t.id}
                    onClick={() => setPhase(t.id)}
                    className={`rounded-lg px-4 py-2 text-[13px] font-bold transition-colors ${
                      phase === t.id ? 'bg-team text-team-ink' : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                <div>
                  <div className="text-[10px] font-bold tracking-[0.14em] text-slate-500">自分の形</div>
                  <div className="numeral-solid text-[40px] text-team" data-testid="board-home-shape">
                    {homeShape.name}
                  </div>
                </div>
                <div className="pb-1 font-display text-[22px] text-slate-600">VS</div>
                <div>
                  <div className="text-[10px] font-bold tracking-[0.14em] text-slate-500">相手の形</div>
                  <div className="numeral-solid text-[40px] text-away" data-testid="board-away-shape">
                    {awayShape.name}
                  </div>
                </div>
              </div>
              {!homeShape.formationId && (
                <p className="text-[11px] text-amber-300">
                  この人数配分は eFootball のエディットでは組めません（試すことはできます）。
                </p>
              )}
            </div>

            <div className="min-w-[220px] flex-1 text-right">
              <div className="text-[12px] font-bold tracking-[0.08em] text-slate-300">
                {phase === 'attack' ? 'ビルドアップ期待値' : '相手のビルドアップ期待値'}
              </div>
              <div className="flex items-end justify-end gap-3">
                {deltaGood !== null && delta !== null && (
                  <span
                    className={`mb-2 rounded-full px-2.5 py-1 font-mono text-[12px] font-bold ${
                      deltaGood ? 'bg-team/15 text-team' : 'bg-[#ff3b5c]/15 text-[#ff8097]'
                    }`}
                    data-testid="board-delta"
                    title="直前の操作の前との差"
                  >
                    {deltaGood ? '▲' : '▼'} {signed(delta)}
                  </span>
                )}
                <span
                  className={`${phase === 'attack' ? 'numeral' : 'numeral-solid text-slate-100'} text-[84px]`}
                  data-testid="board-score"
                >
                  {signed(score)}
                </span>
                {unit && <span className="mb-3 text-[13px] text-slate-400">{unit}</span>}
              </div>
              <div className="text-[11px] text-slate-500">
                {phase === 'attack'
                  ? '大きいほど、ボールを前に運びやすい配置です'
                  : '小さいほど、相手に運ばせない配置です'}
              </div>
              {bestNow && (
                <div className="mt-1.5 flex items-center justify-end gap-2 text-[11px] text-slate-400">
                  <span>
                    この相手でのベスト <b className="font-mono text-slate-200">{signed(bestNow.score)}</b>
                  </span>
                  {atBest ? (
                    <span className="rounded-full bg-team/15 px-2 py-0.5 font-bold text-team">いまがベスト</span>
                  ) : (
                    <button
                      type="button"
                      onClick={restoreBest}
                      className="font-bold text-team underline underline-offset-2"
                    >
                      ベストに戻す
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          <Pitch
            players={board.players}
            ball={board.ball}
            evaluation={evaluation}
            view={detail ? detailView : SIMPLE_VIEW}
            selectedId={selectedId}
            homePoints={points.homePoints}
            awayPoints={points.awayPoints}
            lambda={board.params.lambda}
            onSelect={setSelectedId}
            onMovePlayer={movePlayer}
            onMoveBall={moveBall}
            onGestureStart={record}
            vertical={vertical}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={undo} disabled={!previous}>
              ← 1つ戻す
            </Button>
            <Button onClick={() => moveLine(-LINE_STEP)}>ラインを下げる</Button>
            <Button onClick={() => moveLine(LINE_STEP)}>ラインを上げる</Button>
            <span className="flex-1" />
            <Button tone={detail ? 'primary' : undefined} onClick={() => setDetail((v) => !v)}>
              {detail ? 'くわしい表示を閉じる' : 'くわしく見る'}
            </Button>
            <Button onClick={reset}>はじめから</Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-team" />
              自分（{vertical ? '上' : '右'}へ攻める）
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-away" />
              相手（{vertical ? '下' : '左'}へ攻める）
            </span>
            <span>選手はドラッグで動かせます。置いた場所に合わせてポジションが変わります。</span>
          </div>

          {detail && (
            <>
              <ScorePanel
                evaluation={evaluation}
                total={score}
                title={phase === 'attack' ? 'ビルドアップ期待値（起点平均）' : '相手の期待前進値（起点平均）'}
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
            </>
          )}
        </main>

        <aside className="min-w-0 space-y-3">
          <SelectedCard
            selected={selected}
            squad={squad}
            home={home}
            onSwap={swapIn}
            onPosition={(id, position) => patchPlayer(id, { position })}
          />

          <details className="group rounded-2xl border border-edge bg-panel" open>
            <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-4 py-3 text-[13px] font-bold text-slate-100">
              自分の形を選ぶ
              <span className="font-mono text-[12px] text-team">{homeShape.name}</span>
            </summary>
            <div className="space-y-4 border-t border-edge px-4 py-4">
              <FormationPicker
                label={phase === 'attack' ? '自分の形（攻撃のとき）' : '自分の形（守備のとき）'}
                positions={home.map((p) => p.position)}
                onChange={(id) => applyFormation('home', id)}
                compact
                testId="board-home-picker"
              />
              <Select
                label="自分のチームスタイル"
                value={board.params.homeStyle}
                options={TEAM_STYLES.map((s) => ({ value: s.id, label: s.label }))}
                onChange={(v) => setParams({ homeStyle: v })}
              />
              {squad.length >= 11 && (
                <Button onClick={() => autoFill(true)}>選手をおまかせで並べ直す</Button>
              )}
              <p className="text-[11px] leading-relaxed text-slate-500">
                {phase === 'attack' ? '守備のとき' : '攻撃のとき'}の形は{' '}
                <b className="font-mono text-slate-300">{otherShape.name}</b>{' '}
                です。上の切り替えで、同じ11人のまま別の形を組めます。
              </p>
            </div>
          </details>

          <details className="group rounded-2xl border border-edge bg-panel">
            <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-4 py-3 text-[13px] font-bold text-slate-100">
              相手の形を選ぶ
              <span className="font-mono text-[12px] text-away">{awayShape.name}</span>
            </summary>
            <div className="space-y-4 border-t border-edge px-4 py-4">
              <FormationPicker
                label="相手の形"
                positions={away.map((p) => p.position)}
                onChange={(id) => applyFormation('away', id)}
                compact
                testId="board-away-picker"
              />
              <Select
                label="相手のチームスタイル"
                value={board.params.awayStyle}
                options={TEAM_STYLES.map((s) => ({ value: s.id, label: s.label }))}
                onChange={(v) => setParams({ awayStyle: v })}
              />
            </div>
          </details>

          {profile ? (
            <SaveCard
              key={board.tacticId ?? 'new'}
              defaultTitle={defaultTitle}
              onSave={async (title) => {
                const t = await createTactic({
                  title,
                  payload: boardPayload(board, squad),
                  authorName: profile.userName,
                  teamColor: profile.teamColor,
                });
                onBoardChange({ ...board, tacticId: t.id, tacticTitle: t.title });
                onSaved(t.id);
              }}
              onOverwrite={
                board.tacticId
                  ? async () => {
                      await updateTactic(board.tacticId!, { payload: boardPayload(board, squad) });
                    }
                  : undefined
              }
              overwriteTitle={board.tacticTitle}
            />
          ) : (
            <section className="rounded-2xl border border-edge bg-panel p-4">
              <div className="text-[13px] font-bold text-slate-100">この戦術を残す</div>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                ログインすると、作った戦術を保存して、リンクや画像で共有できます。自分の選手を並べて試すこともできます。
              </p>
              <div className="mt-3">
                <Button tone="primary" onClick={onLogin}>
                  ログインして保存する
                </Button>
              </div>
            </section>
          )}

          {detail && (
            <ControlPanel
              params={board.params}
              view={detailView}
              selected={selected}
              homeFormation={board.homeFormation}
              awayFormation={board.awayFormation}
              homeLine={board.homeLine}
              awayLine={board.awayLine}
              onParams={setParams}
              onView={(patch) => setDetailView((v) => ({ ...v, ...patch }))}
              onPlayer={patchPlayer}
              onPos={(id, x, y) => movePlayer(id, { x, y })}
              onFormation={applyFormation}
              onReset={reset}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** 選んだ選手の入れ替えとポジション変更 */
function SelectedCard({
  selected,
  squad,
  home,
  onSwap,
  onPosition,
}: {
  selected: Player | null;
  squad: SquadPlayer[];
  home: Player[];
  onSwap: (slotId: string, squadId: string) => void;
  onPosition: (id: string, position: PositionId) => void;
}) {
  if (!selected) {
    return (
      <section className="rounded-2xl border border-dashed border-edge px-4 py-4 text-[12px] leading-relaxed text-slate-400">
        <b className="text-slate-200">選手を動かしてみましょう。</b>
        <br />
        ドラッグで位置を変えると、期待値がすぐに変わります。選手をタップすると、入れ替えやポジションの変更ができます。
      </section>
    );
  }

  const isHome = selected.team === 'home';
  const options = allowedAt(selected.pos, selected.team);
  const sp = selected.squadId ? squad.find((x) => x.id === selected.squadId) : undefined;
  const apt = sp ? aptitudeOf(sp, selected.position) : null;
  const fit = sp ? playerFit(sp, selected.position) : 0;
  const starters = new Set(home.map((p) => p.squadId).filter(Boolean));

  return (
    <section className="space-y-3 rounded-2xl border border-team/50 bg-panel p-4" data-testid="board-selected">
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-[13px] font-bold"
          style={
            isHome
              ? { background: 'var(--team-hex)', color: 'var(--team-ink)' }
              : { background: 'var(--away-hex)', color: '#141218' }
          }
        >
          {selected.number}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold text-slate-100">
            {selected.name || (isHome ? `自分の${selected.number}番` : `相手の${selected.number}番`)}
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            <span data-testid="board-selected-position">{selected.position}</span>
            {apt && (
              <span
                className={`ml-2 rounded px-1.5 py-0.5 font-sans text-[10px] ${
                  apt === 'off' && fit < 70
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-emerald-500/15 text-emerald-300'
                }`}
              >
                {apt === 'main'
                  ? '本職'
                  : apt === 'sub'
                    ? '適性ポジション'
                    : fit >= 70
                      ? '近いポジション'
                      : '専門外'}
              </span>
            )}
          </div>
        </div>
      </div>

      {isHome && squad.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-[12px] text-slate-300">この枠の選手</span>
          <select
            id="board-slot-player"
            className="w-full"
            value={selected.squadId ?? ''}
            onChange={(e) => e.target.value && onSwap(selected.id, e.target.value)}
          >
            {!selected.squadId && <option value="">選手を選ぶ</option>}
            <optgroup label="スタメン（選ぶと枠を交換）">
              {squad
                .filter((x) => starters.has(x.id))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}（{x.position}）
                  </option>
                ))}
            </optgroup>
            <optgroup label="控え（選ぶと交代）">
              {squad
                .filter((x) => !starters.has(x.id))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}（{x.position}）
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
      )}

      {options.length > 1 && (
        <div>
          <div className="mb-1 text-[12px] text-slate-300">この場所で組めるポジション</div>
          <div className="flex flex-wrap gap-1.5">
            {options.map((pos) => (
              <button
                key={pos}
                type="button"
                aria-pressed={pos === selected.position}
                onClick={() => pos !== selected.position && onPosition(selected.id, pos)}
                className={`rounded-lg border px-3 py-1.5 font-mono text-[12px] font-bold transition-colors ${
                  pos === selected.position
                    ? 'border-team bg-team text-team-ink'
                    : 'border-edge text-slate-300 hover:border-team/60'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
