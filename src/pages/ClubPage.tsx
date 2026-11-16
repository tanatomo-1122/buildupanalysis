import { useEffect, useState } from 'react';
import type { Session } from '../api/auth';
import { signInWithGoogle } from '../api/auth';
import { claimProfile, updateMyProfile } from '../api/squad';
import { supabaseConfigured } from '../api/supabase';
import { Button, Card, Notice, TextField } from '../components/ui';
import { TEAM_COLORS, applyTeamColor } from '../theme';
import type { UserProfile } from '../types';

interface Props {
  session: Session | null;
  profile: UserProfile | null;
  /** 選手が1人でも登録されているか（引き継ぎ欄を出すかどうか） */
  hasSquad: boolean;
  authError: string | null;
  onProfile: (p: UserProfile) => void;
  onSignOut: () => void;
}

/** 未ログイン時の入口と、ログイン後のクラブ設定 */
export default function ClubPage({ session, profile, hasSquad, authError, onProfile, onSignOut }: Props) {
  if (!supabaseConfigured) return <SetupGuide />;
  if (!session) return <Welcome error={authError} />;
  if (!profile) return <Notice>クラブを読み込んでいます…</Notice>;
  return (
    <ClubSettings
      profile={profile}
      hasSquad={hasSquad}
      onProfile={onProfile}
      onSignOut={onSignOut}
    />
  );
}

function Welcome({ error }: { error: string | null }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-edge bg-panel px-6 py-10 sm:px-10 sm:py-14">
      <div className="max-w-[640px] space-y-6">
        <div className="text-[12px] font-bold tracking-[0.2em] text-team">EFOOTBALL TACTICS LAB</div>
        <h2 className="numeral text-[88px] sm:text-[128px]">MY XI</h2>
        <p className="text-[20px] font-black leading-snug text-slate-50 [text-wrap:balance]">
          自分の23人で、自分にしかない戦術を。
        </p>
        <p className="max-w-[52ch] text-[14px] leading-relaxed text-slate-400">
          登録した選手と相手の形から、攻撃時と守備時のフォーメーションを提案します。
          作った戦術は自分だけのクラブに保存され、見せたいものだけをリンクや画像で共有できます。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={signInWithGoogle}
            className="rounded-xl bg-team px-6 py-3.5 text-[15px] font-bold text-team-ink transition-[filter] hover:brightness-110"
          >
            Google でログイン
          </button>
          <span className="text-[12px] text-slate-500">データは本人しか見られません</span>
        </div>
        {error && <Notice tone="error">ログインできませんでした：{error}</Notice>}
      </div>
      <div
        aria-hidden
        className="numeral pointer-events-none absolute -bottom-10 -right-4 hidden select-none text-[340px] opacity-20 lg:block"
      >
        11
      </div>
    </section>
  );
}

function ClubSettings({
  profile,
  hasSquad,
  onProfile,
  onSignOut,
}: {
  profile: UserProfile;
  hasSquad: boolean;
  onProfile: (p: UserProfile) => void;
  onSignOut: () => void;
}) {
  const [name, setName] = useState(profile.userName);
  const [claimId, setClaimId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => setName(profile.userName), [profile.userName]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pickColor = (id: string) => {
    applyTeamColor(id); // 先に見た目だけ変える
    void run(async () => {
      onProfile(await updateMyProfile(profile.id, { teamColor: id }));
    });
  };

  return (
    <div className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}

      <Card
        title="マイクラブ"
        subtitle="このクラブはあなただけのものです。他の人からは見えません。"
        actions={<Button onClick={onSignOut}>ログアウト</Button>}
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <TextField
              label="クラブ名（共有カードに出ます）"
              value={name}
              placeholder="例: Tomoya FC"
              onChange={setName}
              onEnter={() =>
                name.trim() &&
                run(async () => {
                  onProfile(await updateMyProfile(profile.id, { userName: name.trim() }));
                  setSaved('クラブ名を保存しました');
                })
              }
            />
            <div className="flex items-center gap-3">
              <Button
                tone="primary"
                disabled={busy || !name.trim() || name.trim() === profile.userName}
                onClick={() =>
                  run(async () => {
                    onProfile(await updateMyProfile(profile.id, { userName: name.trim() }));
                    setSaved('クラブ名を保存しました');
                  })
                }
              >
                保存
              </Button>
              {saved && <span className="text-[12px] text-team">{saved}</span>}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[13px] text-slate-200">チームカラー</div>
            <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="チームカラー">
              {TEAM_COLORS.map((c) => {
                const on = c.id === profile.teamColor;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={c.label}
                    title={c.label}
                    onClick={() => pickColor(c.id)}
                    className={`h-11 w-11 rounded-full border-2 transition-transform hover:scale-105 ${
                      on ? 'border-slate-50 ring-2 ring-slate-50/30' : 'border-transparent'
                    }`}
                    style={{ background: c.hex }}
                  />
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">画面全体と、共有する画像の色になります。</p>
          </div>
        </div>
      </Card>

      {!hasSquad && (
        <Card
          title="以前のデータを引き継ぐ"
          subtitle="ログイン導入前に eFootball ID で登録していた選手データを、このクラブに移します。選手が未登録のときだけ使えます。"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <TextField label="以前登録した eFootball ID" value={claimId} placeholder="例: 1234567890" onChange={setClaimId} />
            </div>
            <Button
              tone="primary"
              disabled={busy || !claimId.trim()}
              onClick={() =>
                run(async () => {
                  const p = await claimProfile(claimId);
                  onProfile(p);
                  setClaimId('');
                  setSaved('引き継ぎました');
                })
              }
            >
              引き継ぐ
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function SetupGuide() {
  return (
    <Card title="Supabase の設定が必要です" subtitle="接続情報が読み込まれていません">
      <div className="space-y-3 text-[12px] leading-relaxed text-slate-400">
        <p>このアプリはログインとデータの保存に Supabase を使います。次の手順で接続してください。</p>
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>Supabase でプロジェクトを作成する</li>
          <li>
            SQL Editor で <code className="font-mono text-slate-300">supabase/schema.sql</code> を実行する
          </li>
          <li>Authentication → Providers で Google を有効にする</li>
          <li>
            <code className="font-mono text-slate-300">.env.local</code> に URL と anon キーを入れ、
            <code className="font-mono text-slate-300">npm run dev</code> を再起動する
          </li>
        </ol>
      </div>
    </Card>
  );
}
