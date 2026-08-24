import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '@/store'
import { useProject } from '@/hooks/useProject'
import { useAuth } from '@/hooks/useAuth'
import { TIPOS_TESIS, NORMAS } from '@/types'
import { estimatePageRanges, cn } from '@/lib/utils'
import type { LTMatch } from '@/hooks/useLanguageTool'
import Sidebar       from '@/components/sidebar/Sidebar'
import Toolbar       from '@/components/editor/Toolbar'
import SectionEditor from '@/components/editor/SectionEditor'
import ExportPanel   from '@/components/export/ExportPanel'

const ZOOM_LEVELS = [0.6, 0.75, 0.9, 1.0, 1.15, 1.3]

export default function EditorPage() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const { user }  = useAuth()
  const { loadProject } = useProject()
  const { project, sections, norma, sidebarOpen, setSidebarOpen } = useStore()

  const [loading,    setLoading]    = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [error,      setError]      = useState('')
  const [zoomIdx,    setZoomIdx]    = useState(3)

  // Grammar state - collected from all section editors
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

  // Audit 1.1 fix (CRITICO): previously incremented one page number per
  // section regardless of length ("1 seccion = 1 pagina"), so the badge
  // shown on a 3-page introduction and a 12-page chapter both just said a
  // single number, and every section after a long one was off by however
  // many real pages that chapter actually spanned. Page numbers here are
  // now an estimated RANGE based on each section's actual word count (see
  // estimatePageRanges in '@/lib/utils') -- still an estimate, not a
  // pixel-accurate page break, but it no longer asserts a page count we
  // know to be wrong, and it visibly says "~" to signal that.
  const sectionByName  = new Map(sections.map(s => [s.name, s]))
  let arCursor = 1, romCursor = 1
  const pageNums = new Map<string, string>()
  tipo.fases.forEach(fase => {
    const items = fase.items.map(name => ({ name, wordCount: sectionByName.get(name)?.word_count ?? 0 }))
    const ranges = estimatePageRanges(items, norma, fase.isRoman, fase.isRoman ? romCursor : arCursor)
    items.forEach(({ name }) => {
      const r = ranges.get(name)
      if (r) pageNums.set(name, `~${r.label}`)
    })
    const last = [...ranges.values()].pop()
    if (last) { if (fase.isRoman) romCursor = last.end + 1; else arCursor = last.end + 1 }
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
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setSidebarOpen(true)}
              className="md:hidden w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-brand-500 hover:bg-brand-50">
              <i className="ti ti-menu-2 text-lg" />
            </button>
            <span className="text-brand-300 text-xs font-medium truncate max-w-[140px] md:max-w-xs">{project.title}</span>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {/* Zoom -- hidden on mobile, not enough room and pinch-zoom works fine */}
            <div className="hidden md:flex items-center gap-1 bg-brand-50 rounded-lg px-1 py-0.5">
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

            <button onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors">
              <i className="ti ti-download text-sm" />
              <span className="hidden md:inline">Exportar</span>
            </button>
          </div>
        </div>

        <Toolbar grammarCount={grammarMatches.length} />

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-auto bg-[#F1E8EA] py-8 px-4">
            {(() => {
              let runningIndex = -1
              return tipo.fases.map(fase =>
                fase.items.map(name => {
                  runningIndex++
                  const orderIndex   = runningIndex
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
                      orderIndex={orderIndex}
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
              )
            })()}
            <div className="h-16" />
          </div>
        </div>
      </div>

      {showExport && <ExportPanel onClose={() => setShowExport(false)} />}
    </div>
  )
}
