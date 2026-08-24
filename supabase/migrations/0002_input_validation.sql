-- Audit 9.1 fix (GRAVE) -- create_project_with_sections() accepted p_tipo,
-- p_norma and p_sections with no server-side validation at all. Every
-- check (valid tipo 0-2, valid norma, a sane number of sections) lived
-- only in the frontend, which any authenticated caller can bypass by
-- calling the RPC directly (e.g. via curl with a valid JWT) -- for example
-- sending thousands of sections, or a p_tipo/p_norma value the rest of the
-- app doesn't know how to render. This redefines the same function with
-- validation enforced in the database itself, which is the only place a
-- check actually can't be bypassed by the client. Safe to run multiple
-- times: `create or replace function` with the same signature updates the
-- existing function in place, no data migration involved.

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
  v_section_count int;
  v_section jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- p_title: required, and bounded so a runaway client can't write an
  -- unbounded string into the row (title is shown all over the UI --
  -- dashboard cards, page headers, exported documents).
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'title is required';
  end if;
  if length(p_title) > 300 then
    raise exception 'title too long (max 300 characters)';
  end if;

  -- p_tipo: must match one of the three thesis types the frontend actually
  -- knows how to render (TIPOS_TESIS in frontend/src/types/index.ts).
  -- Anything else would silently break TIPOS_TESIS[p_tipo] lookups
  -- throughout the app (section guidance, academic validation rules, etc).
  if p_tipo is null or p_tipo not in (0, 1, 2) then
    raise exception 'invalid tipo: must be 0, 1 or 2';
  end if;

  -- p_norma: must match one of the citation norms the frontend actually
  -- supports (NORMAS in frontend/src/types/index.ts).
  if p_norma is null or p_norma not in ('libre', 'apa', 'vancouver') then
    raise exception 'invalid norma';
  end if;

  -- p_sections: a real thesis structure has on the order of 10-40 sections
  -- across its phases. 200 is a generous ceiling that still stops a
  -- pathological or malicious payload from writing thousands of rows in
  -- one call.
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

  -- Each section's own fields, same reasoning as p_title above.
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
  end loop;

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
