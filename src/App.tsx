import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ControlPanel from './components/ControlPanel';
import FormationCompare from './components/FormationCompare';
import HolderBreakdown from './components/HolderBreakdown';
import Pitch from './components/Pitch';
import ScorePanel from './components/ScorePanel';
import { Button } from './components/ui';
import { DEFAULT_PARAMS, STORAGE_KEY } from './constants';
import { resetSkills, withFormation } from './data/formations';
import { SCENES, STYLE_PHASE_LABEL, styleById, stylePhaseKey } from './data/styles';
import { controlPoints, evaluateBoard } from './logic/evaluate';
import { averageOverHolders } from './logic/holderAverage';
import { clampToPitch, dist, findHolder } from './logic/vectors';
import { SCENE_PRESETS, initialState } from './presets';
import type { BoardState, Params, Player, TeamId, Vec2, ViewOptions } from './types';

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

const loadSaved = (): BoardState | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BoardState;
    if (!Array.isArray(parsed.players) || parsed.players.length === 0) return null;
    if (!parsed.players[0].position) return null; // 旧バージョンのデータは捨てる
    return { ...parsed, params: { ...DEFAULT_PARAMS, ...parsed.params } };
  } catch {
    return null;
  }
};

export default function App() {
  const [board, setBoard] = useState<BoardState>(() => loadSaved() ?? initialState());
  const [view, setView] = useState<ViewOptions>(DEFAULT_VIEW);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<string>(SCENE_PRESETS[0].id);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ---- 自動保存 ---- */
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
      } catch {
        /* 保存できなくても動作には影響しない */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [board]);

  /* ---- 計算 ---- */
  const evaluation = useMemo(
    () => evaluateBoard(board.players, board.ball, board.params),
    [board],
  );
  const points = useMemo(() => controlPoints(board.players, board.ball, board.params), [board]);
  const holderAverage = useMemo(
    () => averageOverHolders(board.players, board.ball, board.params),
    [board],
  );
  const passDistances = useMemo(
    () =>
      evaluation.players
        .filter((e) => !e.excluded)
        .map((e) => ({ number: e.number, d: e.passDistance })),
    [evaluation],
  );

  /* ---- 操作 ---- */
  const movePlayer = useCallback((id: string, pos: Vec2) => {
    setBoard((b) => ({
      ...b,
      players: b.players.map((p) => (p.id === id ? { ...p, pos: clampToPitch(pos) } : p)),
    }));
  }, []);

  const moveBall = useCallback((pos: Vec2) => {
    setBoard((b) => ({ ...b, ball: clampToPitch(pos) }));
  }, []);

  const setParams = useCallback((patch: Partial<Params>) => {
    setBoard((b) => ({ ...b, params: { ...b.params, ...patch } }));
  }, []);

  /** 特性は常に維持する。ポジションを変えても勝手に差し替えない。 */
  const patchPlayer = useCallback((id: string, patch: Partial<Player>) => {
    setBoard((b) => ({
      ...b,
      players: b.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }, []);

  /** フォーメーション変更：座標とポジションだけ差し替え、特性は引き継ぐ */
  const applyFormation = useCallback((team: TeamId, formationId: string, line: number) => {
    setBoard((b) => ({
      ...b,
      players: withFormation(b.players, team, formationId, line),
      ...(team === 'home'
        ? { homeFormation: formationId, homeLine: line }
        : { awayFormation: formationId, awayLine: line }),
    }));
  }, []);

  const restoreSkills = useCallback((team: TeamId) => {
    setBoard((b) => ({ ...b, players: resetSkills(b.players, team) }));
  }, []);

  /** ボールを保持側の最寄り選手の足元へ移す */
  const snapBallToPossessor = useCallback(() => {
    setBoard((b) => {
      const id = findHolder(b.players, b.ball, b.params.possessionTeam);
      const holder = b.players.find((p) => p.id === id);
      return holder ? { ...b, ball: { ...holder.pos } } : b;
    });
  }, []);

  const applyPreset = useCallback((id: string) => {
    const preset = SCENE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    setBoard(preset.build());
    setSelectedId(null);
  }, []);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buildup-scene-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [board]);

  const importJson = useCallback(() => fileRef.current?.click(), []);

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((txt) => {
        const parsed = JSON.parse(txt) as BoardState;
        if (!Array.isArray(parsed.players) || !parsed.players[0]?.position) {
          throw new Error('形式が不正です');
        }
        setBoard({ ...parsed, params: { ...DEFAULT_PARAMS, ...parsed.params } });
        setSelectedId(null);
      })
      .catch(() => window.alert('JSON を読み込めませんでした。'));
    e.target.value = '';
  }, []);

  const selected = board.players.find((p) => p.id === selectedId) ?? null;
  const preset = SCENE_PRESETS.find((p) => p.id === presetId);
  const scene = SCENES.find((s) => s.id === board.params.scene) ?? SCENES[0];
  const possessor = board.params.possessionTeam;
  const homeKey = stylePhaseKey(board.params.scene, 'home', possessor);
  const awayKey = stylePhaseKey(board.params.scene, 'away', possessor);

  /**
   * ボールが保持側ではなく相手側の選手に明らかに近いなら、局面として不自然。
   * 同じくらいの距離（競り合い）は不自然としない。
   */
  const ballMismatch = useMemo(() => {
    // 起点平均モードでは各サブ評価が保持側の足元にボールを置くので、この警告は不要
    if (board.params.holderMode === 'averageOutfield') return false;
    let mine = Infinity;
    let theirs = Infinity;
    for (const p of board.players) {
      const d = dist(p.pos, board.ball);
      if (p.team === possessor) mine = Math.min(mine, d);
      else theirs = Math.min(theirs, d);
    }
    return theirs < mine - 0.5;
  }, [board.players, board.ball, possessor, board.params.holderMode]);

  const averaged = board.params.holderMode === 'averageOutfield';
  const headlineTotal = averaged ? holderAverage.mean : evaluation.total;

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
    <div className="mx-auto min-h-screen max-w-[1500px] px-4 py-4 lg:px-6">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">ビルドアップ評価戦術ボード</h1>
          <p className="text-[12px] text-slate-500">
            選手・ボールをドラッグ → 到達領域と支配率から期待前進値をリアルタイム算出
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SCENE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={`rounded-md border px-2.5 py-1.5 text-[12px] transition-colors ${
                p.id === presetId
                  ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                  : 'border-edge bg-panel2 text-slate-400 hover:bg-[#243040]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {preset && <p className="mb-3 text-[12px] text-slate-500">{preset.desc}</p>}

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-edge bg-panel2/50 px-3 py-2 text-[12px]">
        <span className="font-medium text-slate-300">
          {possessor === 'home' ? '自チームが攻撃' : '自チームが守備'} ／ {scene.label}
        </span>
        {teamSummary('home', board.homeFormation, board.params.homeStyle, homeKey)}
        {teamSummary('away', board.awayFormation, board.params.awayStyle, awayKey)}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
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
            <span>
              評価対象＝{TEAM_LABEL[possessor]}（保持側・攻撃時特性が発動）／ 反対側は守備時特性
            </span>
            <span>丸の色＝到達地点の PC（赤 0.0 → 緑 1.0）</span>
          </div>

          <ScorePanel
            evaluation={evaluation}
            total={headlineTotal}
            title={
              possessor === 'home'
                ? averaged
                  ? 'ビルドアップ期待値（起点平均）'
                  : 'ビルドアップ期待値'
                : averaged
                  ? '相手の期待前進値（起点平均）'
                  : '相手の期待前進値（許した前進）'
            }
            subtitle={`${
              averaged
                ? `(1/${holderAverage.count}) Σ_起点 Σ_i ( ${board.params.passWeightEnabled ? 'w_i × ' : ''}PC_i × ΔX_i )`
                : `Σ ( ${board.params.passWeightEnabled ? 'w_i × ' : ''}PC_i × ΔX_i )`
            }${
              board.params.passWeightEnabled
                ? `　w: μ=${board.params.passMu}m σ=${board.params.passSigma}m`
                : '　距離の重みなし'
            }`}
            breakdownNote={
              averaged
                ? `下の内訳は「現在のボール位置（x ${board.ball.x.toFixed(0)}, y ${board.ball.y.toFixed(0)}）」1点での中身です。上のスコアは GK 以外 ${holderAverage.count} 人ぶんの平均なので一致しません。`
                : undefined
            }
          />

          <HolderBreakdown
            average={holderAverage}
            team={possessor}
            active={averaged}
            currentBall={board.ball}
            onFocus={moveBall}
          />

          <FormationCompare
            board={board}
            onApply={(id) => applyFormation('home', id, board.homeLine)}
          />

          <details className="rounded-lg border border-edge bg-panel2/40 p-3 text-[12px] leading-relaxed text-slate-400">
            <summary className="cursor-pointer text-slate-300">計算モデルの要約</summary>
            <div className="mt-2 space-y-2">
              <p>
                <b className="text-slate-200">暫定到達領域</b> ＝ 基本座標 ＋ チームスタイル係数 ＋
                選手特性係数。係数は「攻撃方向 / 外側（幅） / ボール方向 / 自陣方向 / 相手ゴール中央」の
                5基底の合成です。
              </p>
              <p>
                <b className="text-slate-200">ボール保持</b> の切り替えで攻守が入れ替わります。
                保持側は攻撃時特性、非保持側は守備時特性が発動し、期待前進値も保持側の攻撃方向で
                算出されます。<b className="text-slate-200">チームスタイル</b> は4局面ぶんの係数を持ち、
                保持の別と「シーン」セレクタの組み合わせで適用される列が決まります。
              </p>
              <p>
                <b className="text-slate-200">PC_i</b> ＝ そのパスの成功確率。各選手の影響力を{' '}
                <code className="font-mono text-slate-300">w = exp(-d / λ)</code> とし、
                保持側の合計 /（保持側＋守備側の合計）で 0.0〜1.0 に正規化します。
              </p>
              <p>
                <b className="text-slate-200">パスコース評価</b>：到達地点だけでなく、
                ボールから到達地点までの線分をサンプリングして最も低い PC（ボトルネック）を採ります。
                その際、守備側の影響力にインターセプト可能性係数{' '}
                <code className="font-mono text-slate-300">I = 1 − loft(L)(1 − 4(x/L − 0.5)²)</code>{' '}
                を掛けます。短いパスは全区間 I = 1 でコース上の敵を全員数え、長いパスは中間地点で
                I → 0 となって頭上を越えた敵が無視されます。キック直後と落下地点は距離によらず I = 1 です。
              </p>
              <p>
                <b className="text-slate-200">期待前進値</b> ＝ Σ (w_i × PC_i × ΔX_i)。
                ΔX_i はボール現在地から到達地点への距離を保持側の攻撃方向に射影した値（負値も許容）。
                ボールホルダー（ボールに最も近い保持側の選手）は総和から除外します。
                パスカット判定は意図的に含めていません。
              </p>
              <p>
                <b className="text-slate-200">起点平均</b>：保持側の GK 以外の各選手を順に
                ボールホルダーに置いて上の総和を計算し、その平均をスコアとします。
                ボールをどこに置いたかに左右されない配置そのものの評価になり、
                フォーメーション比較もボール位置に依存しなくなります。
                「現在のボール位置だけ」に切り替えれば従来どおり1点で評価します。
              </p>
              <p>
                <b className="text-slate-200">w_i</b> ＝ exp(−(d_i − μ)² / 2σ²) はパス距離の重み。
                d_i はボール現在地から到達地点までの<b className="text-slate-200">直線距離</b>（＝パスの飛距離）で、
                前進量 ΔX_i とは別の量です。μ 付近の距離のパスを最も高く評価し、
                足元すぎるパスと無理な超ロングパスを同時に減点します。
                重みを切れば w = 1 となり従来の式に戻ります。
              </p>
            </div>
          </details>
        </main>

        <aside className="lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
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
            onResetSkills={restoreSkills}
            onSnapBall={snapBallToPossessor}
            ballMismatch={ballMismatch}
            passDistances={passDistances}
            holderCount={holderAverage.count}
            onReset={() => applyPreset(presetId)}
            onExport={exportJson}
            onImport={importJson}
          />
          <div className="mt-3 flex justify-end">
            <Button onClick={() => setView(DEFAULT_VIEW)}>表示を既定に戻す</Button>
          </div>
        </aside>
      </div>

      <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onFile} />
    </div>
  );
}
