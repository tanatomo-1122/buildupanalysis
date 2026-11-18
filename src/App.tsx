import { useCallback, useEffect, useState } from 'react';
import type { Session } from './api/auth';
import { initAuth, onSessionChange, signOut } from './api/auth';
import { blankSquad, loadMyProfile, loadSquad, usablePlayers } from './api/squad';
import type { Tactic } from './api/tactics';
import { Notice } from './components/ui';
import { DEFAULT_PARAMS } from './constants';
import BoardPage from './pages/BoardPage';
import ClubPage from './pages/ClubPage';
import HomePage from './pages/HomePage';
import MyTacticsPage from './pages/MyTacticsPage';
import RecommendPage from './pages/RecommendPage';
import type { BoardContext } from './pages/RecommendPage';
import SharedTacticPage from './pages/SharedTacticPage';
import SquadPage from './pages/SquadPage';
import { initialState } from './presets';
import { applyTeamColor, teamColorById } from './theme';
import type { BoardState, Player, SquadPlayer, UserProfile } from './types';

type Tab = 'home' | 'club' | 'squad' | 'recommend' | 'tactics' | 'board';

/** ログイン中に出すメニュー */
const TABS_IN: { id: Tab; label: string }[] = [
  { id: 'home', label: 'ホーム' },
  { id: 'recommend', label: '戦術提案' },
  { id: 'board', label: '戦術ボード' },
  { id: 'tactics', label: 'マイ戦術' },
  { id: 'squad', label: '選手' },
];

/** 未ログインのときのメニュー。戦術ボードはログインなしでも触れる */
const TABS_OUT: { id: Tab; label: string }[] = [
  { id: 'home', label: 'ホーム' },
  { id: 'board', label: '戦術ボード' },
  { id: 'club', label: 'ログイン' },
];

/** 盤面へ渡すもの。提案結果からも、保存した戦術からも作れる */
export interface BoardSeed {
  lineup: Player[];
  formationId: string;
  label: string;
  ctx: BoardContext;
  /** lineup がどちらの局面の配置か（既定は攻撃時） */
  phase?: 'attack' | 'defense';
  /** もう一方の局面の11人（あれば、ボードで攻守を切り替えられる） */
  other?: Player[];
  /** マイ戦術から開いたとき、上書き保存に使う */
  tacticId?: string;
  tacticTitle?: string;
}

const sharedIdFromUrl = () => new URLSearchParams(location.search).get('t');

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [squad, setSquad] = useState<SquadPlayer[]>(() => blankSquad());
  const [squadState, setSquadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardState>(() => initialState());
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  const [focusTactic, setFocusTactic] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(sharedIdFromUrl);
  /** ログイン後、最初の選手読み込みが終わったか（それまではクラブ画面を出さずに待つ） */
  const [booted, setBooted] = useState(false);

  /* 起動：ログインから戻ってきたトークンの取り込み、または保存済みセッションの復元 */
  useEffect(() => {
    const off = onSessionChange(setSession);
    initAuth().then(({ session: s, error }) => {
      setSession(s);
      if (!s) applyTeamColor(null);
      if (error) setAuthError(error);
      setAuthReady(true);
    });
    return off;
  }, []);

  /* ログインしたら自分のクラブを読む */
  useEffect(() => {
    if (!session) {
      setProfile(null);
      setSquad(blankSquad());
      setSquadState('idle');
      // 起動直後（セッション確認前）は前回の色を残す。ログアウトしたときだけ既定色に戻す
      if (authReady) applyTeamColor(null);
      return;
    }
    let cancelled = false;
    setLoadError(null);
    loadMyProfile(session.user.name)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        applyTeamColor(p.teamColor);
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* クラブが決まったら選手を読む（引き継ぎでクラブが変わったときも読み直す） */
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setSquadState('loading');
    loadSquad(profile.id)
      .then((s) => {
        if (cancelled) return;
        setSquad(s);
        setSquadState('ready');
        setBooted(true);
        // ログイン画面から来た直後なら、選手がそろっていれば提案から、まだなら選手登録から始める
        setTab((t) => (t === 'club' ? (usablePlayers(s).length >= 11 ? 'recommend' : 'squad') : t));
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setSquadState('error');
        setBooted(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateProfile = useCallback((p: UserProfile) => {
    setProfile(p);
    applyTeamColor(p.teamColor);
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setTab('home');
  }, []);

  /** 提案された布陣（または保存した戦術）を盤面に流し込む */
  const openBoard = useCallback((seed: BoardSeed) => {
    const { ctx } = seed;
    setBoard({
      players: [...seed.lineup, ...ctx.opponentPlayers],
      ball: { ...(seed.lineup.find((p) => p.position === 'CB')?.pos ?? seed.lineup[1].pos) },
      homeOther: seed.other,
      tacticId: seed.tacticId,
      tacticTitle: seed.tacticTitle,
      params: {
        ...DEFAULT_PARAMS,
        // 守備時の配置を開いたときは、相手がボールを持っている局面にする
        possessionTeam: seed.phase === 'defense' ? 'away' : 'home',
        scene: ctx.scene,
        homeStyle: ctx.homeStyle,
        awayStyle: ctx.opponentStyle,
        // 提案と盤面で物差しを揃える
        valueModel: ctx.valueModel,
      },
      homeFormation: seed.formationId,
      awayFormation: ctx.opponentFormation,
      homeLine: 0,
      awayLine: ctx.awayLine,
    });
    setSeededFrom(`${seed.label}（対 ${ctx.opponentLabel}）`);
    setTab('board');
  }, []);

  const openSavedOnBoard = useCallback(
    (t: Tactic, phase: 'attack' | 'defense') => {
      const p = t.payload;
      const f = phase === 'attack' ? p.attack : p.defense;
      const other = phase === 'attack' ? p.defense : p.attack;
      openBoard({
        lineup: f.lineup,
        other: other.lineup,
        phase,
        tacticId: t.id,
        tacticTitle: t.title,
        formationId: f.formationId,
        label: `「${t.title}」の${phase === 'attack' ? '攻撃時' : '守備時'}`,
        ctx: {
          homeStyle: p.homeStyle,
          opponentStyle: p.opponentStyle,
          opponentFormation: p.opponent.formationId,
          opponentLabel: p.opponent.label,
          opponentPlayers: p.opponent.players,
          scene: p.scene,
          awayLine: 8,
          valueModel: p.valueModel,
        },
      });
    },
    [openBoard],
  );

  const leaveShared = () => {
    history.replaceState(null, '', location.pathname);
    setSharedId(null);
    setTab('home');
  };

  const loggedIn = Boolean(session && profile);
  const color = teamColorById(profile?.teamColor);

  return (
    <div className="mx-auto min-h-screen max-w-[1500px] px-4 pb-16 pt-4 lg:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-edge pb-3">
        <button
          type="button"
          onClick={() => (sharedId ? leaveShared() : setTab('home'))}
          className="flex items-baseline gap-3 text-left"
          aria-label="MY XI ホーム"
        >
          <span className="numeral-solid text-[40px] text-team">MY XI</span>
          <span className="hidden text-[11px] font-bold tracking-[0.16em] text-slate-500 sm:inline">
            自分にしかない戦術を
          </span>
        </button>

        {!sharedId && (
          <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="メニュー">
            {(loggedIn ? TABS_IN : TABS_OUT).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`shrink-0 border-b-2 px-3 py-2 text-[13px] font-bold transition-colors ${
                  tab === t.id
                    ? 'border-team text-slate-50'
                    : 'border-transparent text-slate-500 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}

        {loggedIn && profile && (
          <button
            type="button"
            onClick={() => {
              if (sharedId) leaveShared();
              setTab('club');
            }}
            className="flex items-center gap-2 rounded-full border border-edge bg-panel py-1 pl-1 pr-3 text-[12px] text-slate-300 hover:border-team/60"
            title="クラブの設定"
          >
            <span
              className="grid h-7 w-7 place-items-center rounded-full font-display text-[16px] font-bold"
              style={{ background: color.hex, color: color.ink }}
            >
              {profile.userName.slice(0, 1).toUpperCase()}
            </span>
            <span className="max-w-[12em] truncate">{profile.userName}</span>
            <span className="text-[10px] text-slate-500">非公開</span>
          </button>
        )}
      </header>

      {loadError && (
        <div className="mb-4">
          <Notice tone="error">{loadError}</Notice>
        </div>
      )}

      {sharedId ? (
        <SharedTacticPage shareId={sharedId} ownColor={profile?.teamColor ?? null} onLeave={leaveShared} />
      ) : !authReady ? (
        <Notice>読み込んでいます…</Notice>
      ) : (
        <>
          {tab === 'home' && (
            <HomePage
              loggedIn={loggedIn}
              clubName={profile?.userName ?? null}
              squadCount={usablePlayers(squad).length}
              authError={authError}
              onRecommend={() => setTab('recommend')}
              onBoard={() => setTab('board')}
              onSquad={() => setTab('squad')}
            />
          )}

          {tab === 'club' && session && !booted && !loadError && <Notice>クラブを読み込んでいます…</Notice>}

          {tab === 'club' && (!session || booted) && (
            <ClubPage
              session={session}
              profile={profile}
              hasSquad={usablePlayers(squad).length > 0}
              authError={authError}
              onProfile={updateProfile}
              onSignOut={logout}
            />
          )}

          {tab === 'squad' && profile && (
            <SquadPage
              profile={profile}
              squad={squad}
              loading={squadState === 'loading'}
              onSquadChange={setSquad}
            />
          )}

          {tab === 'recommend' && profile && (
            <RecommendPage
              squad={squad}
              loading={squadState === 'loading'}
              profile={profile}
              onOpenBoard={openBoard}
              onSaved={(id) => {
                setFocusTactic(id);
                setTab('tactics');
              }}
              onGoSquad={() => setTab('squad')}
            />
          )}

          {tab === 'tactics' && profile && (
            <MyTacticsPage
              focusId={focusTactic}
              onOpenBoard={openSavedOnBoard}
              onGoRecommend={() => setTab('recommend')}
            />
          )}

          {tab === 'board' && (
            <BoardPage
              board={board}
              onBoardChange={setBoard}
              seededFrom={seededFrom}
              squad={loggedIn ? usablePlayers(squad) : []}
              profile={profile}
              onSaved={(id) => {
                setFocusTactic(id);
                setTab('tactics');
              }}
              onLogin={() => setTab('club')}
            />
          )}
        </>
      )}
    </div>
  );
}
