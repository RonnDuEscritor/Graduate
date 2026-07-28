import { cn } from '@/lib/utils'
import type { LTMatch } from '@/hooks/useLanguageTool'
import { CATEGORY_COLORS, CATEGORY_LABELS, getCategoryKey } from '@/lib/grammarCategory'

interface GrammarPanelProps {
  matches:   LTMatch[]
  checking:  boolean
  onFix:     (match: LTMatch, replacement: string) => void
  onDismiss: (match: LTMatch) => void
}

export default function GrammarPanel({ matches, checking, onFix, onDismiss }: GrammarPanelProps) {
  if (checking) return (
    <div className="p-4 flex items-center gap-2 text-brand-400 text-xs">
      <span className="w-3 h-3 border border-brand-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
      Analizando texto...
    </div>
  )

  if (matches.length === 0) return (
    <div className="p-4 text-center">
      <div className="text-2xl mb-2">✓</div>
      <p className="text-green-500 text-xs font-medium">Sin errores detectados</p>
      <p className="text-brand-600 text-xs mt-1">El texto cumple las revisiones de LanguageTool</p>
    </div>
  )

  // Group by category
  const grouped = matches.reduce((acc, m) => {
    const key = getCategoryKey(m)
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {} as Record<string, LTMatch[]>)

  return (
    <div className="flex flex-col gap-1 p-2">
      {/* Summary */}
      <div className="flex gap-1 flex-wrap mb-1">
        {Object.entries(grouped).map(([cat, items]) => (
          <span key={cat} className={cn(
            'text-xs px-2 py-0.5 rounded-full border font-medium',
            CATEGORY_COLORS[cat] ?? 'text-brand-400 bg-brand-800 border-brand-700'
          )}>
            {items.length} {CATEGORY_LABELS[cat] ?? cat}
          </span>
        ))}
      </div>

      {/* Individual matches */}
      {matches.map((match, idx) => {
        const catKey  = getCategoryKey(match)
        const colors  = CATEGORY_COLORS[catKey] ?? 'text-brand-400 bg-brand-800 border-brand-700'
        const topReps = match.replacements.slice(0, 3)

        return (
          <div key={idx} className={cn(
            'rounded-lg border p-2.5 text-xs',
            colors
          )}>
            {/* Category badge */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold uppercase tracking-wide text-xs">
                {CATEGORY_LABELS[catKey] ?? catKey}
              </span>
              <button
                onClick={() => onDismiss(match)}
                className="opacity-50 hover:opacity-100 transition-opacity"
                title="Ignorar este error">
                <i className="ti ti-x text-xs" />
              </button>
            </div>

            {/* Message */}
            <p className="leading-snug mb-2 opacity-90">{match.shortMessage || match.message}</p>

            {/* Replacements */}
            {topReps.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="opacity-60">Sugerir:</span>
                {topReps.map((rep, i) => (
                  <button
                    key={i}
                    onClick={() => onFix(match, rep.value)}
                    className="px-2 py-0.5 rounded bg-white/40 hover:bg-white/70 border border-current/20 font-medium transition-all">
                    {rep.value}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
