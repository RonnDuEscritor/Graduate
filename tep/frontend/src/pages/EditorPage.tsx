import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '@/store'
import { useProject } from '@/hooks/useProject'
import { useAuth } from '@/hooks/useAuth'
import { TIPOS_TESIS, NORMAS } from '@/types'
import { toRoman, cn } from '@/lib/utils'
import type { LTMatch } from '@/hooks/useLanguageTool'
import Sidebar       from '@/components/sidebar/Sidebar'
import Toolbar       from '@/components/editor/Toolbar'
import SectionEditor from '@/components/editor/SectionEditor'
import AIPanel       from '@/components/ai/AIPanel'
import ExportPanel   from '@/components/export/ExportPanel'

const ZOOM_LEVELS = [0.6, 0.75, 0.9, 1.0, 1.15, 1.3]

export default function EditorPage() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const { user }  = useAuth()
  const { loadProject } = useProject()
  const { project, sections, norma, aiPanelOpen, setAiPanel } = useStore()

  const [loading,    setLoading]    = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [error,      setError]      = useState('')
  const [zoomIdx,    setZoomIdx]    = useState(3)

  // Grammar state — collected from all section editors
  const [grammarMatches,           setGrammarMatches]           = useState<LTMatch[]>([])
  const [activeSectionForGrammar,  setActiveSectionForGrammar]  = useState<string | undefined>()

  useEffect(() => {
    if (!id || !user) return
    loadProject(id)
      .then(() => setLoading(false))
      .catch(() => { setError('No se pudo cargar el proyecto.'); setLoading(false) })
  }, [id, user, loadProject])

  // Receive grammar results from any SectionEditor
  const handleGrammarResults = useCallback((matches: LTMatch[], sectionId: string) => {
    setGrammarMatches(matches)
    setActiveSectionForGrammar(sectionId)
  }, [])

  if (loading) return (
    <div className="h-full flex items-center justify-center bg-brand-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-brand-400 text-sm">Cargando documento...</span>
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

  const tipo       = TIPOS_TESIS[project.tipo]
  const normaClass = NORMAS[norma].cssClass
  const zoom       = ZOOM_LEVELS[zoomIdx]

  let arPg = 1, romPg = 1
  const pageNums      = new Map<string, string>()
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
      <Sidebar
        grammarMatches={grammarMatches}
        activeSectionForGrammar={activeSectionForGrammar}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-brand-100 flex-shrink-0">
          <span className="text-brand-300 text-xs font-medium truncate max-w-xs">{project.title}</span>

          <div className="flex items-center gap-3">
            {/* Zoom */}
            <div className="flex items-center gap-1 bg-brand-50 rounded-lg px-1 py-0.5">
              <button onClick={() => setZoomIdx(i => Math.max(0, i - 1))}
                disabled={zoomIdx === 0}
                className="w-6 h-6 flex items-center justify-center rounded text-brand-500 hover:bg-white disabled:opacity-30 transition-all">
                <i className="ti ti-minus text-xs" />
              </button>
              <span className="text-xs text-brand-500 w-10 text-center select-none">
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={() => setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
                disabled={zoomIdx === ZOOM_LEVELS.length - 1}
                className="w-6 h-6 flex items-center justify-center rounded text-brand-500 hover:bg-white disabled:opacity-30 transition-all">
                <i className="ti ti-plus text-xs" />
              </button>
              <button onClick={() => setZoomIdx(3)} title="Restablecer zoom"
                className="w-6 h-6 flex items-center justify-center rounded text-brand-400 hover:bg-white transition-all">
                <i className="ti ti-zoom-reset text-xs" />
              </button>
            </div>

            <button onClick={() => setAiPanel(!aiPanelOpen)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                aiPanelOpen
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'border-brand-200 text-brand-500 hover:border-brand-400'
              )}>
              <i className="ti ti-brain text-sm" />
              Asesor IA
            </button>

            <button onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors">
              <i className="ti ti-download text-sm" />
              Exportar
            </button>
          </div>
        </div>

        <Toolbar />

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-auto bg-[#E8E4F0] py-8 px-4">
            {tipo.fases.map(fase =>
              fase.items.map(name => {
                const savedSection = sectionByName.get(name)
                const sectionId    = savedSection?.id ?? `virtual-${name}`
                const content      = savedSection?.content ?? null
                const wordCount    = savedSection?.word_count ?? 0

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
                    zoom={zoom}
                    onGrammarResults={handleGrammarResults}
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
