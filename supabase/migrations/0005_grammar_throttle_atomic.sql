-- Audit item 5 fix -- check-grammar's throttle did SELECT last_request_at,
-- decide in application code, then UPSERT. Two near-simultaneous requests
-- from the same user could both pass the SELECT before either one wrote
-- its UPSERT, letting both through despite the 800ms limit -- the check
-- and the write weren't a single atomic operation. This wraps both steps
-- into one Postgres statement (an UPSERT whose UPDATE branch only fires
-- when enough time has actually passed), so the decision and the write
-- happen atomically under Postgres's own row locking -- there is no gap
-- between "check" and "acquire" for a second concurrent request to land in.

create or replace function public.try_acquire_grammar_throttle(p_min_interval_ms int default 800)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acquired boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- On first request for this user, the INSERT branch runs and always
  -- succeeds. On a later request, ON CONFLICT routes to the UPDATE branch,
  -- but its WHERE clause only lets the update (and therefore the
  -- `returning`) go through if enough time has passed since
  -- last_request_at -- otherwise this row is left untouched, exactly as if
  -- ON CONFLICT DO NOTHING had run, and v_acquired stays null.
  insert into public.grammar_check_throttle ("user", last_request_at)
  values (auth.uid(), now())
  on conflict ("user") do update
    set last_request_at = now()
    where public.grammar_check_throttle.last_request_at
      <= now() - (p_min_interval_ms || ' milliseconds')::interval
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

grant execute on function public.try_acquire_grammar_throttle(int) to authenticated;
