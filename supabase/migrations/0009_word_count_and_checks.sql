-- Audit "Exhaustiva" (Graduate-main, 31/08/2026) follow-up -- C-01 (partial,
-- see generate-docx/index.ts), G-03 and G-04.

-- ---------------------------------------------------------------
-- G-03 [GRAVE] create_project_with_sections() validates that p_tipo is 0,
-- 1 or 2, but that check only guards the RPC path. RLS policy
-- "projects_all_own" lets the authenticated owner INSERT/UPDATE the
-- projects row directly (needed for legitimate edits like renaming a
-- project or changing norma), and nothing at the column level stopped a
-- direct write from setting tipo to any other smallint. TIPOS_TESIS[tipo]
-- (frontend/src/types/index.ts) is a fixed-length array indexed by tipo --
-- an out-of-range value resolves to undefined and breaks the editor,
-- export and progress screens wherever TIPOS_TESIS[project.tipo] is read.
alter table public.projects drop constraint if exists projects_tipo_check;
alter table public.projects
  add constraint projects_tipo_check check (tipo in (0, 1, 2));

-- ---------------------------------------------------------------
-- G-04 [GRAVE] sections.word_count was whatever the client sent alongside
-- content in the same UPDATE call (store/index.ts's saveSectionContent
-- always writes {content, word_count} together) -- nothing recomputed it
-- from the actual Tiptap JSON server-side. projects.word_count (used for
-- progress screens and the estimated-pages system) is only a SUM of
-- sections.word_count (see sync_project_word_count(), 0001_init.sql), so
-- a wrong client-sent value propagates straight into project-level
-- progress and page estimates with nothing to catch it.
--
-- count_tiptap_words() walks the same shape saveSectionContent already
-- writes (Tiptap's `{ type, content: [...], text }` tree), one node per
-- visit, mirroring frontend/src/lib/utils.ts's countWords() exactly
-- (check node.text, then recurse into node.content) -- same algorithm,
-- now enforced server-side instead of only trusted from the client.
--
-- Deliberately NOT implemented with PostgreSQL's jsonpath recursive
-- descent ('$.**.text'): verified against a live PostgreSQL 16 instance
-- while writing this migration that '$.**' produces duplicate matches
-- for the same leaf node (every text node was counted twice, so a
-- 12-word section came back as 24) -- a real, easy-to-miss gotcha of
-- that operator, not a hypothetical concern. The explicit recursive walk
-- below visits each node exactly once and was verified against nested
-- lists, blockquotes, multiple text runs with marks (bold/italic),
-- empty/null content and an empty object, all producing the same word
-- count frontend's countWords() would.
create or replace function public.count_tiptap_words(doc jsonb)
returns integer
language plpgsql
immutable
as $$
declare
  total integer := 0;
  node jsonb;
  txt text;
begin
  if doc is null or jsonb_typeof(doc) <> 'object' then
    return 0;
  end if;

  if doc ? 'text' and jsonb_typeof(doc->'text') = 'string' then
    txt := trim(doc->>'text');
    if txt <> '' then
      total := total + array_length(regexp_split_to_array(txt, '\s+'), 1);
    end if;
  end if;

  if jsonb_typeof(doc->'content') = 'array' then
    for node in select * from jsonb_array_elements(doc->'content')
    loop
      total := total + public.count_tiptap_words(node);
    end loop;
  end if;

  return total;
end;
$$;

create or replace function public.enforce_section_word_count()
returns trigger
language plpgsql
as $$
begin
  new.word_count := public.count_tiptap_words(new.content);
  return new;
end;
$$;

drop trigger if exists enforce_section_word_count on public.sections;
create trigger enforce_section_word_count
  before insert or update of content on public.sections
  for each row execute procedure public.enforce_section_word_count();

-- One-time backfill: recompute every existing row so historical
-- word_count values (and the projects.word_count sums derived from them)
-- reflect the real content instead of whatever was last trusted from a
-- client. The trigger above keeps it correct going forward.
update public.sections set word_count = public.count_tiptap_words(content);
