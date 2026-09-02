import { useEffect, useState } from 'react';
import { deleteProfile, listProfiles, registerProfile } from '../api/squad';
import { supabaseConfigured, supabaseUrl } from '../api/supabase';
import { Button, Card, Notice, TextField } from '../components/ui';
import type { UserProfile } from '../types';

interface Props {
  profile: UserProfile | null;
  onSelect: (p: UserProfile | null) => void;
}

export default function ProfilePage({ profile, onSelect }: Props) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [userName, setUserName] = useState('');
  const [efootballId, setEfootballId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!supabaseConfigured) return;
    setError(null);
    try {
      setProfiles(await listProfiles());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!userName.trim() || !efootballId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const p = await registerProfile(userName.trim(), efootballId.trim());
      onSelect(p);
      setUserName('');
      setEfootballId('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: UserProfile) => {
    setBusy(true);
    setError(null);
    try {
      await deleteProfile(p.id);
      if (profile?.id === p.id) onSelect(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!supabaseConfigured) {
    return (
      <Card title="Supabase の設定が必要です" subtitle="接続情報が読み込まれていません">
        <div className="space-y-3 text-[12px] leading-relaxed text-slate-400">
          <p>このアプリはユーザー登録と選手データの保存に Supabase を使います。次の手順で接続してください。</p>
          <ol className="ml-4 list-decimal space-y-1.5">
            <li>Supabase でプロジェクトを作成する</li>
            <li>
              SQL Editor で <code className="font-mono text-slate-300">supabase/schema.sql</code> を実行する
            </li>
            <li>
              <code className="font-mono text-slate-300">.env.example</code> を{' '}
              <code className="font-mono text-slate-300">.env.local</code> にコピーし、
              Project Settings → API の URL と anon キーを入れる
            </li>
            <li>
              <code className="font-mono text-slate-300">npm run dev</code> を再起動する
            </li>
          </ol>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}

      <Card
        title="ユーザー登録"
        subtitle={`eFootball のユーザーネームと ID で登録します。接続先: ${supabaseUrl}`}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="eFootball ユーザーネーム"
            value={userName}
            placeholder="例: Tomoya"
            onChange={setUserName}
            onEnter={submit}
          />
          <TextField
            label="eFootball ID"
            value={efootballId}
            placeholder="例: 1234567890"
            hint="同じ ID が既にあれば、そのプロフィールを選び直します。"
            onChange={setEfootballId}
            onEnter={submit}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            tone="primary"
            size="md"
            disabled={busy || !userName.trim() || !efootballId.trim()}
            onClick={submit}
          >
            {busy ? '処理中…' : '登録して選択'}
          </Button>
        </div>
      </Card>

      <Card title="登録済みのユーザー" subtitle={`${profiles.length} 件`}>
        {profiles.length === 0 ? (
          <p className="text-[12px] text-slate-500">まだ登録がありません。</p>
        ) : (
          <ul className="space-y-2">
            {profiles.map((p) => {
              const active = p.id === profile?.id;
              return (
                <li
                  key={p.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                    active ? 'border-sky-500/60 bg-sky-500/10' : 'border-edge bg-panel/40'
                  }`}
                >
                  <div>
                    <div className="text-[13px] font-medium text-slate-100">
                      {p.userName}
                      {active && (
                        <span className="ml-2 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-200">
                          選択中
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">ID: {p.efootballId}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => onSelect(p)} disabled={active}>
                      選択
                    </Button>
                    <Button tone="danger" onClick={() => remove(p)} disabled={busy}>
                      削除
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
