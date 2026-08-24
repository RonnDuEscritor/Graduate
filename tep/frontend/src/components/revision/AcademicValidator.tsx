import { useState } from 'react'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'
import type { PBSection, TipoTesis } from '@/types'

interface ValidationIssue {
  id:       string
  severity: 'critical' | 'warning' | 'info'
  element:  string
  problem:  string
  fix:      string
}

function extractText(content: object | null): string {
  if (!content) return ''
  const walk = (node: Record<string,unknown>): string => {
    if (node.text) return node.text as string + ' '
    if (node.content && Array.isArray(node.content))
      return (node.content as Record<string,unknown>[]).map(walk).join('')
    return ''
  }
  return walk(content as Record<string,unknown>)
}

// Small helper shared by the three rule sets below: finds a section by a
// fragment of its name (case-insensitive) and returns its plain text +
// word count in one go, so each rule set only writes `get('fragment')`.
type SectionLookup = (nameFragment: string) => { sec: PBSection | undefined, text: string, wc: number }

function makeLookup(sections: PBSection[]): SectionLookup {
  return (nameFragment: string) => {
    const sec = sections.find(s =>
      s.name.toLowerCase().includes(nameFragment.toLowerCase())
    )
    return { sec, text: extractText(sec?.content ?? null), wc: sec?.word_count ?? 0 }
  }
}

// Audit 3.1 fix (GRAVE/CRITICO): previously a single rule set, written
// around the Investigacion cientifica structure (Cap. I El problema...Cap.
// V Discusion), was applied to all three thesis types. A Proyecto tecnico
// or a Revision sistematica never contain a "hipotesis" or "poblacion y
// muestra" section by design, so those theses were flagged for missing
// things that don't apply to them. Each thesis type (matching TIPOS_TESIS
// in '@/types', the single source of truth for section names) now has its
// own rule set below.

// ── TIPO 0: Investigacion cientifica ──────────────────────────
function validateInvestigacionCientifica(get: SectionLookup): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  let n = 0
  const id = () => 'ic-' + String(++n)

  const cap1  = get('problema')
  const cap2  = get('marco te')
  const cap3  = get('metodol')
  const cap4  = get('resultados')
  const cap5  = get('discusion')
  const concl = get('conclusiones')
  const refs  = get('referencias')

  const t1 = cap1.text.toLowerCase()
  const t3 = cap3.text.toLowerCase()
  const t4 = cap4.text.toLowerCase()
  const t5 = cap5.text.toLowerCase()
  const tc = concl.text.toLowerCase()

  // ── CRITICAL ──
  if (!t1.includes('planteamiento') && !t1.includes('problema') && cap1.wc < 50) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. I - Planteamiento',
      problem: 'No se encontro el planteamiento del problema. Es el elemento mas importante de la tesis.',
      fix: 'Describe el problema de investigacion con datos, estadisticas o evidencias concretas. Minimo 100 palabras.' })
  }
  if (!t1.match(/\?/) && !t1.includes('como') && !t1.includes('por que') && !t1.includes('formulacion')) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. I - Pregunta de investigacion',
      problem: 'No se encontro la pregunta de investigacion (formulacion del problema).',
      fix: 'Redacta una pregunta clara que guie toda la investigacion. Ejemplo: Como influye X en Y en el contexto Z durante el periodo A?' })
  }
  const hasObjGeneral = t1.includes('objetivo general') ||
    t1.match(/\b(determinar|analizar|establecer|evaluar|identificar|describir|comparar|proponer)\b/)
  if (!hasObjGeneral && cap1.wc > 30) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. I - Objetivo general',
      problem: 'No se encontro el objetivo general o no esta bien redactado.',
      fix: 'El objetivo general debe comenzar con un verbo en infinitivo: Determinar, Analizar, Evaluar, Establecer... y debe responder directamente a la pregunta de investigacion.' })
  }
  if (!t1.includes('hipotesis') && !t1.includes('se presume') && cap1.wc > 50) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. I - Hipotesis',
      problem: 'No se encontro la hipotesis de investigacion.',
      fix: 'Redacta una hipotesis que relacione la variable independiente con la dependiente. Ejemplo: A mayor X, mayor Y en el contexto Z.' })
  }
  if (!t1.includes('variable') && cap1.wc > 50) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. I - Variables',
      problem: 'No se encontraron las variables de investigacion definidas.',
      fix: 'Define al menos: Variable independiente (causa/factor que se manipula) y Variable dependiente (efecto que se mide). Incluye definicion conceptual y operacional.' })
  }
  if (cap2.wc > 0 && cap2.wc < 200) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. II - Marco teorico',
      problem: `El marco teorico es muy corto (${cap2.wc} palabras). Un marco teorico profesional requiere minimo 800-1500 palabras.`,
      fix: 'Desarrolla las teorias y modelos que sustentan tu investigacion. Cita autores reconocidos. Incluye estado del arte y definicion de terminos clave.' })
  }
  if (cap3.wc > 0 && !t3.match(/\b(descriptiv|explicativ|correlacional|exploratori|cuantitativ|cualitativ|mixto)\b/)) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. III - Tipo de investigacion',
      problem: 'No se especifica el tipo de investigacion (descriptiva, explicativa, correlacional, etc.)',
      fix: 'Indica claramente el tipo de investigacion y justifica tu eleccion citando a autores metodologicos (Hernandez Sampieri, Arias, Tamayo...).' })
  }
  if (cap3.wc > 0 && !t3.includes('poblacion') && !t3.includes('muestra')) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. III - Poblacion y muestra',
      problem: 'No se encontro la descripcion de la poblacion ni la muestra.',
      fix: 'Define quien es tu poblacion de estudio y como determinaste el tamano de la muestra. Incluye el tipo de muestreo utilizado.' })
  }
  if (cap4.wc > 0 && !t4.match(/\b(tabla|grafico|figura|porcentaje|%|\d+)\b/)) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. IV - Presentacion de resultados',
      problem: 'Los resultados no parecen incluir datos cuantitativos, tablas o graficos.',
      fix: 'Presenta los datos obtenidos en tablas o graficos con formato APA. Cada elemento debe tener numero, titulo y nota de fuente.' })
  }
  if (concl.wc > 0 && !tc.match(/\b(objetivo|se logro|se determino|se demostro|se pudo|se verifico)\b/)) {
    issues.push({ id: id(), severity: 'critical', element: 'Conclusiones',
      problem: 'Las conclusiones no hacen referencia explicita a los objetivos planteados.',
      fix: 'Cada conclusion debe responder directamente a un objetivo especifico. Usa frases como: En relacion al objetivo X, se determino que...' })
  }

  // ── WARNINGS ──
  if (!t1.includes('justificacion') && !t1.includes('importancia') && cap1.wc > 50) {
    issues.push({ id: id(), severity: 'warning', element: 'Cap. I - Justificacion',
      problem: 'No se encontro la justificacion del estudio.',
      fix: 'Explica por que es importante realizar esta investigacion: aporte teorico, practico y metodologico.' })
  }
  if (!t1.includes('delimitacion') && !t1.includes('alcance') && cap1.wc > 100) {
    issues.push({ id: id(), severity: 'warning', element: 'Cap. I - Delimitacion',
      problem: 'No se encontro la delimitacion de la investigacion.',
      fix: 'Define los limites del estudio: espacial (donde), temporal (cuando), tematico (que aspectos se incluyen).' })
  }
  if (cap5.wc > 0 && !t5.match(/\b(coincide|difiere|contrasta|similar|contrario|igual|segun|autor|estudio anterior)\b/)) {
    issues.push({ id: id(), severity: 'warning', element: 'Cap. V - Discusion',
      problem: 'La discusion no compara los resultados con los antecedentes del Cap. I.',
      fix: 'Compara tus hallazgos con los de otros autores citados. En que coinciden? En que difieren? Que explica las diferencias?' })
  }
  if (concl.wc > 0 && !tc.includes('recomendacion') && !tc.includes('recomienda') && !tc.includes('sugiere')) {
    issues.push({ id: id(), severity: 'warning', element: 'Conclusiones - Recomendaciones',
      problem: 'No se encontraron recomendaciones al final del trabajo.',
      fix: 'Agrega minimo 3 recomendaciones concretas dirigidas a: investigadores, instituciones o profesionales del area.' })
  }

  // ── INFO ──
  if (!tc.includes('futuras') && !tc.includes('siguiente') && !tc.includes('posterior')) {
    issues.push({ id: id(), severity: 'info', element: 'Lineas de investigacion futuras',
      problem: 'No se mencionan lineas de investigacion futuras.',
      fix: 'Sugiere 2-3 temas o aspectos que quedaron fuera del alcance y podrian investigarse en el futuro.' })
  }
  if (refs.wc === 0) {
    issues.push({ id: id(), severity: 'info', element: 'Referencias bibliograficas',
      problem: 'Las referencias bibliograficas estan vacias o no se han registrado en el panel.',
      fix: 'Usa el panel de Referencias (icono de libros) para agregar las fuentes. Tambien puedes buscar por DOI automaticamente.' })
  }

  return issues
}

// ── TIPO 1: Proyecto factible / tecnico ───────────────────────
// Matches the chapters in TIPOS_TESIS[1]: Diagnostico de la necesidad,
// Fundamentacion tecnologica, Diseno y arquitectura, Desarrollo e
// implementacion, Pruebas/evaluacion/factibilidad.
function validateProyectoTecnico(get: SectionLookup): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  let n = 0
  const id = () => 'pt-' + String(++n)

  const cap1  = get('diagnostico')
  const cap2  = get('fundamentacion')
  const cap3  = get('diseno')
  const cap4  = get('desarrollo')
  const cap5  = get('pruebas')
  const concl = get('conclusiones')
  const refs  = get('referencias')

  const t1 = cap1.text.toLowerCase()
  const t3 = cap3.text.toLowerCase()
  const t4 = cap4.text.toLowerCase()
  const t5 = cap5.text.toLowerCase()
  const tc = concl.text.toLowerCase()

  // ── CRITICAL ──
  if (cap1.wc < 50) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. I - Diagnostico de la necesidad',
      problem: 'El diagnostico de la necesidad esta ausente o es muy breve. Es la base que justifica todo el proyecto.',
      fix: 'Describe con datos concretos la necesidad o carencia que el proyecto va a resolver, y a quien afecta. Minimo 100 palabras.' })
  }
  if (!t1.includes('objetivo') && cap1.wc > 30) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. I - Objetivo general',
      problem: 'No se encontro un objetivo general del proyecto claramente redactado.',
      fix: 'Redacta el objetivo general con un verbo en infinitivo (Disenar, Desarrollar, Implementar...) que indique el producto/servicio a construir.' })
  }
  if (cap2.wc > 0 && cap2.wc < 150) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. II - Fundamentacion tecnologica',
      problem: `La fundamentacion tecnologica es muy corta (${cap2.wc} palabras).`,
      fix: 'Sustenta las tecnologias, metodologias o herramientas elegidas citando autores y comparando alternativas evaluadas.' })
  }
  if (cap3.wc > 0 && !t3.match(/\b(arquitectura|diagrama|modulo|componente|diseno)\b/)) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. III - Diseno y arquitectura',
      problem: 'No se describe la arquitectura o el diseno tecnico del proyecto.',
      fix: 'Incluye diagramas de arquitectura, modulos/componentes principales y las decisiones de diseno tomadas.' })
  }
  if (cap4.wc > 0 && !t4.match(/\b(implement|desarroll|codigo|version|entorno)\b/)) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. IV - Desarrollo e implementacion',
      problem: 'No se describe como se implemento o desarrollo la solucion propuesta.',
      fix: 'Documenta el proceso de desarrollo: entorno, herramientas, etapas de implementacion y decisiones tecnicas relevantes.' })
  }
  if (cap5.wc > 0 && !t5.match(/\b(prueba|test|resultado|factibilidad|validacion)\b/)) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. V - Pruebas y factibilidad',
      problem: 'No se encontraron pruebas, validaciones o un analisis de factibilidad del proyecto.',
      fix: 'Documenta las pruebas realizadas (funcionales, de usuario, tecnicas) y el analisis de factibilidad tecnica, economica y operativa.' })
  }
  if (concl.wc > 0 && !tc.match(/\b(objetivo|se logro|se implemento|se desarrollo|se cumplio)\b/)) {
    issues.push({ id: id(), severity: 'critical', element: 'Conclusiones',
      problem: 'Las conclusiones no hacen referencia explicita a los objetivos planteados.',
      fix: 'Cada conclusion debe responder directamente a un objetivo especifico del proyecto.' })
  }

  // ── WARNINGS ──
  if (!t1.includes('justificacion') && !t1.includes('importancia') && cap1.wc > 50) {
    issues.push({ id: id(), severity: 'warning', element: 'Cap. I - Justificacion',
      problem: 'No se encontro la justificacion del proyecto.',
      fix: 'Explica el aporte tecnico, practico y social del proyecto una vez implementado.' })
  }
  if (!t1.includes('alcance') && !t1.includes('delimitacion') && cap1.wc > 100) {
    issues.push({ id: id(), severity: 'warning', element: 'Cap. I - Alcance',
      problem: 'No se definio el alcance del proyecto.',
      fix: 'Especifica que incluye y que NO incluye el proyecto (limites funcionales, tecnicos y de tiempo).' })
  }
  if (concl.wc > 0 && !tc.includes('recomendacion') && !tc.includes('recomienda')) {
    issues.push({ id: id(), severity: 'warning', element: 'Conclusiones - Recomendaciones',
      problem: 'No se encontraron recomendaciones de mantenimiento, escalabilidad o mejoras futuras.',
      fix: 'Agrega recomendaciones sobre mantenimiento, escalabilidad o mejoras futuras del producto/servicio desarrollado.' })
  }

  // ── INFO ──
  if (refs.wc === 0) {
    issues.push({ id: id(), severity: 'info', element: 'Referencias bibliograficas',
      problem: 'Las referencias bibliograficas estan vacias o no se han registrado en el panel.',
      fix: 'Usa el panel de Referencias para agregar la documentacion tecnica, manuales o fuentes citadas.' })
  }

  return issues
}

// ── TIPO 2: Revision sistematica / documental ─────────────────
// Matches TIPOS_TESIS[2]: Justificacion y alcance critico, Metodologia de
// busqueda y seleccion, Desarrollo categorial, Analisis comparativo, y
// una discusion teorica (no experimental).
function validateRevisionSistematica(get: SectionLookup): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  let n = 0
  const id = () => 'rs-' + String(++n)

  const cap1  = get('justificacion')
  const cap2  = get('metodologia de busqueda')
  const cap3  = get('categorial')
  const cap4  = get('comparativ')
  const cap5  = get('discusion')
  const concl = get('conclusiones')
  const refs  = get('referencias')

  const t1 = cap1.text.toLowerCase()
  const t2 = cap2.text.toLowerCase()
  const t3 = cap3.text.toLowerCase()
  const t4 = cap4.text.toLowerCase()
  const tc = concl.text.toLowerCase()

  // ── CRITICAL ──
  if (cap1.wc < 50) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. I - Justificacion y alcance critico',
      problem: 'No se encontro la justificacion ni el alcance critico de la revision.',
      fix: 'Explica por que es necesaria esta revision y que vacio de conocimiento pretende cubrir. Minimo 100 palabras.' })
  }
  if (!t1.match(/\?/) && !t1.includes('pregunta') && !t1.includes('objetivo')) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. I - Pregunta de la revision',
      problem: 'No se encontro una pregunta u objetivo claro que guie la revision.',
      fix: 'Formula una pregunta de revision clara, por ejemplo con estructura PICO/PECO segun el area de estudio.' })
  }
  if (cap2.wc > 0 && !t2.match(/\b(base de datos|scopus|scielo|pubmed|redalyc|criterio|inclusion|exclusion)\b/)) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. II - Metodologia de busqueda',
      problem: 'No se describen las bases de datos consultadas ni los criterios de inclusion/exclusion.',
      fix: 'Indica las bases de datos utilizadas, las palabras clave/ecuaciones de busqueda y los criterios de inclusion y exclusion de estudios.' })
  }
  if (cap3.wc > 0 && cap3.wc < 200) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. III - Desarrollo categorial',
      problem: `El desarrollo categorial/tematico es muy corto (${cap3.wc} palabras).`,
      fix: 'Organiza y desarrolla las fuentes revisadas por ejes tematicos o categorias, no como un listado de resumenes sueltos.' })
  }
  if (cap4.wc > 0 && !t4.match(/\b(coincide|difiere|compara|contrasta|convergen|divergen)\b/)) {
    issues.push({ id: id(), severity: 'critical', element: 'Cap. IV - Analisis comparativo',
      problem: 'No se encontro un analisis comparativo real entre las fuentes revisadas.',
      fix: 'Compara explicitamente los hallazgos de los distintos autores/estudios: en que coinciden, en que difieren y por que.' })
  }
  if (concl.wc > 0 && !tc.match(/\b(objetivo|se determino|se identifico|se sintetizo|se concluye)\b/)) {
    issues.push({ id: id(), severity: 'critical', element: 'Conclusiones',
      problem: 'Las conclusiones no hacen referencia explicita a la pregunta/objetivo de la revision.',
      fix: 'Cada conclusion debe responder directamente a la pregunta de revision o a un objetivo especifico planteado.' })
  }

  // ── WARNINGS ──
  if (refs.wc === 0) {
    issues.push({ id: id(), severity: 'warning', element: 'Referencias bibliograficas',
      problem: 'Una revision sistematica depende directamente del numero y calidad de fuentes citadas, y no hay referencias registradas.',
      fix: 'Registra en el panel de Referencias todas las fuentes revisadas, con DOI cuando este disponible.' })
  }
  if (cap5.wc > 0 && cap5.wc < 150) {
    issues.push({ id: id(), severity: 'warning', element: 'Cap. V - Discusion teorica',
      problem: `La discusion teorica es breve (${cap5.wc} palabras) para el volumen tipico de una revision.`,
      fix: 'Profundiza en las implicaciones teoricas de los patrones encontrados en la literatura revisada.' })
  }

  // ── INFO ──
  if (!tc.includes('futuras') && !tc.includes('siguiente') && !tc.includes('posterior')) {
    issues.push({ id: id(), severity: 'info', element: 'Lineas de investigacion futuras',
      problem: 'No se mencionan vacios o lineas de investigacion futuras identificados en la revision.',
      fix: 'Senala los vacios de conocimiento detectados que quedan abiertos para futuras investigaciones.' })
  }

  return issues
}

// Audit 3.1: dispatches to the rule set matching the project's actual
// thesis type (0 = Investigacion cientifica, 1 = Proyecto tecnico,
// 2 = Revision sistematica -- see TipoTesis / TIPOS_TESIS in '@/types').
function validateThesis(sections: PBSection[], tipo: TipoTesis | null | undefined): ValidationIssue[] {
  const get = makeLookup(sections)
  switch (tipo) {
    case 1:  return validateProyectoTecnico(get)
    case 2:  return validateRevisionSistematica(get)
    case 0:
    default: return validateInvestigacionCientifica(get)
  }
}

const SEVERITY_CONFIG = {
  critical: { color: 'bg-red-900/20 border-red-700/30 text-red-400',    icon: 'ti-circle-x',       label: 'Critico' },
  warning:  { color: 'bg-orange-900/20 border-orange-700/30 text-orange-400', icon: 'ti-alert-triangle', label: 'Advertencia' },
  info:     { color: 'bg-brand-800/30 border-brand-700/20 text-brand-400',    icon: 'ti-info-circle',    label: 'Sugerencia' },
}

export default function AcademicValidator() {
  const { sections, project } = useStore()
  const [expanded, setExpanded] = useState<string | null>(null)

  const issues  = validateThesis(sections, project?.tipo)
  const crits   = issues.filter(i => i.severity === 'critical')
  const warns   = issues.filter(i => i.severity === 'warning')
  const infos   = issues.filter(i => i.severity === 'info')

  if (issues.length === 0) return (
    <div className="p-4 text-center">
      <div className="text-2xl mb-2">✓</div>
      <p className="text-green-400 text-xs font-medium">Sin problemas metodologicos detectados</p>
      <p className="text-brand-600 text-xs mt-1">La estructura academica parece completa</p>
    </div>
  )

  const Section = ({ items, severity }: { items: ValidationIssue[], severity: 'critical'|'warning'|'info' }) => {
    if (!items.length) return null
    const cfg = SEVERITY_CONFIG[severity]
    return (
      <div className="mb-2">
        <p className="text-xs font-medium text-brand-500 uppercase tracking-wider px-2 py-1">
          {cfg.label}s ({items.length})
        </p>
        {items.map(issue => (
          <div key={issue.id}
            className={cn('mx-1 mb-1.5 rounded-lg border p-2.5 cursor-pointer', cfg.color)}
            onClick={() => setExpanded(expanded === issue.id ? null : issue.id)}>
            <div className="flex items-start gap-2">
              <i className={cn('ti', cfg.icon, 'text-sm mt-0.5 flex-shrink-0')} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-xs leading-tight">{issue.element}</p>
                <p className="text-xs opacity-80 mt-0.5 leading-snug">{issue.problem}</p>
                {expanded === issue.id && (
                  <div className="mt-2 pt-2 border-t border-current/20">
                    <p className="text-xs font-medium mb-1">Como corregirlo:</p>
                    <p className="text-xs opacity-90 leading-relaxed">{issue.fix}</p>
                  </div>
                )}
              </div>
              <i className={cn('ti text-xs flex-shrink-0 mt-0.5 opacity-60',
                expanded === issue.id ? 'ti-chevron-up' : 'ti-chevron-down')} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex gap-1 flex-wrap px-2 py-2 border-b border-brand-700/20">
        {crits.length > 0 && <span className="text-xs bg-red-900/30 text-red-400 border border-red-700/30 rounded px-2 py-0.5">{crits.length} criticos</span>}
        {warns.length > 0 && <span className="text-xs bg-orange-900/30 text-orange-400 border border-orange-700/30 rounded px-2 py-0.5">{warns.length} advertencias</span>}
        {infos.length > 0 && <span className="text-xs bg-brand-800/30 text-brand-400 border border-brand-700/30 rounded px-2 py-0.5">{infos.length} sugerencias</span>}
      </div>
      <div className="pt-1">
        <Section items={crits}  severity="critical" />
        <Section items={warns}  severity="warning"  />
        <Section items={infos}  severity="info"     />
      </div>
    </div>
  )
}
