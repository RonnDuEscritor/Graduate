import type { PBProject, PBSection, PBReference, PBCitation, TiptapNode } from '@/types'
import { hasRealTiptapContent } from '@/lib/utils'

// Auditoria integral (6.2 "Informe de preparacion para la entrega"): tres
// grupos -- errores que requieren atencion, recomendaciones y elementos que
// la aplicacion NO puede comprobar. "No se debe presentar una tesis como
// academicamente correcta solo porque el programa no detecte errores": por
// eso el tercer grupo es fijo y siempre se muestra.

export interface ReadinessItem { id: string; text: string }
export interface ReadinessReport {
  errors: ReadinessItem[]
  recommendations: ReadinessItem[]
  unchecked: ReadinessItem[]
}

// Secciones que NO deben exigirse como contenido propio del estudiante:
// portada (la app genera una si esta vacia), indices automaticos y la
// bibliografia (se genera a partir de las citas).
const AUTO_NAME_PREFIXES = ['Portada', 'Indice', 'Referencias bibliograficas']
const isAuto = (name: string) => AUTO_NAME_PREFIXES.some(p => name.startsWith(p))

export function computeReadiness(
  project: PBProject,
  sections: PBSection[],
  references: PBReference[],
  citations: PBCitation[],
): ReadinessReport {
  const errors: ReadinessItem[] = []
  const recommendations: ReadinessItem[] = []

  // ── Errores ─────────────────────────────────────────────────────────────
  const emptySections = sections
    .filter(s => !isAuto(s.name) && !hasRealTiptapContent(s.content as unknown as TiptapNode))
    .sort((a, b) => a.order_index - b.order_index)
  if (emptySections.length > 0) {
    const names = emptySections.slice(0, 5).map(s => s.name).join(', ')
    const more = emptySections.length > 5 ? ` y ${emptySections.length - 5} mas` : ''
    errors.push({ id: 'empty-sections', text: `${emptySections.length} seccion(es) sin contenido: ${names}${more}.` })
  }

  const sectionIds = new Set(sections.map(s => s.id))
  const refIds = new Set(references.map(r => r.id))
  const orphanCitations = citations.filter(c => !refIds.has(c.reference) || !sectionIds.has(c.section))
  if (orphanCitations.length > 0) {
    errors.push({ id: 'orphan-citations', text: `${orphanCitations.length} cita(s) apuntan a una referencia o seccion que ya no existe.` })
  }

  if (citations.length > 0 && references.length === 0) {
    errors.push({ id: 'no-bibliography', text: 'Hay citas en el texto pero la bibliografia esta vacia.' })
  }

  // ── Recomendaciones ─────────────────────────────────────────────────────
  const citedRefIds = new Set(citations.map(c => c.reference))
  const uncited = references.filter(r => !citedRefIds.has(r.id))
  if (uncited.length > 0) {
    recommendations.push({ id: 'uncited-refs', text: `${uncited.length} referencia(s) registradas no se citan en el texto y no apareceran en la bibliografia exportada.` })
  }
  if (references.length === 0) {
    recommendations.push({ id: 'no-refs', text: 'Todavia no has registrado referencias bibliograficas.' })
  }
  if (project.norma === 'libre') {
    recommendations.push({ id: 'norma-libre', text: 'Estas usando la norma "Libre". Elige la norma que exige tu institucion (APA, Vancouver, IEEE...) antes de exportar.' })
  }
  const missingMeta: string[] = []
  if (!project.author?.trim()) missingMeta.push('autor')
  if (!project.institution?.trim()) missingMeta.push('institucion')
  if (!project.year) missingMeta.push('anio')
  if (missingMeta.length > 0) {
    recommendations.push({ id: 'meta', text: `Faltan datos para la portada automatica: ${missingMeta.join(', ')}.` })
  }

  // ── No comprobado (siempre) ─────────────────────────────────────────────
  const unchecked: ReadinessItem[] = [
    { id: 'pagination', text: 'La paginacion real del documento exportado: las paginas mostradas en el editor y en los indices son estimadas.' },
    { id: 'template',   text: 'Que el formato cumpla la plantilla y el reglamento de tu institucion (margenes, portada, orden de secciones).' },
    { id: 'citation-fmt', text: 'La exactitud de cada referencia segun la norma: revisa autores, DOI y paginas contra la fuente.' },
    { id: 'content',    text: 'La calidad academica del contenido: la aplicacion no evalua argumentos, metodologia ni originalidad.' },
  ]

  return { errors, recommendations, unchecked }
}
