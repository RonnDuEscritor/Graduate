-- Audit P0 4.2 fix -- citations stores project, section and reference as
-- three independent foreign keys (each individually valid), but nothing in
-- the schema stopped a citations row from pointing at a section that
-- belongs to a DIFFERENT project than the one on the row, or a reference
-- that belongs to a different project too. RLS only checks that
-- citations.project belongs to the caller -- it says nothing about whether
-- section/reference actually belong to that same project. A client that
-- knows valid UUIDs from two of the user's own projects could otherwise
-- insert a citations row that mixes them, and nothing in the database
-- would reject it.
--
-- Composite foreign keys close this at the schema level -- the only place
-- this kind of guarantee actually holds regardless of what any given
-- client sends: citations(section, project) can now only point at a row
-- of sections that has that exact (id, project) pair, and the same for
-- reference/bibliography. This requires a unique constraint on
-- sections(id, project) and bibliography(id, project) as the target of the
-- composite FK -- trivial to add since id is already a primary key (and
-- therefore already unique on its own).

alter table public.sections
  add constraint sections_id_project_unique unique (id, project);

alter table public.bibliography
  add constraint bibliography_id_project_unique unique (id, project);

-- Backfill safety: if any pre-existing citations row already has a
-- mismatched section/reference project (which would have been possible
-- only through a bug or a manually-crafted request, never through normal
-- app usage), adding the composite FK below would fail outright. Deleting
-- such rows here is safe -- they never represented a real citation the
-- editor could have shown consistently in the first place, since section
-- and reference resolve to different projects than citations.project.
delete from public.citations c
where not exists (
  select 1 from public.sections s where s.id = c.section and s.project = c.project
) or not exists (
  select 1 from public.bibliography b where b.id = c.reference and b.project = c.project
);

alter table public.citations
  add constraint citations_section_project_fk
  foreign key (section, project) references public.sections(id, project) on delete cascade;

alter table public.citations
  add constraint citations_reference_project_fk
  foreign key (reference, project) references public.bibliography(id, project) on delete cascade;
