import { useCallback } from 'react'
import { pb } from '@/lib/pb'
import { useStore } from '@/store'
import { TIPOS_TESIS } from '@/types'
import type { PBProject, PBSection, PBReference, PBCitation, TipoTesis, NormaType } from '@/types'

export function useProject() {
  const { setProject, setSections, setReferences, setCitations, setNorma } = useStore()

  const loadProject = useCallback(async (projectId: string) => {
    const [proj, secs, refs, cits] = await Promise.all([
      pb.collection('projects').getOne<PBProject>(projectId),
      pb.collection('sections').getFullList<PBSection>({ filter: `project="${projectId}"`, sort: 'order_index' }),
      pb.collection('references').getFullList<PBReference>({ filter: `project="${projectId}"`, sort: 'created' }),
      pb.collection('citations').getFullList<PBCitation>({ filter: `project="${projectId}"` }),
    ])
    setProject(proj)
    setNorma(proj.norma)
    setSections(secs)
    setReferences(refs)
    setCitations(cits)
    return proj
  }, [setProject, setSections, setReferences, setCitations, setNorma])

  const listProjects = useCallback(async () => {
    return pb.collection('projects').getFullList<PBProject>({ sort: '-updated' })
  }, [])

  const createProject = useCallback(async (
    title: string, tipo: TipoTesis, norma: NormaType, userId: string
  ) => {
    const proj = await pb.collection('projects').create<PBProject>({
      user: userId, title, tipo: Number(tipo), norma: String(norma), word_count: 0,
    })
    const template = TIPOS_TESIS[tipo]
    let idx = 0
    for (const fase of template.fases) {
      for (const name of fase.items) {
        await pb.collection('sections').create<PBSection>({
          project: proj.id, name: String(name), fase: String(fase.fase),
          order_index: idx, word_count: 0,
        })
        idx++
      }
    }
    return proj
  }, [])

  const deleteProject = useCallback(async (id: string) => {
    await pb.collection('projects').delete(id)
  }, [])

  const updateProjectMeta = useCallback(async (id: string, data: Partial<PBProject>) => {
    return pb.collection('projects').update<PBProject>(id, data)
  }, [])

  const saveVersion = useCallback(async (label: string, auto = false) => {
    const { project, sections } = useStore.getState()
    if (!project) return
    const snapshot: Record<string, unknown> = {}
    sections.forEach(s => { snapshot[s.id] = s.content })
    await pb.collection('versions').create({ project: project.id, label, snapshot, auto })
  }, [])

  return { loadProject, listProjects, createProject, deleteProject, updateProjectMeta, saveVersion }
}
