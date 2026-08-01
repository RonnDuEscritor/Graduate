import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/store'
import { TIPOS_TESIS } from '@/types'
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
    setProject(proj)
    setNorma(proj.norma)
    setSections((secsRes.data ?? []) as PBSection[])
    setReferences((refsRes.data ?? []) as PBReference[])
    setCitations((citsRes.data ?? []) as PBCitation[])
    return proj
  }, [setProject, setSections, setReferences, setCitations, setNorma])

  const listProjects = useCallback(async () => {
    const { data, error } = await supabase
      .from('projects').select('*').order('updated', { ascending: false })
    if (error) throw error
    return (data ?? []) as PBProject[]
  }, [])

  const createProject = useCallback(async (
    title: string, tipo: TipoTesis, norma: NormaType, userId: string
  ) => {
    const { data: proj, error: projErr } = await supabase
      .from('projects')
      .insert({ user: userId, title, tipo: Number(tipo), norma: String(norma), word_count: 0 })
      .select().single<PBProject>()
    if (projErr) throw projErr

    const template = TIPOS_TESIS[tipo]
    const rows: Partial<PBSection>[] = []
    let idx = 0
    for (const fase of template.fases) {
      for (const name of fase.items) {
        rows.push({
          project: proj.id, name: String(name), fase: String(fase.fase),
          order_index: idx, word_count: 0,
        })
        idx++
      }
    }
    if (rows.length > 0) {
      const { error: secErr } = await supabase.from('sections').insert(rows)
      if (secErr) throw secErr
    }
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
