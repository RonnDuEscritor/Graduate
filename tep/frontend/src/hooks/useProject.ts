import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/store'
import { TIPOS_TESIS } from '@/types'
import { getLocalDraft, clearLocalDraft } from '@/lib/localDraftBackup'
import type { PBProject, PBSection, PBReference, PBCitation, TipoTesis, NormaType } from '@/types'

export function useProject() {
  const { setProject, setSections, setReferences, setCitations, setNorma } = useStore()

  const loadProject = useCallback(async (projectId: string) => {
    const [projRes, secsRes, refsRes, citsRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single<PBProject>(),
      supabase.from('sections').select('*').eq('project', projectId).order('order_index'),
      supabase.from('bibliography').select('*').eq('project', projectId).order('created'),
      supabase.from('citations').select('*').eq('project', projectId),
    ])
    if (projRes.error) throw projRes.error
    if (secsRes.error) throw secsRes.error
    if (refsRes.error) throw refsRes.error
    if (citsRes.error) throw citsRes.error

    const proj = projRes.data
    const secs = (secsRes.data ?? []) as PBSection[]
    setProject(proj)
    setNorma(proj.norma)
    setSections(secs)
    setReferences((refsRes.data ?? []) as PBReference[])
    setCitations((citsRes.data ?? []) as PBCitation[])

    // Audit 7.1/8.1 fix: if a local draft exists for a section and is newer
    // than what Supabase has, the last save attempt for that section never
    // completed (closed tab, connection loss, Supabase outage mid-write).
    // Offer to restore it instead of silently opening the older server copy.
    const recoverable = secs.filter(s => {
      const draft = getLocalDraft(s.id)
      if (!draft) return false
      const serverTime = s.updated ? new Date(s.updated).getTime() : 0
      return draft.savedAt > serverTime
    })
    if (recoverable.length > 0) {
      const names = recoverable.map(s => `- ${s.name}`).join('\n')
      const restore = confirm(
        `Se encontraron cambios sin guardar de una sesion anterior en:\n${names}\n\n` +
        `Es posible que el navegador se haya cerrado antes de terminar de guardar. ` +
        `Aceptar para RECUPERAR esos cambios, Cancelar para descartarlos y mantener la ultima version guardada.`
      )
      const { saveSectionContent } = useStore.getState()
      recoverable.forEach(s => {
        const draft = getLocalDraft(s.id)
        if (!draft) return
        if (restore) {
          saveSectionContent(s.id, draft.content, draft.wordCount) // re-queues the normal debounced Supabase save
        } else {
          clearLocalDraft(s.id)
        }
      })
    }

    return proj
  }, [setProject, setSections, setReferences, setCitations, setNorma])

  const listProjects = useCallback(async () => {
    const { data, error } = await supabase
      .from('projects').select('*').order('updated', { ascending: false })
    if (error) throw error
    return (data ?? []) as PBProject[]
  }, [])

  const createProject = useCallback(async (
    title: string, tipo: TipoTesis, norma: NormaType
  ) => {
    const template = TIPOS_TESIS[tipo]
    const sectionsPayload: { name: string, fase: string, order_index: number }[] = []
    let idx = 0
    for (const fase of template.fases) {
      for (const name of fase.items) {
        sectionsPayload.push({ name: String(name), fase: String(fase.fase), order_index: idx })
        idx++
      }
    }

    // Audit 4.5 fix: project + all its template sections are created in a
    // single Postgres transaction (see create_project_with_sections in
    // supabase/migrations/0001_init.sql) -- previously these were two
    // separate inserts, so a failure on the second one could leave a
    // project with zero sections.
    const { data: proj, error } = await supabase.rpc('create_project_with_sections', {
      p_title: title,
      p_tipo: Number(tipo),
      p_norma: String(norma),
      p_sections: sectionsPayload,
    }).single<PBProject>()
    if (error) throw error
    return proj
  }, [])

  const deleteProject = useCallback(async (id: string) => {
    // sections/bibliography/citations/versions all cascade-delete via FK (see supabase/migrations/0001_init.sql)
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) throw error
  }, [])

  const updateProjectMeta = useCallback(async (id: string, data: Partial<PBProject>) => {
    const { data: updated, error } = await supabase
      .from('projects').update(data).eq('id', id).select().single<PBProject>()
    if (error) throw error
    return updated
  }, [])

  const saveVersion = useCallback(async (label: string, auto = false) => {
    const { project, sections } = useStore.getState()
    if (!project) return
    const snapshot: Record<string, unknown> = {}
    sections.forEach(s => { snapshot[s.id] = s.content })
    const { error } = await supabase.from('versions').insert({ project: project.id, label, snapshot, auto })
    if (error) throw error
  }, [])

  return { loadProject, listProjects, createProject, deleteProject, updateProjectMeta, saveVersion }
}
