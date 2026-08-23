import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { AppState, PBProject, PBSection, PBReference, PBCitation, RevisionIssue, NormaType, TiptapDoc } from '@/types'

// Module-level (not reactive state -- pure bookkeeping for the per-section
// debounced autosave, keyed by sectionId so edits in different sections
// never cancel each other out; see saveSectionContent/flushPendingSaves).
const pendingTimers  = new Map<string, ReturnType<typeof setTimeout>>()
const pendingPayloads = new Map<string, { content: TiptapDoc, wordCount: number }>()

function flushSection(sectionId: string, set: (partial: Partial<AppState>) => void) {
  const payload = pendingPayloads.get(sectionId)
  pendingTimers.delete(sectionId)
  pendingPayloads.delete(sectionId)
  if (!payload) return
  set({ isSaving: true })
  supabase.from('sections')
    .update({ content: payload.content, word_count: payload.wordCount })
    .eq('id', sectionId)
    .then(({ error }) => {
      if (error) { console.error('Save error:', error); set({ isSaving: false }) }
      else set({ isSaving: false, lastSaved: new Date() })
    })
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
  flushPendingSaves:  () => void

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
    pendingPayloads.set(sectionId, { content, wordCount })
    const existingTimer = pendingTimers.get(sectionId)
    if (existingTimer) clearTimeout(existingTimer)
    pendingTimers.set(sectionId, setTimeout(() => flushSection(sectionId, set), 1500))
  },

  // Audit 3.4 fix: immediately saves every section with a pending debounced
  // write. Wired up to visibilitychange/pagehide/beforeunload in App.tsx so
  // closing the tab or switching away doesn't silently drop the last 1.5s
  // of edits.
  flushPendingSaves: () => {
    pendingTimers.forEach((timer, sectionId) => {
      clearTimeout(timer)
      flushSection(sectionId, set)
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
