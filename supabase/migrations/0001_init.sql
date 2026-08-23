-- Graduate Pro -- Supabase schema (replaces PocketBase)
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
--
-- Design notes:
--   * Table/column names deliberately mirror the old PocketBase collections
--     (e.g. "project", "created", "updated") so most of the frontend code
--     that only *reads* these fields didn't need to change.
--   * The bibliography table is named "bibliography", not "references" --
--     REFERENCES is a reserved SQL keyword and best avoided as an
--     identifier even though it can technically be quoted.
--   * Row Level Security is enabled on every table: a user can only see or
--     modify their own projects and everything that hangs off them.

create extension if not exists pgcrypto;

-- -- PROFILES (mirrors PocketBase's users.name field) ------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up,
-- pulling "name" out of the signup metadata (see useAuth.ts signUp()).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -- PROJECTS --------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  "user" uuid not null references auth.users(id) on delete cascade,
  title text not null,
  tipo smallint not null default 0,
  norma text not null default 'libre',
  institution text,
  author text,
  tutor text,
  year integer,
  word_count integer not null default 0,
  settings jsonb,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

alter table public.projects enable row level security;

drop policy if exists "projects_all_own" on public.projects;
create policy "projects_all_own" on public.projects
  for all using (auth.uid() = "user") with check (auth.uid() = "user");

-- -- SECTIONS --------------------------------------------------
create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  project uuid not null references public.projects(id) on delete cascade,
  name text not null,
  fase text not null,
  order_index integer not null default 1,
  is_roman boolean not null default false,
  content jsonb,
  word_count integer not null default 0,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

alter table public.sections enable row level security;

drop policy if exists "sections_all_via_project" on public.sections;
create policy "sections_all_via_project" on public.sections
  for all using (
    exists (select 1 from public.projects p where p.id = project and p."user" = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = project and p."user" = auth.uid())
  );

-- -- BIBLIOGRAPHY (was "references" in PocketBase) ------------
create table if not exists public.bibliography (
  id uuid primary key default gen_random_uuid(),
  project uuid not null references public.projects(id) on delete cascade,
  author text not null,
  initial text,
  year text,
  ref_type text not null default 'libro',
  title text not null,
  publisher text,
  journal text,
  volume text,
  issue text,
  doi text,
  url text,
  pages text,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

alter table public.bibliography enable row level security;

drop policy if exists "bibliography_all_via_project" on public.bibliography;
create policy "bibliography_all_via_project" on public.bibliography
  for all using (
    exists (select 1 from public.projects p where p.id = project and p."user" = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = project and p."user" = auth.uid())
  );

-- -- CITATIONS -------------------------------------------------
create table if not exists public.citations (
  id uuid primary key default gen_random_uuid(),
  project uuid not null references public.projects(id) on delete cascade,
  section uuid not null references public.sections(id) on delete cascade,
  reference uuid not null references public.bibliography(id) on delete cascade,
  page_ref text,
  order_of_appearance integer not null default 1,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

alter table public.citations enable row level security;

drop policy if exists "citations_all_via_project" on public.citations;
create policy "citations_all_via_project" on public.citations
  for all using (
    exists (select 1 from public.projects p where p.id = project and p."user" = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = project and p."user" = auth.uid())
  );

-- -- VERSIONS --------------------------------------------------
create table if not exists public.versions (
  id uuid primary key default gen_random_uuid(),
  project uuid not null references public.projects(id) on delete cascade,
  label text,
  snapshot jsonb not null,
  auto boolean not null default false,
  created timestamptz not null default now()
);

alter table public.versions enable row level security;

drop policy if exists "versions_all_via_project" on public.versions;
create policy "versions_all_via_project" on public.versions
  for all using (
    exists (select 1 from public.projects p where p.id = project and p."user" = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = project and p."user" = auth.uid())
  );

-- -- updated_at auto-touch -------------------------------------
create or replace function public.touch_updated()
returns trigger as $$
begin
  new.updated = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists touch_projects on public.projects;
create trigger touch_projects before update on public.projects
  for each row execute procedure public.touch_updated();

drop trigger if exists touch_sections on public.sections;
create trigger touch_sections before update on public.sections
  for each row execute procedure public.touch_updated();

drop trigger if exists touch_bibliography on public.bibliography;
create trigger touch_bibliography before update on public.bibliography
  for each row execute procedure public.touch_updated();

drop trigger if exists touch_citations on public.citations;
create trigger touch_citations before update on public.citations
  for each row execute procedure public.touch_updated();

-- -- atomic project creation (audit 4.5) --------------------------
-- Creates the project row AND every template section in a single
-- transaction, so a failure partway through can never leave a project
-- with zero sections (which used to force the frontend's "virtual
-- section" fallback path -- see audit 4.3).
create or replace function public.create_project_with_sections(
  p_title text,
  p_tipo smallint,
  p_norma text,
  p_sections jsonb -- [{ "name": "...", "fase": "...", "order_index": 0 }, ...]
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.projects ("user", title, tipo, norma, word_count)
  values (auth.uid(), p_title, p_tipo, p_norma, 0)
  returning * into v_project;

  insert into public.sections (project, name, fase, order_index, word_count)
  select
    v_project.id,
    (s->>'name')::text,
    (s->>'fase')::text,
    (s->>'order_index')::int,
    0
  from jsonb_array_elements(p_sections) as s;

  return v_project;
end;
$$;

grant execute on function public.create_project_with_sections(text, smallint, text, jsonb) to authenticated;

-- -- word_count sync (audit 4.4) ------------------------------------
-- projects.word_count used to be set to 0 at creation and never touched
-- again, so the Dashboard's project list showed a permanently stale
-- number while the editor computed the real total live from `sections`.
-- This trigger keeps the column in sync automatically on every section
-- insert/update/delete, so there's a single source of truth maintained
-- by the database instead of the frontend having to remember to sync it.
create or replace function public.sync_project_word_count()
returns trigger as $$
declare
  v_project_id uuid;
begin
  v_project_id := coalesce(NEW.project, OLD.project);
  update public.projects
  set word_count = (
    select coalesce(sum(word_count), 0) from public.sections where project = v_project_id
  )
  where id = v_project_id;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists sync_word_count on public.sections;
create trigger sync_word_count
  after insert or update of word_count or delete on public.sections
  for each row execute procedure public.sync_project_word_count();
