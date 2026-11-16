/**
 * Supabase の接続情報（Vite の環境変数から読む。`.env.local` に置く）:
 *   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
 *   VITE_SUPABASE_ANNON_KEY=ey...
 *
 * anon キーはブラウザに配られる前提の公開キー。守りは DB 側の RLS で行う。
 */
export const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
export const anonKey = import.meta.env.VITE_SUPABASE_ANNON_KEY ?? '';
export const supabaseConfigured = Boolean(supabaseUrl && anonKey);
