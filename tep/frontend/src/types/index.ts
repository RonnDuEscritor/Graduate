// ── NORMAS ───────────────────────────────────────────────────
export type NormaType = 'libre' | 'apa' | 'vancouver' | 'ieee' | 'chicago'
export type TipoTesis = 0 | 1 | 2
export type RefType   = 'libro' | 'articulo' | 'tesis' | 'web' | 'capitulo'
export type IssueLevel = 'error' | 'warning' | 'info'

export interface NormaConfig {
  label: string; font: string; fontSize: string
  lineHeight: string; textAlign: string; cssClass: string; desc: string
  citationFormat: 'author-year' | 'numbered'
  bibSort: 'alpha' | 'appearance'
}

export const NORMAS: Record<NormaType, NormaConfig> = {
  libre: {
    label:'Libre', font:"'Inter',sans-serif", fontSize:'14px',
    lineHeight:'1.85', textAlign:'left', cssClass:'norma-libre', desc:'',
    citationFormat:'author-year', bibSort:'alpha',
  },
  apa: {
    label:'APA 7', font:"'Times New Roman',Times,serif", fontSize:'12pt',
    lineHeight:'2.0', textAlign:'left', cssClass:'norma-apa',
    desc:'Times New Roman 12pt · interlineado 2.0 · márgenes 2.54cm',
    citationFormat:'author-year', bibSort:'alpha',
  },
  vancouver: {
    label:'Vancouver', font:"'Arial',sans-serif", fontSize:'11pt',
    lineHeight:'1.5', textAlign:'justify', cssClass:'norma-vancouver',
    desc:'Arial 11pt · interlineado 1.5 · citas numéricas [N]',
    citationFormat:'numbered', bibSort:'appearance',
  },
  ieee: {
    label:'IEEE', font:"'Times New Roman',Times,serif", fontSize:'10pt',
    lineHeight:'1.15', textAlign:'justify', cssClass:'norma-ieee',
    desc:'Times New Roman 10pt · interlineado sencillo · citas numéricas [N]',
    citationFormat:'numbered', bibSort:'appearance',
  },
  chicago: {
    label:'Chicago', font:"'Times New Roman',Times,serif", fontSize:'12pt',
    lineHeight:'2.0', textAlign:'left', cssClass:'norma-chicago',
    desc:'Times New Roman 12pt · interlineado 2.0 · estilo autor-fecha',
    citationFormat:'author-year', bibSort:'alpha',
  },
}

// ── THESIS STRUCTURE ─────────────────────────────────────────
// An item can be a plain section name, or a chapter with guided sub-items.
// The chapter itself remains an editable section (e.g. a short intro),
// and each sub-item becomes its own guided, independently-tracked section.
export interface TesisChapterGroup { chapter: string; subItems: string[] }
export type TesisFaseItem = string | TesisChapterGroup
export interface TesisFase  { fase: string; isRoman: boolean; items: TesisFaseItem[] }
export interface TesisTipo  { nombre: string; fases: TesisFase[] }

// Chapter "short code" used to build unique, readable sub-item names,
// e.g. "Cap. I" + "Antecedentes" → "Cap. I · Antecedentes"
export function chapterShortCode(chapter: string): string {
  return chapter.split(' — ')[0].trim()
}

export function isChapterGroup(item: TesisFaseItem): item is TesisChapterGroup {
  return typeof item !== 'string'
}

export function subItemName(chapter: string, subItem: string): string {
  return `${chapterShortCode(chapter)} · ${subItem}`
}

// Flattens a fase's items into a linear list of leaf (editable) section
// names, keeping track of which chapter (if any) each leaf belongs to.
export interface FlatFaseItem { name: string; group?: string; isChapterHeader?: boolean }
export function flattenFaseItems(fase: TesisFase): FlatFaseItem[] {
  const out: FlatFaseItem[] = []
  fase.items.forEach(item => {
    if (typeof item === 'string') {
      out.push({ name: item })
    } else {
      out.push({ name: item.chapter, isChapterHeader: true })
      item.subItems.forEach(si => out.push({ name: subItemName(item.chapter, si), group: item.chapter }))
    }
  })
  return out
}

export function flattenTipo(tipo: TesisTipo): FlatFaseItem[] {
  return tipo.fases.flatMap(flattenFaseItems)
}

export const TIPOS_TESIS: TesisTipo[] = [
  { nombre:'Investigación científica', fases:[
    { fase:'Fase preliminar', isRoman:true, items:[
      'Portada oficial','Aprobación del jurado','Dedicatoria y agradecimientos',
      'Resumen / Abstract','Palabras clave / Keywords',
      'Índice general','Índice de tablas','Índice de figuras',
    ]},
    { fase:'Cuerpo de la tesis', isRoman:false, items:[
      'Introducción',
      { chapter:'Cap. I — El problema', subItems:[
        'Antecedentes', 'Planteamiento del problema',
        'Objetivos generales', 'Objetivos específicos', 'Justificación',
      ]},
      { chapter:'Cap. II — Marco teórico', subItems:[
        'Antecedentes de la investigación', 'Bases teóricas', 'Definición de términos básicos',
      ]},
      { chapter:'Cap. III — Marco metodológico', subItems:[
        'Tipo y diseño de investigación', 'Población y muestra',
        'Hipótesis', 'Variables (operacionalización)', 'Técnicas e instrumentos',
      ]},
      { chapter:'Cap. IV — Análisis de resultados', subItems:[
        'Presentación de resultados', 'Interpretación de resultados',
      ]},
      { chapter:'Cap. V — Discusión de resultados', subItems:[
        'Discusión de resultados', 'Comparación con antecedentes',
      ]},
      'Conclusiones y recomendaciones',
    ]},
    { fase:'Fase final', isRoman:false, items:['Referencias bibliográficas','Anexos'] },
  ]},
  { nombre:'Proyecto factible / técnico', fases:[
    { fase:'Fase preliminar', isRoman:true, items:[
      'Portada, aprobación, dedicatoria','Resumen / Abstract y palabras clave',
      'Índice general','Índice de tablas y figuras',
    ]},
    { fase:'Cuerpo del proyecto', isRoman:false, items:[
      'Introducción',
      { chapter:'Cap. I — Diagnóstico de la necesidad', subItems:[
        'Antecedentes', 'Planteamiento de la necesidad',
        'Objetivos generales', 'Objetivos específicos', 'Justificación',
      ]},
      { chapter:'Cap. II — Fundamentación tecnológica', subItems:[
        'Antecedentes tecnológicos', 'Bases teóricas', 'Definición de términos técnicos',
      ]},
      { chapter:'Cap. III — Diseño y arquitectura', subItems:[
        'Requerimientos', 'Arquitectura propuesta', 'Diagramas y modelos',
      ]},
      { chapter:'Cap. IV — Desarrollo e implementación', subItems:[
        'Herramientas y tecnologías', 'Proceso de desarrollo', 'Resultados de la implementación',
      ]},
      { chapter:'Cap. V — Pruebas, evaluación y factibilidad', subItems:[
        'Pruebas realizadas', 'Evaluación de resultados', 'Factibilidad técnica y económica',
      ]},
      'Conclusiones y recomendaciones',
    ]},
    { fase:'Fase final', isRoman:false, items:['Referencias bibliográficas','Anexos (código, manual)'] },
  ]},
  { nombre:'Revisión sistemática / documental', fases:[
    { fase:'Fase preliminar', isRoman:true, items:[
      'Portada, aprobación, dedicatoria','Resumen / Abstract y palabras clave',
      'Índice general','Índice de cuadros comparativos',
    ]},
    { fase:'Cuerpo analítico', isRoman:false, items:[
      'Introducción',
      { chapter:'Cap. I — Justificación y alcance crítico', subItems:[
        'Antecedentes', 'Planteamiento del problema', 'Objetivos', 'Justificación', 'Alcance',
      ]},
      { chapter:'Cap. II — Metodología de búsqueda y selección', subItems:[
        'Criterios de búsqueda', 'Fuentes consultadas', 'Criterios de inclusión y exclusión',
      ]},
      { chapter:'Cap. III — Desarrollo categorial / ejes temáticos', subItems:[
        'Eje temático 1', 'Eje temático 2', 'Eje temático 3',
      ]},
      { chapter:'Cap. IV — Análisis comparativo / síntesis', subItems:[
        'Cuadro comparativo', 'Síntesis crítica',
      ]},
      { chapter:'Cap. V — Discusión teórica', subItems:[
        'Discusión', 'Vacíos identificados en la literatura',
      ]},
      'Conclusiones y líneas de investigación futuras',
    ]},
    { fase:'Fase final', isRoman:false, items:['Referencias bibliográficas (extensa)','Anexos (matrices)'] },
  ]},
]

// ── ACADEMIC PROGRESS CHECKLIST ───────────────────────────────
// Key academic elements tracked per thesis type (parallel array to
// TIPOS_TESIS), matched against section names to build a checklist like:
// Objetivos ✔ · Hipótesis ✔ · Variables ✘ · Metodología ✔ · ...
export interface AcademicChecklistItem { label: string; match: string[] }
export const ACADEMIC_CHECKLIST: AcademicChecklistItem[][] = [
  // Investigación científica
  [
    { label:'Objetivos',     match:['Objetivos generales', 'Objetivos específicos'] },
    { label:'Hipótesis',     match:['Hipótesis'] },
    { label:'Variables',     match:['Variables'] },
    { label:'Metodología',   match:['Tipo y diseño de investigación', 'Técnicas e instrumentos'] },
    { label:'Resultados',    match:['Presentación de resultados', 'Interpretación de resultados'] },
    { label:'Conclusiones',  match:['Conclusiones y recomendaciones'] },
  ],
  // Proyecto factible / técnico
  [
    { label:'Objetivos',            match:['Objetivos generales', 'Objetivos específicos'] },
    { label:'Diseño / arquitectura',match:['Arquitectura propuesta', 'Diagramas y modelos'] },
    { label:'Implementación',       match:['Proceso de desarrollo', 'Resultados de la implementación'] },
    { label:'Pruebas',              match:['Pruebas realizadas'] },
    { label:'Factibilidad',         match:['Factibilidad técnica y económica'] },
    { label:'Conclusiones',         match:['Conclusiones y recomendaciones'] },
  ],
  // Revisión sistemática / documental
  [
    { label:'Objetivos',              match:['Objetivos'] },
    { label:'Metodología de búsqueda',match:['Criterios de búsqueda', 'Fuentes consultadas'] },
    { label:'Ejes temáticos',         match:['Eje temático'] },
    { label:'Síntesis',               match:['Síntesis crítica', 'Cuadro comparativo'] },
    { label:'Discusión',              match:['Discusión'] },
    { label:'Conclusiones',           match:['Conclusiones y líneas de investigación futuras'] },
  ],
]

// ── POCKETBASE RECORDS ───────────────────────────────────────
export interface PBProject {
  id: string; collectionId: string; collectionName: string
  created: string; updated: string
  user: string; title: string; tipo: TipoTesis; norma: NormaType
  institution?: string; author?: string; tutor?: string
  year?: number; word_count?: number
  settings?: { autoSaveInterval?: number; revisionEnabled?: boolean; aiEnabled?: boolean }
}

export interface PBSection {
  id: string; collectionId: string; collectionName: string
  created: string; updated: string
  project: string; name: string; fase: string
  order_index: number; is_roman: boolean
  content?: TiptapDoc | null; word_count: number
}

export interface PBReference {
  id: string; collectionId: string; collectionName: string
  created: string; updated: string
  project: string; author: string; initial?: string; year: string
  ref_type: RefType; title: string; publisher?: string
  journal?: string; volume?: string; issue?: string
  doi?: string; url?: string; pages?: string
}

export interface PBCitation {
  id: string; collectionId: string; collectionName: string
  created: string; updated: string
  project: string; section: string; reference: string
  page_ref?: string; order_of_appearance: number
}

export interface PBVersion {
  id: string; collectionId: string; collectionName: string
  created: string; updated: string
  project: string; label: string
  snapshot: Record<string, TiptapDoc | null>; auto: boolean
}

// ── TIPTAP ───────────────────────────────────────────────────
export interface TiptapDoc  { type: 'doc'; content: TiptapNode[] }
export interface TiptapNode {
  type: string; attrs?: Record<string, unknown>
  content?: TiptapNode[]; text?: string; marks?: TiptapMark[]
}
export interface TiptapMark { type: string; attrs?: Record<string, unknown> }

// ── REVISION ─────────────────────────────────────────────────
export interface RevisionIssue {
  id: string; sectionId?: string; sectionName?: string
  level: IssueLevel; code: string; message: string
}

// ── STORE ────────────────────────────────────────────────────
export interface AppState {
  project:         PBProject | null
  sections:        PBSection[]
  references:      PBReference[]
  citations:       PBCitation[]
  activeSectionId: string | null
  norma:           NormaType
  revisionIssues:  RevisionIssue[]
  isSaving:        boolean
  lastSaved:       Date | null
  aiPanelOpen:     boolean
  aiContext:       string
}
