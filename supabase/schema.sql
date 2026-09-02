-- ビルドアップ評価戦術ボード / Supabase スキーマ
--
-- Supabase の SQL Editor にそのまま貼り付けて実行してください。
--
-- 注意：このアプリは eFootball のユーザーネームと ID を「名札」として使うだけで、
-- パスワード認証は行いません。anon キーで読み書きできる想定のポリシーになっているため、
-- 公開URLに置く場合は不特定多数が読み書きできる点を理解したうえで使ってください。
-- 本格的に閉じたい場合は Supabase Auth を導入し、下部のコメントのポリシーに差し替えます。

create extension if not exists "pgcrypto";

-- ── プロフィール ────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key default gen_random_uuid(),
  user_name     text not null,
  efootball_id  text not null,
  created_at    timestamptz not null default now(),
  unique (efootball_id)
);

-- ── 登録選手（1プロフィールにつき最大23名） ───────────────────────
create table if not exists public.squad_players (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  slot_index     smallint not null,          -- 0〜22。並び順の保持用
  name           text not null,
  position       text not null,              -- GK/CB/RSB/LSB/DMF/CMF/RMF/LMF/OMF/RWG/LWG/ST/CF
  attack_skill   text not null,              -- 攻撃時のプレースタイル ID
  defense_skill  text not null,              -- 守備時のプレースタイル ID
  updated_at     timestamptz not null default now(),
  unique (profile_id, slot_index)
);

create index if not exists squad_players_profile_idx
  on public.squad_players (profile_id, slot_index);

-- ── RLS ────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.squad_players enable row level security;

drop policy if exists "profiles anon all" on public.profiles;
create policy "profiles anon all" on public.profiles
  for all using (true) with check (true);

drop policy if exists "squad anon all" on public.squad_players;
create policy "squad anon all" on public.squad_players
  for all using (true) with check (true);

-- Supabase Auth を導入して自分だけに閉じる場合は、profiles に
--   owner uuid not null default auth.uid()
-- を足したうえで、上のポリシーを次のように差し替えてください。
--
--   create policy "own profiles" on public.profiles
--     for all using (owner = auth.uid()) with check (owner = auth.uid());
--   create policy "own squad" on public.squad_players
--     for all using (
--       exists (select 1 from public.profiles p
--               where p.id = squad_players.profile_id and p.owner = auth.uid())
--     ) with check (
--       exists (select 1 from public.profiles p
--               where p.id = squad_players.profile_id and p.owner = auth.uid())
--     );
