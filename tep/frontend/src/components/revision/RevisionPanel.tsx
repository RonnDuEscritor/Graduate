import { useStore } from '@/store'
import { cn } from '@/lib/utils'

const ICONS = { error:'ti-circle-x', warning:'ti-alert-triangle', info:'ti-info-circle' }
const COLORS = {
  error:   'text-red-400 bg-red-900/20 border-red-700/30',
  warning: 'text-orange-400 bg-orange-900/20 border-orange-700/30',
  info:    'text-brand-200 bg-brand-800/30 border-brand-700/30',
}

export default function RevisionPanel() {
  const { revisionIssues } = useStore()

  const errors   = revisionIssues.filter(i => i.level === 'error')
  const warnings = revisionIssues.filter(i => i.level === 'warning')
  const infos    = revisionIssues.filter(i => i.level === 'info')

  if (revisionIssues.length === 0) {
    return (
      <div className="p-4 text-center">
        <div className="text-2xl mb-2">✅</div>
        <p className="text-brand-200 text-xs">Sin problemas detectados.<br/>El documento cumple las revisiones básicas.</p>
      </div>
    )
  }

  const Section = ({ title, items, level }: { title: string; items: typeof revisionIssues; level: 'error'|'warning'|'info' }) => {
    if (items.length === 0) return null
    return (
      <div className="mb-3">
        <p className="text-xs font-medium text-brand-200 uppercase tracking-wider px-3 py-1.5">{title} ({items.length})</p>
        {items.map(issue => (
          <div key={issue.id} className={cn('mx-3 mb-1.5 rounded-lg border p-2 flex gap-2', COLORS[level])}>
            <i className={cn('ti', ICONS[level], 'text-sm mt-0.5 flex-shrink-0')} />
            <div className="min-w-0">
              {issue.sectionName && (
                <p className="text-xs font-medium mb-0.5 opacity-70 truncate">{issue.sectionName}</p>
              )}
              <p className="text-xs leading-snug">{issue.message}</p>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="py-2">
      <Section title="Errores"      items={errors}   level="error" />
      <Section title="Advertencias" items={warnings} level="warning" />
      <Section title="Sugerencias"  items={infos}    level="info" />
    </div>
  )
}
