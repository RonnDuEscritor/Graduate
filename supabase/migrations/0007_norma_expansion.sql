-- Audit P0 4.4 follow-up -- create_project_with_sections() validates
-- p_norma against a fixed allow-list (see 0002_input_validation.sql /
-- 0004_is_roman_fix.sql), which only included 'libre', 'apa', 'vancouver'.
-- Now that NORMAS in frontend/src/types/index.ts also defines 'ieee',
-- 'chicago', 'mla' and 'harvard', the same redefinition pattern used by
-- every migration since 0002 applies here: keep everything else in the
-- function identical, only widen the p_norma allow-list to match.

create or replace function public.create_project_with_sections(
  p_title text,
  p_tipo smallint,
  p_norma text,
  p_sections jsonb -- [{ "name": "...", "fase": "...", "order_index": 0, "is_roman": false }, ...]
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
  v_section_count int;
  v_section jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'title is required';
  end if;
  if length(p_title) > 300 then
    raise exception 'title too long (max 300 characters)';
  end if;

  if p_tipo is null or p_tipo not in (0, 1, 2) then
    raise exception 'invalid tipo: must be 0, 1 or 2';
  end if;

  if p_norma is null or p_norma not in ('libre', 'apa', 'vancouver', 'ieee', 'chicago', 'mla', 'harvard') then
    raise exception 'invalid norma';
  end if;

  if p_sections is null or jsonb_typeof(p_sections) != 'array' then
    raise exception 'p_sections must be a JSON array';
  end if;
  v_section_count := jsonb_array_length(p_sections);
  if v_section_count = 0 then
    raise exception 'p_sections must not be empty';
  end if;
  if v_section_count > 200 then
    raise exception 'too many sections (max 200)';
  end if;

  for v_section in select * from jsonb_array_elements(p_sections)
  loop
    if v_section->>'name' is null or length(trim(v_section->>'name')) = 0 then
      raise exception 'every section requires a name';
    end if;
    if length(v_section->>'name') > 200 then
      raise exception 'section name too long (max 200 characters)';
    end if;
    if v_section->>'fase' is not null and length(v_section->>'fase') > 200 then
      raise exception 'section fase too long (max 200 characters)';
    end if;
    if (v_section->>'order_index')::int is null
       or (v_section->>'order_index')::int < 0
       or (v_section->>'order_index')::int > 500 then
      raise exception 'invalid order_index (must be between 0 and 500)';
    end if;
    if v_section ? 'is_roman' and jsonb_typeof(v_section->'is_roman') != 'boolean' then
      raise exception 'is_roman must be a boolean';
    end if;
  end loop;

  insert into public.projects ("user", title, tipo, norma, word_count)
  values (auth.uid(), p_title, p_tipo, p_norma, 0)
  returning * into v_project;

  insert into public.sections (project, name, fase, order_index, is_roman, word_count)
  select
    v_project.id,
    (s->>'name')::text,
    (s->>'fase')::text,
    (s->>'order_index')::int,
    coalesce((s->>'is_roman')::boolean, false),
    0
  from jsonb_array_elements(p_sections) as s;

  return v_project;
end;
$$;

grant execute on function public.create_project_with_sections(text, smallint, text, jsonb) to authenticated;

-- Audit P0 4.4 follow-up, extra finding while touching this area: the RPC
-- above only validates p_norma at PROJECT CREATION time. Changing the
-- norma of an existing project (Sidebar.tsx / DashboardPage.tsx -> the
-- store's setNorma()) goes through a plain `update projects set norma =
-- ...` instead, which was never validated anywhere -- the projects.norma
-- column never had a CHECK constraint of its own. A CHECK constraint on
-- the column closes this for every write path at once, present and
-- future, rather than only the one that happens to call the RPC.
alter table public.projects drop constraint if exists projects_norma_check;
alter table public.projects
  add constraint projects_norma_check
  check (norma in ('libre', 'apa', 'vancouver', 'ieee', 'chicago', 'mla', 'harvard'));
