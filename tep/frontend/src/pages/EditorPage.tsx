import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '@/store'
import { useProject } from '@/hooks/useProject'
import { useAuth } from '@/hooks/useAuth'
import { TIPOS_TESIS, NORMAS } from '@/types'
import { toRoman } from '@/lib/utils'
import Sidebar       from '@/components/sidebar/Sidebar'
import Toolbar       from '@/components/editor/Toolbar'
import SectionEditor from '@/components/editor/SectionEditor'
import AIPanel       from '@/components/ai/AIPanel'
import ExportPanel   from '@/components/export/ExportPanel'

export default function EditorPage() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const { user }  = useAuth()
  const { loadProject } = useProject()
  const { project, sections, norma, aiPanelOpen, setAiPanel } = useStore()

  const [loading,    setLoading]    = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    if (!id || !user) return
    loadProject(id)
      .then(() => setLoading(false))
      .catch(() => { setError('No se pudo cargar el proyecto.'); setLoading(false) })
  }, [id, user, loadProject])

  if (loading) return (
    <div className="h-full flex items-center justify-center bg-brand-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-brand-400 text-sm">Cargando documentoâ€¦</span>
      </div>
    </div>
  )

  if (error) return (
    <div className="h-full flex items-center justify-center bg-brand-950">
      <div className="text-center">
        <p className="text-red-400 text-sm mb-3">{error}</p>
        <button onClick={() => navigate('/')} className="text-brand-400 text-xs underline">
          Volver al dashboard
        </button>
      </div>
    </div>
  )

  if (!project) return null

  const tipo      = TIPOS_TESIS[project.tipo]
  const normaClass = NORMAS[norma].cssClass

  // Build page number map â€” always from TIPOS_TESIS structure, not from DB sections
  let arPg = 1, romPg = 1
  const pageNums = new Map<string, string>()

  // Build a map of sectionName â†’ PBSection (for saved content)
  const sectionByName = new Map(sections.map(s => [s.name, s]))

  tipo.fases.forEach(fase => {
    fase.items.forEach(name => {
      const pgLabel = fase.isRoman ? toRoman(romPg) : String(arPg)
      pageNums.set(name, pgLabel)
      if (fase.isRoman) romPg++; else arPg++
    })
  })

  return (
    <div className="h-full flex overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top action bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-brand-100 flex-shrink-0">
          <span className="text-brand-300 text-xs font-medium truncate max-w-xs">{project.title}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAiPanel(!aiPanelOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                aiPanelOpen
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'border-brand-200 text-brand-500 hover:border-brand-400'
              }`}>
              <i className="ti ti-brain text-sm" />
              Asesor IA
            </button>
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors">
              <i className="ti ti-download text-sm" />
              Exportar
            </button>
          </div>
        </div>

        <Toolbar />

        <div className="flex-1 flex overflow-hidden">
          {/* Document area â€” renders ALL sections from TIPOS_TESIS structure */}
          <div className="flex-1 overflow-y-auto bg-[#E8E4F0] py-8 px-4">
            {tipo.fases.map(fase =>
              fase.items.map(name => {
                // Use saved section if exists, otherwise create a virtual one
                const savedSection = sectionByName.get(name)
                const sectionId = savedSection?.id ?? `virtual-${name}`
                const content   = savedSection?.content ?? null
                const wordCount = savedSection?.word_count ?? 0

                return (
                  <SectionEditor
                    key={sectionId}
                    sectionId={sectionId}
                    sectionName={name}
                    fase={fase.fase}
                    isRoman={fase.isRoman}
                    content={content}
                    wordCount={wordCount}
                    pageNum={pageNums.get(name) ?? '1'}
                    tesisTitulo={project.title}
                    normaClass={normaClass}
                    projectId={project.id}
                  />
                )
              })
            )}
            <div className="h-16" />
          </div>

          {aiPanelOpen && <AIPanel onClose={() => setAiPanel(false)} />}
        </div>
      </div>

      {showExport && <ExportPanel onClose={() => setShowExport(false)} />}
    </div>
  )
}
