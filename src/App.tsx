import { useCallback, useEffect, useState } from 'react';
import { blankSquad } from './api/squad';
import { supabaseConfigured } from './api/supabase';
import { Notice } from './components/ui';
import { DEFAULT_PARAMS } from './constants';
import type { FormationRecommendation } from './logic/recommend';
import BoardPage from './pages/BoardPage';
import ProfilePage from './pages/ProfilePage';
import RecommendPage from './pages/RecommendPage';
import type { BoardContext } from './pages/RecommendPage';
import SquadPage from './pages/SquadPage';
import { initialState } from './presets';
import type { BoardState, SquadPlayer, UserProfile } from './types';

type Tab = 'profile' | 'squad' | 'recommend' | 'board';

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'ユーザー' },
  { id: 'squad', label: '選手登録' },
  { id: 'recommend', label: '戦術提案' },
  { id: 'board', label: '戦術ボード' },
];

const PROFILE_KEY = 'buildup-board:profile';

export default function App() {
  const [tab, setTab] = useState<Tab>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [squad, setSquad] = useState<SquadPlayer[]>(() => blankSquad());
  const [board, setBoard] = useState<BoardState>(() => initialState());
  const [seededFrom, setSeededFrom] = useState<string | null>(null);

  /* 直前に選んでいたユーザーを覚えておく（データ自体は Supabase 側） */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as UserProfile;
        if (p?.id) {
          setProfile(p);
          setTab('recommend');
        }
      }
    } catch {
      /* 壊れていたら無視 */
    }
  }, []);

  const selectProfile = useCallback((p: UserProfile | null) => {
    setProfile(p);
    setSquad(blankSquad());
    try {
      if (p) localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
      else localStorage.removeItem(PROFILE_KEY);
    } catch {
      /* 保存できなくても動作には影響しない */
    }
    if (p) setTab('squad');
  }, []);

  /** 提案された布陣を盤面に流し込む */
  const openBoard = useCallback((rec: FormationRecommendation, ctx: BoardContext) => {
    // フリーエディットの結果をそのまま盤面へ持っていく
    const away = ctx.opponentPlayers;
    setBoard({
      players: [...rec.lineup, ...away],
      ball: { ...rec.lineup.find((p) => p.position === 'CB')?.pos ?? rec.lineup[1].pos },
      params: {
        ...DEFAULT_PARAMS,
        possessionTeam: 'home',
        scene: ctx.scene,
        homeStyle: ctx.homeStyle,
        awayStyle: ctx.opponentStyle,
      },
      homeFormation: rec.formationId,
      awayFormation: ctx.opponentFormation,
      homeLine: 0,
      awayLine: ctx.awayLine,
    });
    setSeededFrom(`${rec.label}（対 ${ctx.opponentLabel}）`);
    setTab('board');
  }, []);

  const needsProfile = tab === 'squad' || tab === 'recommend';

  return (
    <div className="mx-auto min-h-screen max-w-[1500px] px-4 py-4 lg:px-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">eFootball 戦術提案ボード</h1>
          <p className="text-[12px] text-slate-500">
            登録した選手とチームスタイルから、相手の布陣に噛み合うフォーメーションを提案します
          </p>
        </div>
        <div className="flex items-center gap-3">
          {profile && (
            <span className="rounded-md border border-edge bg-panel2 px-2.5 py-1.5 text-[12px] text-slate-300">
              {profile.userName}
              <span className="ml-1.5 font-mono text-[11px] text-slate-500">
                {profile.efootballId}
              </span>
            </span>
          )}
          <nav className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-md border px-3 py-1.5 text-[12px] transition-colors ${
                  tab === t.id
                    ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                    : 'border-edge bg-panel2 text-slate-400 hover:bg-[#243040]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {tab === 'profile' && <ProfilePage profile={profile} onSelect={selectProfile} />}

      {needsProfile && !profile && (
        <Notice tone="warn">
          先に「ユーザー」タブで eFootball のユーザーネームと ID を登録・選択してください。
          {!supabaseConfigured && ' （Supabase の接続設定も必要です）'}
        </Notice>
      )}

      {tab === 'squad' && profile && (
        <SquadPage profile={profile} squad={squad} onSquadChange={setSquad} />
      )}

      {tab === 'recommend' && profile && (
        <RecommendPage squad={squad} onOpenBoard={openBoard} />
      )}

      {tab === 'board' && (
        <BoardPage board={board} onBoardChange={setBoard} seededFrom={seededFrom} />
      )}
    </div>
  );
}
