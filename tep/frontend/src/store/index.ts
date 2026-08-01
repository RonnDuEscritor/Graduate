import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { debounce } from '@/lib/utils'
import type { AppState, PBProject, PBSection, PBReference, PBCitation, RevisionIssue, NormaType, TiptapDoc } from '@/types'

interface Actions {
  setProject:         (p: PBProject | null) => void
  setSections:        (s: PBSection[]) => void
  setReferences:      (r: PBReference[]) => void
  setCitations:       (c: PBCitation[]) => void
  setActiveSection:   (id: string | null) => void
  setNorma:           (n: NormaType) => void
  setRevisionIssues:  (issues: RevisionIssue[]) => void
  setAiPanel:         (open: boolean, ctx?: string) => void

  // Section save -- debounced, goes to Supabase
  saveSectionContent: (sectionId: string, content: TiptapDoc, wordCount: number) => void

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
  isSaving: false, lastSaved: null, aiPanelOpen: false, aiContext: '',

  // ── SETTERS ──────────────────────────────────────────────
  setProject:       (project)  => set({ project }),
  setSections:      (sections) => set({ sections }),
  setReferences:    (refs)     => set({ references: refs }),
  setCitations:     (cits)     => set({ citations: cits }),
  setActiveSection: (id)       => set({ activeSectionId: id }),
  setRevisionIssues:(issues)   => set({ revisionIssues: issues }),
  setAiPanel: (open, ctx='')   => set({ aiPanelOpen: open, aiContext: ctx }),

  setNorma: (norma) => {
    set({ norma })
    const { project } = get()
    if (project) {
      supabase.from('projects').update({ norma }).eq('id', project.id).then(({ error }) => {
        if (error) console.error(error)
      })
    }
  },

  // ── SAVE SECTION (debounced 1.5s) ────────────────────────
  saveSectionContent: debounce((sectionId: string, content: TiptapDoc, wordCount: number) => {
    set(state => ({
      isSaving: true,
      sections: state.sections.map(s =>
        s.id === sectionId ? { ...s, content, word_count: wordCount } : s
      ),
    }))
    supabase.from('sections')
      .update({ content, word_count: wordCount })
      .eq('id', sectionId)
      .then(({ error }) => {
        if (error) { console.error('Save error:', error); set({ isSaving: false }) }
        else set({ isSaving: false, lastSaved: new Date() })
      })
  }, 1500) as (sectionId: string, content: TiptapDoc, wordCount: number) => void,

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
