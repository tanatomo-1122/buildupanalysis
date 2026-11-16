/**
 * Supabase Auth（Google ログイン）の最小クライアント。
 *
 * SDK は入れず、GoTrue の REST を直接叩く:
 *   1. /auth/v1/authorize?provider=google へ遷移
 *   2. Google → Supabase → このサイトへ戻る。URL の # にトークンが付いてくる
 *   3. それを localStorage に保存し、以降の PostgREST リクエストに Bearer で付ける
 *   4. 期限が近づいたら refresh_token で取り直す
 *
 * 権限は DB 側の RLS（owner = auth.uid()）で守っているので、
 * ここで扱うトークンは「本人であること」を伝えるだけの役割。
 */
import { anonKey, supabaseConfigured, supabaseUrl } from './supabase-env';

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** 失効時刻（UNIX 秒） */
  expiresAt: number;
  user: AuthUser;
}

export interface AuthUser {
  id: string;
  /** Google のアカウント名。クラブ名の初期値にだけ使う */
  name: string;
  avatarUrl?: string;
}

const KEY = 'buildup-board:session';

let current: Session | null = null;
const listeners = new Set<(s: Session | null) => void>();

const save = (s: Session | null) => {
  current = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* 保存できない環境ではタブを閉じるまでの間だけ有効 */
  }
  listeners.forEach((fn) => fn(s));
};

export const onSessionChange = (fn: (s: Session | null) => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** JWT の中身から利用者の ID と名前を取り出す（署名検証はサーバー側の仕事） */
const userFromToken = (token: string): AuthUser => {
  const part = token.split('.')[1] ?? '';
  const json = decodeURIComponent(
    atob(part.replace(/-/g, '+').replace(/_/g, '/'))
      .split('')
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  );
  const claims = JSON.parse(json) as {
    sub: string;
    user_metadata?: { full_name?: string; name?: string; avatar_url?: string };
  };
  const meta = claims.user_metadata ?? {};
  return { id: claims.sub, name: meta.full_name ?? meta.name ?? '', avatarUrl: meta.avatar_url };
};

const authFetch = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: anonKey, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`ログイン処理に失敗しました（HTTP ${res.status}）`);
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
};

/** Google のログイン画面へ移動する。戻り先は今のページ */
export const signInWithGoogle = () => {
  const back = `${location.origin}${location.pathname}`;
  location.assign(
    `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`,
  );
};

/**
 * 起動時に1回呼ぶ。
 *   - ログインから戻ってきた直後なら # のトークンを取り込んで URL を掃除する
 *   - そうでなければ保存済みのセッションを読み、期限切れなら更新する
 * エラー（キャンセル等）は文字列で返す。
 */
export const initAuth = async (): Promise<{ session: Session | null; error?: string }> => {
  if (!supabaseConfigured) return { session: null };

  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const cleanUrl = () =>
    history.replaceState(null, '', `${location.pathname}${location.search}`);

  if (hash.get('error_description')) {
    cleanUrl();
    return { session: null, error: hash.get('error_description') ?? undefined };
  }

  const access = hash.get('access_token');
  const refresh = hash.get('refresh_token');
  if (access && refresh) {
    cleanUrl();
    const expiresIn = Number(hash.get('expires_in') ?? 3600);
    const s: Session = {
      accessToken: access,
      refreshToken: refresh,
      expiresAt: Number(hash.get('expires_at')) || Math.floor(Date.now() / 1000) + expiresIn,
      user: userFromToken(access),
    };
    save(s);
    return { session: s };
  }

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) current = JSON.parse(raw) as Session;
  } catch {
    current = null;
  }
  if (!current) return { session: null };
  try {
    await getAccessToken();
  } catch {
    save(null);
  }
  return { session: current };
};

const refreshSession = async (s: Session): Promise<Session> => {
  const r = (await authFetch('token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: s.refreshToken }),
  })) as { access_token: string; refresh_token: string; expires_in: number; expires_at?: number };
  const next: Session = {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    expiresAt: r.expires_at ?? Math.floor(Date.now() / 1000) + r.expires_in,
    user: userFromToken(r.access_token),
  };
  save(next);
  return next;
};

let refreshing: Promise<Session> | null = null;

/** 有効なアクセストークン。未ログインなら null（＝ anon として扱う） */
export const getAccessToken = async (): Promise<string | null> => {
  if (!current) return null;
  if (current.expiresAt - 60 > Date.now() / 1000) return current.accessToken;
  // 複数のリクエストが同時に来ても更新は1回だけ
  refreshing ??= refreshSession(current).finally(() => {
    refreshing = null;
  });
  return (await refreshing).accessToken;
};

export const currentSession = () => current;

export const signOut = async () => {
  const token = current?.accessToken;
  save(null);
  if (token) {
    await authFetch('logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(
      () => undefined,
    );
  }
};
