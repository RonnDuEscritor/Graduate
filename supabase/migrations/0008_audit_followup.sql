-- Audit "Graduate-main-CORREGIDO" (25/08/2026) follow-up -- P1 5.1 and P1 5.6.

-- ---------------------------------------------------------------
-- 5.1 [GRAVE] is_roman backfill (0004_is_roman_fix.sql) only matched
-- section names that no longer exist verbatim in TIPOS_TESIS
-- (frontend/src/types/index.ts): it looked for 'Portada', 'Dedicatoria',
-- 'Agradecimientos', 'Resumen', 'Abstract'..., while the current template
-- names are 'Portada oficial', 'Dedicatoria y agradecimientos',
-- 'Resumen / Abstract', etc. (tipo 0), and yet other names for tipo 1/2
-- ('Portada, aprobacion, dedicatoria', ...). Any project created between
-- the original is_roman bug and the 0004 fix -- or created under tipo 1/2,
-- whose preliminary names 0004 never listed at all -- can still have
-- is_roman=false on sections that should be numbered i/ii/iii.
--
-- This backfill is tipo-aware: it joins sections to their project and
-- matches each project's preliminary-section names against the exact
-- item list TIPOS_TESIS declares for THAT tipo's first (isRoman: true)
-- fase, instead of a single flat name list assumed to fit every thesis
-- type. The original 0004 list is kept too (harmless union) in case any
-- section still carries an even older legacy name from before that name
-- set changed.
update public.sections s
set is_roman = true
from public.projects p
where s.project = p.id
  and s.is_roman = false
  and (
    -- tipo 0: 'Investigacion cientifica'
    (p.tipo = 0 and s.name in (
      'Portada oficial', 'Aprobacion del jurado',
      'Dedicatoria y agradecimientos', 'Resumen / Abstract',
      'Palabras clave / Keywords', 'Indice general',
      'Indice de tablas', 'Indice de figuras'
    ))
    -- tipo 1: 'Proyecto factible / tecnico'
    or (p.tipo = 1 and s.name in (
      'Portada, aprobacion, dedicatoria',
      'Resumen / Abstract y palabras clave',
      'Indice general', 'Indice de tablas y figuras'
    ))
    -- tipo 2: 'Revision sistematica / documental'
    or (p.tipo = 2 and s.name in (
      'Portada, aprobacion, dedicatoria',
      'Resumen / Abstract y palabras clave',
      'Indice general', 'Indice de cuadros comparativos'
    ))
    -- legacy names from before the current TIPOS_TESIS wording (kept from
    -- the original 0004 backfill, tipo-independent since they no longer
    -- appear in any current template but may still exist on old rows)
    or s.name in (
      'Portada', 'Dedicatoria', 'Agradecimientos', 'Resumen', 'Abstract',
      'Indice de tablas y figuras', 'Lista de abreviaturas',
      'Indice de cuadros comparativos'
    )
  );

-- ---------------------------------------------------------------
-- 5.6 [GRAVE/P1] syncSectionCitations() (store/index.ts) decides whether
-- to INSERT or UPDATE a citation by checking the in-memory `citations`
-- array from client state, not the database. If two saves fire close
-- together (e.g. rapid edits with autosave, or two tabs on the same
-- section) before the first INSERT's response has updated that local
-- state, both can independently decide "no existing row for this
-- reference" and insert two rows for the same (section, reference) pair.
-- Nothing in the schema stopped that: citations only had a primary key
-- on id, plus the composite FKs added by 0006_citations_integrity.sql
-- (which guard against cross-project mixing, not duplicates).
--
-- Deduplicate first (keep the earliest row per section+reference, by
-- created timestamp and then by id as a tiebreaker for equal timestamps,
-- so existing order_of_appearance history for the surviving row stays
-- meaningful), then add the constraint so this class of duplicate becomes
-- impossible at the database level regardless of client-side timing.
with ranked as (
  select id,
         row_number() over (
           partition by section, reference
           order by created asc, id asc
         ) as rn
  from public.citations
)
delete from public.citations c
using ranked
where c.id = ranked.id
  and ranked.rn > 1;

alter table public.citations
  add constraint citations_section_reference_unique unique (section, reference);
