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

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

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
