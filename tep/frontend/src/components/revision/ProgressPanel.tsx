import { useStore } from '@/store'
import { TIPOS_TESIS } from '@/types'
import { cn } from '@/lib/utils'

// Audit G-02/C-03 fix (Exhaustiva 31/08/2026, GRAVE): this used to be a
// single hardcoded list referencing only tipo 0's ('Investigacion
// cientifica') chapter names -- 'Cap. I -- El problema', 'Cap. II --
// Marco teorico', etc. TIPOS_TESIS (types/index.ts) gives tipo 1
// ('Proyecto factible / tecnico') and tipo 2 ('Revision sistematica /
// documental') their own, differently-named chapters ('Cap. I --
// Diagnostico de la necesidad', 'Cap. I -- Justificacion y alcance
// critico', etc.), so for those two tipos NONE of these section-name
// lookups could ever match -- the progress checklist stayed stuck
// showing every item incomplete no matter how much the user actually
// wrote, because it was checking chapter names that don't exist in their
// thesis. Each tipo now has its own checklist built from its own real
// TIPOS_TESIS chapter names.
type ChecklistItem = { key: string, label: string, section: string, searchFor: string[] }

const ACADEMIC_CHECKLIST_BY_TIPO: Record<number, ChecklistItem[]> = {
  // Tipo 0 -- Investigacion cientifica (original checklist, unchanged)
  0: [
    { key: 'antecedentes',  label: 'Antecedentes',           section: 'Cap. I -- El problema',          searchFor: ['antecedentes','previos','estudios anteriores'] },
    { key: 'planteamiento', label: 'Planteamiento',          section: 'Cap. I -- El problema',          searchFor: ['planteamiento','problema','situacion'] },
    { key: 'formulacion',   label: 'Pregunta de investigacion', section: 'Cap. I -- El problema',       searchFor: ['como','por que','cuales','que relacion','pregunta'] },
    { key: 'obj_general',   label: 'Objetivo general',       section: 'Cap. I -- El problema',          searchFor: ['objetivo general','determinar','analizar','establecer'] },
    { key: 'obj_especificos', label: 'Objetivos especificos', section: 'Cap. I -- El problema',         searchFor: ['objetivos especificos','identificar','describir','evaluar'] },
    { key: 'hipotesis',     label: 'Hipotesis',              section: 'Cap. I -- El problema',          searchFor: ['hipotesis','se presume','se supone','es probable'] },
    { key: 'variables',     label: 'Variables',              section: 'Cap. I -- El problema',          searchFor: ['variable','independiente','dependiente'] },
    { key: 'justificacion', label: 'Justificacion',          section: 'Cap. I -- El problema',          searchFor: ['justificacion','importancia','relevancia'] },
    { key: 'marco_teorico', label: 'Marco teorico',          section: 'Cap. II -- Marco teorico',       searchFor: ['segun','afirma','plantea','teoria','modelo'] },
    { key: 'metodologia',   label: 'Metodologia',            section: 'Cap. III -- Marco metodologico', searchFor: ['tipo','diseno','metodo','enfoque'] },
    { key: 'poblacion',     label: 'Poblacion y muestra',    section: 'Cap. III -- Marco metodologico', searchFor: ['poblacion','muestra','sujetos','participantes'] },
    { key: 'resultados',    label: 'Resultados',             section: 'Cap. IV -- Analisis de resultados', searchFor: ['resultados','datos','tabla','grafico','figura'] },
    { key: 'conclusiones',  label: 'Conclusiones',           section: 'Conclusiones y recomendaciones', searchFor: ['conclusion','concluye','se determino','se logro'] },
    { key: 'referencias',   label: 'Referencias',            section: 'Referencias bibliograficas',     searchFor: [] },
  ],
  // Tipo 1 -- Proyecto factible / tecnico
  1: [
    { key: 'diagnostico',    label: 'Diagnostico de la necesidad', section: 'Cap. I -- Diagnostico de la necesidad',        searchFor: ['diagnostico','necesidad','problema','carencia'] },
    { key: 'obj_general',    label: 'Objetivo general',            section: 'Cap. I -- Diagnostico de la necesidad',        searchFor: ['objetivo general','determinar','desarrollar','implementar'] },
    { key: 'obj_especificos', label: 'Objetivos especificos',      section: 'Cap. I -- Diagnostico de la necesidad',        searchFor: ['objetivos especificos','identificar','disenar','construir'] },
    { key: 'justificacion',  label: 'Justificacion',               section: 'Cap. I -- Diagnostico de la necesidad',        searchFor: ['justificacion','importancia','relevancia','beneficio'] },
    { key: 'fundamentacion', label: 'Fundamentacion tecnologica',  section: 'Cap. II -- Fundamentacion tecnologica',        searchFor: ['fundamentacion','tecnologia','herramienta','framework','lenguaje'] },
    { key: 'diseno',         label: 'Diseno y arquitectura',       section: 'Cap. III -- Diseno y arquitectura',            searchFor: ['diseno','arquitectura','diagrama','modelo'] },
    { key: 'desarrollo',     label: 'Desarrollo e implementacion', section: 'Cap. IV -- Desarrollo e implementacion',       searchFor: ['desarrollo','implementacion','construccion','codigo'] },
    { key: 'pruebas',        label: 'Pruebas y factibilidad',      section: 'Cap. V -- Pruebas, evaluacion y factibilidad', searchFor: ['prueba','evaluacion','factibilidad','resultado'] },
    { key: 'conclusiones',   label: 'Conclusiones',                section: 'Conclusiones y recomendaciones',               searchFor: ['conclusion','concluye','se determino','se logro'] },
    { key: 'referencias',    label: 'Referencias',                 section: 'Referencias bibliograficas',                   searchFor: [] },
  ],
  // Tipo 2 -- Revision sistematica / documental
  2: [
    { key: 'justificacion',  label: 'Justificacion y alcance',     section: 'Cap. I -- Justificacion y alcance critico',           searchFor: ['justificacion','alcance','relevancia','importancia'] },
    { key: 'obj_general',    label: 'Objetivo general',            section: 'Cap. I -- Justificacion y alcance critico',           searchFor: ['objetivo general','analizar','sistematizar','revisar'] },
    { key: 'metodologia',    label: 'Metodologia de busqueda',     section: 'Cap. II -- Metodologia de busqueda y seleccion',      searchFor: ['busqueda','seleccion','criterios','base de datos','palabras clave'] },
    { key: 'categorial',     label: 'Desarrollo categorial',       section: 'Cap. III -- Desarrollo categorial / ejes tematicos',  searchFor: ['categoria','eje tematico','clasificacion'] },
    { key: 'comparativo',    label: 'Analisis comparativo',        section: 'Cap. IV -- Analisis comparativo / sintesis',          searchFor: ['comparacion','sintesis','analisis','contraste'] },
    { key: 'discusion',      label: 'Discusion teorica',           section: 'Cap. V -- Discusion teorica',                         searchFor: ['discusion','implicacion','teoria'] },
    { key: 'conclusiones',   label: 'Conclusiones',                section: 'Conclusiones y lineas de investigacion futuras',      searchFor: ['conclusion','concluye','linea futura'] },
    { key: 'referencias',    label: 'Referencias',                 section: 'Referencias bibliograficas',                          searchFor: [] },
  ],
}

function extractText(content: object | null): string {
  if (!content) return ''
  const walk = (node: Record<string,unknown>): string => {
    if (node.text) return node.text as string + ' '
    if (node.content && Array.isArray(node.content))
      return (node.content as Record<string,unknown>[]).map(walk).join('')
    return ''
  }
  return walk(content as Record<string,unknown>).toLowerCase()
}

export default function ProgressPanel() {
  const { project, sections } = useStore()
  if (!project) return null

  const tipo = TIPOS_TESIS[project.tipo]
  const checklist = ACADEMIC_CHECKLIST_BY_TIPO[project.tipo] ?? ACADEMIC_CHECKLIST_BY_TIPO[0]
  const sectionByName = new Map(sections.map(s => [s.name, s]))

  // Check each academic element
  const results = checklist.map(item => {
    const sec  = sections.find(s => s.name.includes(item.section.split(' -- ')[1] ?? item.section))
             ?? sectionByName.get(item.section)
    const text = extractText(sec?.content ?? null)
    const wc   = sec?.word_count ?? 0

    // Special case: references panel
    if (item.key === 'referencias') {
      return { ...item, done: sections.some(s => s.name.toLowerCase().includes('referenc') && s.word_count > 0) }
    }

    const hasKeyword = item.searchFor.some(kw => text.includes(kw))
    const hasContent = wc > 30
    return { ...item, done: hasKeyword && hasContent }
  })

  const done  = results.filter(r => r.done).length
  const total = results.length
  const pct   = Math.round(done / total * 100)

  // Color by percentage
  const pctColor = pct >= 80 ? 'text-green-500' : pct >= 50 ? 'text-yellow-500' : 'text-red-400'
  const barColor = pct >= 80 ? 'from-green-400 to-green-500' : pct >= 50 ? 'from-yellow-400 to-yellow-500' : 'from-red-400 to-red-500'

  return (
    <div className="p-3 flex flex-col gap-2">
      {/* Header */}
      <div className="bg-brand-800/50 rounded-xl p-3 border border-brand-700/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-brand-300 text-xs font-medium">Progreso academico</span>
          <span className={cn('text-lg font-bold', pctColor)}>{pct}%</span>
        </div>
        <div className="h-2 bg-brand-800 rounded-full overflow-hidden">
          <div
            className={cn('h-full bg-gradient-to-r rounded-full transition-all duration-700', barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-brand-500 text-xs mt-1.5">{done} de {total} elementos completados</p>
      </div>

      {/* Checklist */}
      <div className="flex flex-col gap-1">
        {results.map(item => (
          <div key={item.key}
            className={cn(
              'flex items-start gap-2 px-2.5 py-2 rounded-lg text-xs transition-all',
              item.done
                ? 'bg-green-900/20 border border-green-700/30'
                : 'bg-brand-800/30 border border-brand-700/20'
            )}>
            <span className={cn(
              'flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-xs mt-0.5',
              item.done ? 'bg-green-500 text-white' : 'bg-brand-700 text-brand-500'
            )}>
              {item.done ? <i className="ti ti-check" style={{fontSize:'10px'}} /> : <i className="ti ti-minus" style={{fontSize:'10px'}} />}
            </span>
            <div className="min-w-0">
              <p className={cn('font-medium leading-tight', item.done ? 'text-green-400' : 'text-brand-400')}>
                {item.label}
              </p>
              <p className="text-brand-600 text-xs leading-tight mt-0.5">{item.section.replace('Cap. ','Cap.')}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tip -- Audit G-02/C-03 fix: this used to be four buckets of
          hardcoded tipo-0 wording ("Completa la metodologia y el marco
          teorico", etc.), so tipo 1/2 projects got advice about chapters
          they don't have. Points at the actual next incomplete item from
          this tipo's own checklist instead. */}
      {pct < 100 && (() => {
        const next = results.find(r => !r.done)
        return (
          <div className="bg-brand-800/30 border border-brand-700/20 rounded-xl p-2.5 text-xs text-brand-400">
            <i className="ti ti-bulb text-gold mr-1" />
            {next
              ? `Sigue con "${next.label}" en ${next.section.replace('Cap. ', 'Cap.')}.`
              : 'Revisa los detalles finales para completar tu tesis.'}
          </div>
        )
      })()}
    </div>
  )
}
