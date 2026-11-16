-- 2026-11-16 Googleログイン・自分専用データ・戦術の保存と共有
--
-- すでに schema.sql（旧版）で動いている環境向けの差分です。SQL Editor でこのファイルを丸ごと実行してください。
-- 新規に作る場合は schema.sql だけで同じ状態になります。
--
-- 実行するとすぐに「誰でも全件読み書きできる」状態が終わります。
-- 既存のプロフィールは持ち主がいない状態になり、誰からも見えなくなります。
-- 自分のデータは、ログイン後に「以前のデータを引き継ぐ」で eFootball ID を入れると戻ります。

-- ── プロフィール：持ち主とチームカラー ──────────────────────────────
alter table public.profiles
  add column if not exists owner uuid unique references auth.users(id) on delete cascade;
alter table public.profiles alter column owner set default auth.uid();
alter table public.profiles
  add column if not exists team_color text not null default 'blaze';
-- eFootball ID はもう本人確認に使わないので任意にする
alter table public.profiles alter column efootball_id drop not null;

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
