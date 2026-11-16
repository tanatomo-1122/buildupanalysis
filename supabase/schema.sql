-- ビルドアップ評価戦術ボード / Supabase スキーマ
--
-- Supabase の SQL Editor にそのまま貼り付けて実行してください（新規作成用）。
-- 旧版から上げる場合は supabase/migrations/20261116_auth_and_tactics.sql を実行します。
--
-- ログインは Supabase Auth（Google）。データは持ち主本人だけが読み書きでき、
-- 戦術は「公開」にしたものだけが共有リンクから誰でも見られます。
-- この設定なら anon キーがブラウザに見えていても他人のデータには届きません。

create extension if not exists "pgcrypto";

-- ── プロフィール ────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid unique default auth.uid() references auth.users(id) on delete cascade,
  user_name     text not null,               -- クラブ名（画面と共有カードに出る）
  efootball_id  text,                        -- 任意。旧データの引き継ぎに使う
  team_color    text not null default 'blaze', -- チームカラーの ID（src/theme.ts）
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
  sub_positions  text[] not null default '{}', -- 適性ポジション（最大4つ）。空なら未登録扱い
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

-- ── 古い「全員に開放」ポリシーを外す ─────────────────────────────
drop policy if exists "profiles anon all" on public.profiles;
drop policy if exists "squad anon all" on public.squad_players;

drop policy if exists "profiles own" on public.profiles;
create policy "profiles own" on public.profiles
  for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "squad own" on public.squad_players;
create policy "squad own" on public.squad_players
  for all to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = squad_players.profile_id and p.owner = auth.uid()))
  with check (exists (select 1 from public.profiles p
                      where p.id = squad_players.profile_id and p.owner = auth.uid()));

-- ── 保存した戦術 ───────────────────────────────────────────────
create table if not exists public.tactics (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title          text not null,
  opponent_label text not null,
  attack_label   text not null,
  defense_label  text not null,
  payload        jsonb not null,             -- 両局面の布陣・起用・相手配置など（アプリ側の型は src/api/tactics.ts）
  author_name    text,                       -- 共有画面に出す名前（保存時点のクラブ名）
  team_color     text,                       -- 共有画面の色（保存時点のチームカラー）
  share_id       text not null unique
                   default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  is_public      boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists tactics_owner_idx on public.tactics (owner, created_at desc);

alter table public.tactics enable row level security;

drop policy if exists "tactics own" on public.tactics;
create policy "tactics own" on public.tactics
  for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

-- 共有リンクを知っている人は、公開にした戦術だけ見られる（ログイン不要）
drop policy if exists "tactics public read" on public.tactics;
create policy "tactics public read" on public.tactics
  for select to anon, authenticated
  using (is_public);

-- 未ログインの閲覧者には持ち主の内部 ID を渡さない
revoke select on public.tactics from anon;
grant select (id, title, opponent_label, attack_label, defense_label, payload,
              author_name, team_color, share_id, is_public, created_at)
  on public.tactics to anon;

-- ── 以前のデータの引き継ぎ ─────────────────────────────────────────
-- 持ち主のいないプロフィールを、eFootball ID を指定して自分のものにする。
-- 自分の側にすでに選手が登録されている場合は上書きを避けて失敗させる。
create or replace function public.claim_profile(p_efootball_id text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  mine   public.profiles;
  target public.profiles;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  select * into target from public.profiles
   where efootball_id = p_efootball_id and owner is null
   limit 1;
  if target.id is null then
    raise exception '引き継げるデータが見つかりません';
  end if;

  select * into mine from public.profiles where owner = auth.uid();
  if mine.id is not null then
    if exists (select 1 from public.squad_players where profile_id = mine.id) then
      raise exception 'すでに選手が登録されています';
    end if;
    -- 空のプロフィールは引き継ぐ側に名前と色を移してから消す
    update public.profiles
       set user_name = coalesce(nullif(mine.user_name, ''), target.user_name),
           team_color = mine.team_color
     where id = target.id;
    delete from public.profiles where id = mine.id;
  end if;

  update public.profiles set owner = auth.uid() where id = target.id
  returning * into target;
  return target;
end;
$$;

revoke all on function public.claim_profile(text) from public, anon;
grant execute on function public.claim_profile(text) to authenticated;
