import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store'
import { useRevision } from '@/hooks/useRevision'
import { signOut } from '@/hooks/useAuth'
import { TIPOS_TESIS, NORMAS } from '@/types'
import { relativeTime, cn } from '@/lib/utils'
import type { NormaType } from '@/types'
import ReferencesPanel from '@/components/references/ReferencesPanel'
import RevisionPanel   from '@/components/revision/RevisionPanel'

type PanelTab = 'structure' | 'refs' | 'revision'

export default function Sidebar() {
  const navigate = useNavigate()
  const { project, sections, norma, setNorma, revisionIssues, isSaving, lastSaved, activeSectionId, setActiveSection } = useStore()
  const { runRevision } = useRevision()
  const [tab, setTab] = useState<PanelTab>('structure')

  // Always get structure from TIPOS_TESIS — never from DB sections
  const tipo = project ? TIPOS_TESIS[project.tipo] : null

  // Build content map from DB sections (name → section)
  const sectionByName = new Map(sections.map(s => [s.name, s]))

  const totalWords    = sections.reduce((s, sec) => s + sec.word_count, 0)
  const totalSections = tipo ? tipo.fases.reduce((acc, f) => acc + f.items.length, 0) : 0
  const filledSections = sections.filter(s => s.word_count > 0).length
  const progress      = totalSections ? Math.round(filledSections / totalSections * 100) : 0

  const errorCount = revisionIssues.filter(i => i.level === 'error').length
  const warnCount  = revisionIssues.filter(i => i.level === 'warning').length

  const scrollToSection = (name: string) => {
    const sec = sectionByName.get(name)
    const id  = sec ? `section-${sec.id}` : `section-virtual-${name}`
    setActiveSection(sec?.id ?? `virtual-${name}`)
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <aside className="w-64 min-w-64 flex flex-col bg-gradient-to-b from-brand-800 to-brand-950 border-r border-brand-700/50 overflow-hidden">

      {/* Brand */}
      <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-brand-700/40 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-brand-700/50 border border-brand-600/30 flex items-center justify-center text-lg flex-shrink-0">🎓</div>
        <div className="min-w-0">
          <div className="font-serif text-brand-100 text-sm font-semibold leading-tight">
            TesisEditor <span className="text-xs bg-gold text-brand-950 rounded px-1 font-bold">PRO</span>
          </div>
          <div className="text-brand-500 text-xs">by RonnDu Corp.</div>
        </div>
      </div>

      {/* Project + norma */}
      <div className="px-3.5 py-2.5 border-b border-brand-700/40 flex-shrink-0 space-y-2">
        <button onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-brand-400 hover:text-brand-200 text-xs transition-colors w-full text-left">
          <i className="ti ti-chevron-left text-xs" />
          <span className="truncate">{project?.title ?? 'Dashboard'}</span>
        </button>

        {/* Norma */}
        <div>
          <p className="text-brand-600 text-xs mb-1 uppercase tracking-wider">Norma</p>
          <div className="flex gap-1">
            {(['libre','apa','vancouver'] as NormaType[]).map(n => (
              <button key={n} onClick={() => setNorma(n)}
                className={cn(
                  'flex-1 text-xs py-1 rounded-md border transition-all',
                  norma === n
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-brand-800/60 text-brand-400 border-brand-700 hover:border-brand-500'
                )}>
                {NORMAS[n].label}
              </button>
            ))}
          </div>
        </div>

        {/* Progress */}
        <div>
          <div className="flex justify-between text-xs text-brand-500 mb-1">
            <span>{filledSections}/{totalSections} secciones</span>
            <span>{totalWords.toLocaleString('es')} palabras</span>
          </div>
          <div className="h-1.5 bg-brand-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-brand-400 to-gold transition-all duration-500 rounded-full"
              style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-brand-700/40 flex-shrink-0">
        {([
          { id:'structure', icon:'ti-layout-list', label:'Estructura' },
          { id:'refs',      icon:'ti-books',        label:'Refs' },
          { id:'revision',  icon:'ti-shield-check', label:'Revisión', badge: errorCount + warnCount },
        ] as const).map(t => (
          <button key={t.id}
            onClick={() => {
              if (t.id === 'revision') { setTab('revision'); runRevision() }
              else setTab(t.id as PanelTab)
            }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-2 text-xs border-b-2 transition-all relative',
              tab === t.id ? 'text-gold border-gold' : 'text-brand-500 border-transparent hover:text-brand-300'
            )}>
            <i className={`ti ${t.icon} text-sm`} />
            <span className="hidden sm:inline">{t.label}</span>
            {'badge' in t && t.badge > 0 && (
              <span className="absolute top-1 right-1 text-xs bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {t.badge > 9 ? '9+' : t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">

        {/* STRUCTURE — always from TIPOS_TESIS */}
        {tab === 'structure' && tipo && (
          <div className="py-1">
            {tipo.fases.map(fase => (
              <div key={fase.fase}>
                <div className="px-3.5 pt-3 pb-1">
                  <p className="text-brand-600 text-xs font-medium uppercase tracking-wider">
                    {fase.isRoman ? '(i,ii…) ' : '(1,2…) '}{fase.fase}
                  </p>
                </div>
                {fase.items.map(name => {
                  const sec      = sectionByName.get(name)
                  const isActive = sec ? sec.id === activeSectionId : (`virtual-${name}` === activeSectionId)
                  const hasCont  = sec ? sec.word_count > 0 : false
                  return (
                    <button key={name} onClick={() => scrollToSection(name)}
                      className={cn(
                        'w-full flex items-start gap-2 px-3.5 py-1.5 text-left text-xs transition-all border-l-2',
                        isActive
                          ? 'bg-brand-500/20 border-gold text-white'
                          : 'border-transparent text-brand-400 hover:bg-brand-800/40 hover:text-brand-200'
                      )}>
                      <span className={cn(
                        'w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 transition-colors',
                        isActive ? 'bg-gold' : hasCont ? 'bg-brand-400' : 'bg-brand-700'
                      )} />
                      <span className="leading-tight">{name}</span>
                      {hasCont && (
                        <span className="ml-auto text-brand-600 text-xs flex-shrink-0">{sec!.word_count}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {tab === 'refs'     && <ReferencesPanel />}
        {tab === 'revision' && <RevisionPanel />}
      </div>

      {/* Status bar */}
      <div className="px-3.5 py-2 border-t border-brand-700/40 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full', isSaving ? 'bg-gold animate-pulse' : 'bg-green-400')} />
          <span className="text-brand-600 text-xs">
            {isSaving ? 'Guardando…' : lastSaved ? relativeTime(lastSaved) : 'Listo'}
          </span>
        </div>
        <button onClick={signOut} className="text-brand-600 hover:text-brand-400 text-xs transition-colors">
          <i className="ti ti-logout text-sm" />
        </button>
      </div>
    </aside>
  )
}
