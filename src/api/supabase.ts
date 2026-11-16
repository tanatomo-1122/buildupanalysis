/**
 * Supabase (PostgREST) への最小クライアント。
 *
 * SDK は入れず fetch だけで叩いている。ログイン中はユーザーのアクセストークンを、
 * 未ログインなら anon キーを Bearer に載せる。何が見えるかは DB 側の RLS が決める。
 */
import { getAccessToken } from './auth';
import { anonKey, supabaseConfigured, supabaseUrl } from './supabase-env';

export { supabaseConfigured, supabaseUrl };
const url = supabaseUrl;

export class SupabaseError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'SupabaseError';
  }
}

const headers = async (extra: Record<string, string> = {}): Promise<Record<string, string>> => ({
  apikey: anonKey,
  Authorization: `Bearer ${(await getAccessToken()) ?? anonKey}`,
  'Content-Type': 'application/json',
  ...extra,
});

const request = async <T>(path: string, init: RequestInit): Promise<T> => {
  if (!supabaseConfigured) {
    throw new SupabaseError(
      'Supabase の接続情報が設定されていません。.env.local に VITE_SUPABASE_URL と VITE_SUPABASE_ANNON_KEY を設定してください。',
    );
  }
  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/${path}`, init);
  } catch (e) {
    throw new SupabaseError(
      `Supabase に接続できませんでした（${url}）。URL とネットワークを確認してください。`,
      undefined,
      e instanceof Error ? e.message : String(e),
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let pgMessage = '';
    try {
      pgMessage = (JSON.parse(body) as { message?: string }).message ?? '';
    } catch {
      /* JSON でなければ本文をそのまま detail に回す */
    }
    // RPC の raise exception は日本語の理由をそのまま出す
    if (res.status === 400 && pgMessage && /[\u3040-\u30ff\u4e00-\u9fff]/.test(pgMessage)) {
      throw new SupabaseError(pgMessage, res.status, body.slice(0, 400));
    }
    throw new SupabaseError(
      res.status === 401 || res.status === 403
        ? 'この操作の権限がありません。ログインし直してください。'
        : `Supabase のリクエストが失敗しました（HTTP ${res.status}）。テーブルと RLS ポリシーが supabase/schema.sql のとおりか確認してください。`,
      res.status,
      body.slice(0, 400),
    );
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
};

export const sbSelect = async <T>(table: string, query = ''): Promise<T[]> =>
  request<T[]>(`${table}${query ? `?${query}` : ''}`, { method: 'GET', headers: await headers() });

export const sbInsert = async <T>(table: string, rows: unknown): Promise<T[]> =>
  request<T[]>(table, {
    method: 'POST',
    headers: await headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(rows),
  });

export const sbUpsert = async <T>(table: string, rows: unknown, onConflict: string): Promise<T[]> =>
  request<T[]>(`${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: await headers({ Prefer: 'return=representation,resolution=merge-duplicates' }),
    body: JSON.stringify(rows),
  });

export const sbUpdate = async <T>(table: string, query: string, patch: unknown): Promise<T[]> =>
  request<T[]>(`${table}?${query}`, {
    method: 'PATCH',
    headers: await headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  });

export const sbDelete = async (table: string, query: string): Promise<void> =>
  request<void>(`${table}?${query}`, { method: 'DELETE', headers: await headers() });

/** Postgres 関数の呼び出し（/rest/v1/rpc/<name>） */
export const sbRpc = async <T>(fn: string, args: unknown): Promise<T> =>
  request<T>(`rpc/${fn}`, { method: 'POST', headers: await headers(), body: JSON.stringify(args) });
