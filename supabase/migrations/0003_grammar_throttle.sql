-- Audit 10.1 fix (GRAVE) -- check-grammar's rate limit lived only in a
-- plain in-memory Map inside the Edge Function, and the function's own
-- comments already admitted the problem: Edge Function instances are not
-- guaranteed to be warm or shared between requests, so that Map resets
-- constantly and different instances don't see each other's requests. A
-- user (or a script hammering the endpoint with a valid JWT) could end up
-- issuing many requests per second simply by landing on different
-- instances. This table gives the throttle a single shared place to live --
-- Postgres -- so the limit holds regardless of which Edge Function
-- instance handles the request.

create table if not exists public.grammar_check_throttle (
  "user" uuid primary key references auth.users(id) on delete cascade,
  last_request_at timestamptz not null default now()
);

alter table public.grammar_check_throttle enable row level security;

-- Each user can only ever see/touch their own throttle row -- there's
-- nothing here that needs to be readable across users, and the Edge
-- Function calls this using the caller's own authenticated context
-- (ctx.supabase in check-grammar/index.ts), so it's bound by these same
-- policies rather than a service-role bypass.
drop policy if exists "select own throttle" on public.grammar_check_throttle;
create policy "select own throttle" on public.grammar_check_throttle
  for select using (auth.uid() = "user");

drop policy if exists "upsert own throttle" on public.grammar_check_throttle;
create policy "upsert own throttle" on public.grammar_check_throttle
  for insert with check (auth.uid() = "user");

drop policy if exists "update own throttle" on public.grammar_check_throttle;
create policy "update own throttle" on public.grammar_check_throttle
  for update using (auth.uid() = "user");
