import { cn } from '@/lib/utils'
import type { LTMatch } from '@/hooks/useLanguageTool'
import { CATEGORY_COLORS, CATEGORY_LABELS, getCategoryKey } from '@/lib/grammarCategory'

interface GrammarPanelProps {
  matches:   LTMatch[]
  checking:  boolean
  onFix:     (match: LTMatch, replacement: string) => void
  onDismiss: (match: LTMatch) => void
}

function GrammarPanelBody({ matches, checking, onFix, onDismiss }: GrammarPanelProps) {
  if (checking) return (
    <div className="p-4 flex items-center gap-2 text-brand-200 text-xs">
      <span className="w-3 h-3 border border-white/50 border-t-transparent rounded-full animate-spin flex-shrink-0" />
      Analizando texto...
    </div>
  )

  if (matches.length === 0) return (
    <div className="p-4 text-center">
      <div className="text-2xl mb-2">✓</div>
      <p className="text-green-500 text-xs font-medium">Sin errores detectados</p>
      <p className="text-brand-200 text-xs mt-1">El texto cumple las revisiones de LanguageTool</p>
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
            CATEGORY_COLORS[cat] ?? 'text-brand-200 bg-brand-800 border-brand-700'
          )}>
            {items.length} {CATEGORY_LABELS[cat] ?? cat}
          </span>
        ))}
      </div>

      {/* Individual matches */}
      {matches.map((match, idx) => {
        const catKey  = getCategoryKey(match)
        const colors  = CATEGORY_COLORS[catKey] ?? 'text-brand-200 bg-brand-800 border-brand-700'
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
                className="opacity-70 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                title="Ignorar este error" aria-label="Ignorar este error">
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

// Auditoria integral (4.1 Privacidad): "informar al estudiante cuando el
// texto se envia a LanguageTool y que datos salen del entorno de la
// aplicacion". Visible siempre que se abre este panel, en cualquier estado.
function PrivacyNote() {
  return (
    <details className="mx-2 mt-2 rounded-lg border border-brand-200/40 bg-brand-800/40 text-xs text-brand-100">
      <summary className="cursor-pointer px-2.5 py-2 font-medium text-brand-50">
        <i className="ti ti-shield-lock mr-1" aria-hidden="true" />
        Privacidad: la revision envia tu texto a un servicio externo
      </summary>
      <div className="px-2.5 pb-2.5 space-y-1.5">
        <p>
          Para detectar errores, el texto de la seccion que estas editando se envia a traves de
          tu servidor (Supabase) a <strong>LanguageTool</strong> (api.languagetool.org), un servicio
          de terceros. Solo se envia el texto de esa seccion y el idioma; no se envian tu correo
          ni los demas datos del proyecto.
        </p>
        <p>
          Si tu tesis contiene informacion confidencial, evita usar la revision gramatical sobre
          esas secciones. El resto de la aplicacion funciona sin este servicio.
        </p>
      </div>
    </details>
  )
}

export default function GrammarPanel(props: GrammarPanelProps) {
  return (
    <>
      <PrivacyNote />
      <GrammarPanelBody {...props} />
    </>
  )
}
