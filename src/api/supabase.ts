/**
 * Supabase (PostgREST) への最小クライアント。
 *
 * SDK は入れず fetch だけで叩いている。使っているのは
 * GET / POST / PATCH / DELETE の4種類だけなので依存を増やす必要がない。
 *
 * 接続情報は Vite の環境変数から読む（`.env.local` に置く）:
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=ey...
 */

const url = (import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const anonKey = import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabaseConfigured = Boolean(url && anonKey);

export const supabaseUrl = url;

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

const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
  'Content-Type': 'application/json',
  ...extra,
});

const request = async <T>(path: string, init: RequestInit): Promise<T> => {
  if (!supabaseConfigured) {
    throw new SupabaseError(
      'Supabase の接続情報が設定されていません。.env.local に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください。',
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
    throw new SupabaseError(
      `Supabase のリクエストが失敗しました（HTTP ${res.status}）。テーブルと RLS ポリシーが supabase/schema.sql のとおりか確認してください。`,
      res.status,
      body.slice(0, 400),
    );
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
};

export const sbSelect = <T>(table: string, query = ''): Promise<T[]> =>
  request<T[]>(`${table}${query ? `?${query}` : ''}`, { method: 'GET', headers: headers() });

export const sbInsert = <T>(table: string, rows: unknown): Promise<T[]> =>
  request<T[]>(table, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(rows),
  });

export const sbUpsert = <T>(table: string, rows: unknown, onConflict: string): Promise<T[]> =>
  request<T[]>(`${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation,resolution=merge-duplicates' }),
    body: JSON.stringify(rows),
  });

export const sbDelete = (table: string, query: string): Promise<void> =>
  request<void>(`${table}?${query}`, { method: 'DELETE', headers: headers() });
