import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { saveDraftLocally, clearLocalDraft } from '@/lib/localDraftBackup'
import type { AppState, PBProject, PBSection, PBReference, PBCitation, RevisionIssue, NormaType, TiptapDoc } from '@/types'

// Module-level (not reactive state -- pure bookkeeping for the per-section
// debounced autosave, keyed by sectionId so edits in different sections
// never cancel each other out; see saveSectionContent/flushPendingSaves).
const pendingTimers  = new Map<string, ReturnType<typeof setTimeout>>()
const pendingPayloads = new Map<string, { content: TiptapDoc, wordCount: number }>()

function flushSection(sectionId: string, set: (partial: Partial<AppState>) => void): Promise<void> {
  const payload = pendingPayloads.get(sectionId)
  pendingTimers.delete(sectionId)
  pendingPayloads.delete(sectionId)
  if (!payload) return Promise.resolve()
  set({ isSaving: true })
  // Audit P1 item 13 follow-up: returns the promise chain (previously
  // fire-and-forget) so callers -- specifically signOut() in
  // hooks/useAuth.ts -- can await the write actually finishing before
  // clearing local drafts, instead of racing a logout against an
  // in-flight save.
  // Audit P1 item 13 follow-up: wrapped in Promise.resolve() because
  // Supabase's query builder `.then()` returns a PromiseLike, not a full
  // Promise (missing .catch/.finally) -- callers awaiting this need an
  // actual Promise<void>.
  return Promise.resolve(supabase.from('sections')
    .update({ content: payload.content, word_count: payload.wordCount })
    .eq('id', sectionId)
    .then(({ error }) => {
      if (error) {
        // Audit 7.1/8.1: on a failed write we deliberately KEEP the local
        // draft (instead of clearing it) so the content survives a lost
        // connection or a Supabase outage and can still be recovered/retried
        // the next time this project loads.
        console.error('Save error:', error)
        set({ isSaving: false })
      } else {
        clearLocalDraft(sectionId) // server now has this content -- the local backstop is no longer needed
        set({ isSaving: false, lastSaved: new Date() })
      }
    }))
}

interface Actions {
  setProject:         (p: PBProject | null) => void
  setSections:        (s: PBSection[]) => void
  setReferences:      (r: PBReference[]) => void
  setCitations:       (c: PBCitation[]) => void
  setActiveSection:   (id: string | null) => void
  setNorma:           (n: NormaType) => void
  setRevisionIssues:  (issues: RevisionIssue[]) => void
  setSidebarOpen:     (open: boolean) => void
  setSaving:          (saving: boolean) => void
  setLastSaved:       (date: Date | null) => void

  // Section save -- debounced per-section, goes to Supabase
  saveSectionContent: (sectionId: string, content: TiptapDoc, wordCount: number) => void
  flushPendingSaves:  () => Promise<void>
  syncSectionCitations: (sectionId: string, refIdsInOrder: string[]) => void

  // References
  upsertReference: (r: PBReference) => void
  removeReference: (id: string) => void

  // Citations
  addCitation:    (c: PBCitation) => void
  removeCitation: (id: string) => void

  // Derived
  getActiveSection:    () => PBSection | null
  getCitedRefIds:      () => Set<string>
  getVancouverOrder:   () => Map<string, number>
}

export const useStore = create<AppState & Actions>((set, get) => ({
  // ── STATE ────────────────────────────────────────────────
  project: null, sections: [], references: [], citations: [],
  activeSectionId: null, norma: 'libre', revisionIssues: [],
  isSaving: false, lastSaved: null, sidebarOpen: false,

  // ── SETTERS ──────────────────────────────────────────────
  setProject:       (project)  => set({ project }),
  setSections:      (sections) => set({ sections }),
  setReferences:    (refs)     => set({ references: refs }),
  setCitations:     (cits)     => set({ citations: cits }),
  setActiveSection: (id)       => set({ activeSectionId: id }),
  setRevisionIssues:(issues)   => set({ revisionIssues: issues }),
  setSidebarOpen: (open)       => set({ sidebarOpen: open }),
  setSaving:      (saving)     => set({ isSaving: saving }),
  setLastSaved:   (date)       => set({ lastSaved: date }),

  setNorma: (norma) => {
    set({ norma })
    const { project } = get()
    if (project) {
      supabase.from('projects').update({ norma }).eq('id', project.id).then(({ error }) => {
        if (error) console.error(error)
      })
    }
  },

  // ── SAVE SECTION (debounced 1.5s -- PER SECTION, not global) ─
  // Bug fixed here (audit 3.3): the old implementation wrapped a single
  // shared debounce() around this whole function, so typing in section B
  // within 1.5s of editing section A would cancel A's pending save and
  // silently drop those edits. Each sectionId now gets its own timer via
  // the module-level maps below.
  saveSectionContent: (sectionId, content, wordCount) => {
    set(state => ({
      sections: state.sections.map(s =>
        s.id === sectionId ? { ...s, content, word_count: wordCount } : s
      ),
    }))
    // Audit 7.1/8.1 fix: written synchronously, immediately -- well before
    // the 1.5s debounce below even starts its Supabase request -- so a
    // closed tab or lost connection can never lose more than what's already
    // sitting in localStorage.
    saveDraftLocally(sectionId, content, wordCount)
    pendingPayloads.set(sectionId, { content, wordCount })
    const existingTimer = pendingTimers.get(sectionId)
    if (existingTimer) clearTimeout(existingTimer)
    pendingTimers.set(sectionId, setTimeout(() => flushSection(sectionId, set), 1500))
  },

  // Audit 3.4 fix: immediately saves every section with a pending debounced
  // write. Wired up to visibilitychange/pagehide/beforeunload in App.tsx so
  // closing the tab or switching away doesn't silently drop the last 1.5s
  // of edits.
  // Audit P1 item 13 follow-up: now returns a Promise that resolves once
  // every flush has settled, so signOut() (hooks/useAuth.ts) can await it
  // before wiping local drafts, instead of firing-and-forgetting.
  flushPendingSaves: () => {
    const flushes: Promise<void>[] = []
    pendingTimers.forEach((timer, sectionId) => {
      clearTimeout(timer)
      flushes.push(flushSection(sectionId, set))
    })
    return Promise.all(flushes).then(() => undefined)
  },

  // Audit 2.1 fix (GRAVE): reconciles the `citations` table against what
  // is ACTUALLY in the document right now (see extractCitationRefIds in
  // lib/utils.ts), instead of trusting rows written at insertion time that
  // could silently go stale (e.g. the user deletes a citation chip by hand
  // and the database never finds out). Called from SectionEditor on every
  // save, but only fires network calls when the extracted reference list
  // actually differs from what's already known.
  syncSectionCitations: (sectionId, refIdsInOrder) => {
    const { project, sections, citations } = get()
    if (!project) return
    const section = sections.find(s => s.id === sectionId)
    const sectionOrderIndex = section?.order_index ?? 9999

    const existing = citations.filter(c => c.section === sectionId)
    const existingByRef = new Map(existing.map(c => [c.reference, c]))
    const newRefSet = new Set(refIdsInOrder)

    // Reference no longer appears anywhere in the document -> drop the row.
    // This is the exact fix for the drift the audit flagged: previously
    // deleting a chip left the database (and therefore the bibliography
    // entry and Vancouver numbering) untouched.
    existing.forEach(c => {
      if (newRefSet.has(c.reference)) return
      supabase.from('citations').delete().eq('id', c.id).then(({ error }) => {
        if (error) console.error('Citation cleanup error:', error)
      })
      set(s => ({ citations: s.citations.filter(x => x.id !== c.id) }))
    })

    // New reference, or one whose position in the document moved (a
    // paragraph got reordered/deleted) -> insert or correct
    // order_of_appearance, which is what drives real reading-order
    // Vancouver numbering (audit item 3).
    //
    // Audit 5.6 fix (GRAVE/P1): this used to branch on `existingByRef`,
    // which comes from client-side state (get().citations) -- if two
    // saves land close together, both can read that same stale state
    // before either INSERT's response has come back and updated it, so
    // both decide "no row yet" and insert two rows for the same
    // (section, reference). Migration 0008 adds a UNIQUE(section,
    // reference) constraint precisely so the database rejects that
    // regardless of what the client believed; .upsert with onConflict
    // targets that same constraint so the second of two racing calls
    // becomes a safe no-op UPDATE instead of an error or a duplicate row.
    refIdsInOrder.forEach((refId, position) => {
      const orderOfAppearance = sectionOrderIndex * 10000 + position
      const row = existingByRef.get(refId)
      if (!row || row.order_of_appearance !== orderOfAppearance) {
        supabase.from('citations')
          .upsert(
            { project: project.id, section: sectionId, reference: refId, order_of_appearance: orderOfAppearance },
            { onConflict: 'section,reference' },
          )
          .select().single()
          .then(({ data, error }) => {
            if (error) { console.error('Citation sync error:', error); return }
            set(s => ({
              citations: s.citations.some(x => x.id === data.id)
                ? s.citations.map(x => x.id === data.id ? data : x)
                : [...s.citations, data],
            }))
          })
      }
    })
  },

  // ── REFERENCES ────────────────────────────────────────────
  upsertReference: (ref) => set(state => {
    const exists = state.references.find(r => r.id === ref.id)
    return {
      references: exists
        ? state.references.map(r => r.id === ref.id ? ref : r)
        : [...state.references, ref],
    }
  }),

  removeReference: (id) => set(state => ({
    references: state.references.filter(r => r.id !== id),
    citations:  state.citations.filter(c => c.reference !== id),
  })),

  // ── CITATIONS ─────────────────────────────────────────────
  addCitation:    (cit) => set(s => ({ citations: [...s.citations, cit] })),
  removeCitation: (id)  => set(s => ({ citations: s.citations.filter(c => c.id !== id) })),

  // ── DERIVED ───────────────────────────────────────────────
  getActiveSection: () => {
    const { sections, activeSectionId } = get()
    return sections.find(s => s.id === activeSectionId) ?? null
  },

  getCitedRefIds: () => new Set(get().citations.map(c => c.reference)),

  getVancouverOrder: () => {
    const map = new Map<string, number>()
    const sorted = [...get().citations].sort((a,b) => a.order_of_appearance - b.order_of_appearance)
    let n = 1
    sorted.forEach(c => { if (!map.has(c.reference)) map.set(c.reference, n++) })
    return map
  },
}))
