// ── NORMAS ───────────────────────────────────────────────────
export type NormaType = 'libre' | 'apa' | 'vancouver'
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
    desc:'Times New Roman 12pt - interlineado 2.0 - margenes 2.54cm',
    citationFormat:'author-year', bibSort:'alpha',
  },
  vancouver: {
    label:'Vancouver', font:"'Arial',sans-serif", fontSize:'11pt',
    lineHeight:'1.5', textAlign:'justify', cssClass:'norma-vancouver',
    desc:'Arial 11pt - interlineado 1.5 - citas numericas [N]',
    citationFormat:'numbered', bibSort:'appearance',
  },
}

// ── THESIS STRUCTURE ─────────────────────────────────────────
// items is ALWAYS string[] - never objects
export interface TesisFase  { fase: string; isRoman: boolean; items: string[] }
export interface TesisTipo  { nombre: string; fases: TesisFase[] }

export const TIPOS_TESIS: TesisTipo[] = [
  { nombre:'Investigacion cientifica', fases:[
    { fase:'Fase preliminar', isRoman:true, items:[
      'Portada oficial','Aprobacion del jurado',
      'Dedicatoria y agradecimientos','Resumen / Abstract',
      'Palabras clave / Keywords','Indice general',
      'Indice de tablas','Indice de figuras',
    ]},
    { fase:'Cuerpo de la tesis', isRoman:false, items:[
      'Introduccion','Cap. I -- El problema',
      'Cap. II -- Marco teorico','Cap. III -- Marco metodologico',
      'Cap. IV -- Analisis de resultados',
      'Cap. V -- Discusion de resultados',
      'Conclusiones y recomendaciones',
    ]},
    { fase:'Fase final', isRoman:false, items:['Referencias bibliograficas','Anexos'] },
  ]},
  { nombre:'Proyecto factible / tecnico', fases:[
    { fase:'Fase preliminar', isRoman:true, items:[
      'Portada, aprobacion, dedicatoria',
      'Resumen / Abstract y palabras clave',
      'Indice general','Indice de tablas y figuras',
    ]},
    { fase:'Cuerpo del proyecto', isRoman:false, items:[
      'Introduccion','Cap. I -- Diagnostico de la necesidad',
      'Cap. II -- Fundamentacion tecnologica',
      'Cap. III -- Diseno y arquitectura',
      'Cap. IV -- Desarrollo e implementacion',
      'Cap. V -- Pruebas, evaluacion y factibilidad',
      'Conclusiones y recomendaciones',
    ]},
    { fase:'Fase final', isRoman:false, items:[
      'Referencias bibliograficas',
      'Anexos (codigo, manual, hojas tecnicas)',
    ]},
  ]},
  { nombre:'Revision sistematica / documental', fases:[
    { fase:'Fase preliminar', isRoman:true, items:[
      'Portada, aprobacion, dedicatoria',
      'Resumen / Abstract y palabras clave',
      'Indice general','Indice de cuadros comparativos',
    ]},
    { fase:'Cuerpo analitico', isRoman:false, items:[
      'Introduccion','Cap. I -- Justificacion y alcance critico',
      'Cap. II -- Metodologia de busqueda y seleccion',
      'Cap. III -- Desarrollo categorial / ejes tematicos',
      'Cap. IV -- Analisis comparativo / sintesis',
      'Cap. V -- Discusion teorica',
      'Conclusiones y lineas de investigacion futuras',
    ]},
    { fase:'Fase final', isRoman:false, items:[
      'Referencias bibliograficas (extensa)',
      'Anexos (matrices de extraccion de datos)',
    ]},
  ]},
]

// ── SUB-ITEMS GUIDANCE ───────────────────────────────────────
// Separate from TIPOS_TESIS — used only for placeholder text in editor
// Never iterated as JSX children
export interface SubItem {
  key:         string
  label:       string
  placeholder: string
  required:    boolean
  minWords:    number
}

export const SECTION_GUIDANCE: Record<string, SubItem[]> = {
  'Cap. I -- El problema': [
    { key:'antecedentes',    label:'Antecedentes del problema',    placeholder:'Presenta investigaciones previas relacionadas con el problema (minimo 3 antecedentes con autor, ano y hallazgos)', required:true,  minWords:150 },
    { key:'planteamiento',   label:'Planteamiento del problema',   placeholder:'Describe el problema con datos y evidencias concretas que demuestren su existencia', required:true,  minWords:100 },
    { key:'formulacion',     label:'Formulacion del problema',     placeholder:'Redacta la pregunta principal: Como influye X en Y en el contexto Z?', required:true,  minWords:15  },
    { key:'obj_general',     label:'Objetivo general',             placeholder:'Objetivo general: [Verbo infinitivo] + [que] + [como] + [para que]. Ej: Determinar la influencia de X en Y...', required:true,  minWords:20  },
    { key:'obj_especificos', label:'Objetivos especificos',        placeholder:'1. Identificar... 2. Describir... 3. Evaluar... (minimo 3 objetivos especificos)', required:true,  minWords:60  },
    { key:'hipotesis',       label:'Hipotesis',                    placeholder:'Si X aumenta, entonces Y disminuye en el contexto Z. (Relaciona variable independiente con dependiente)', required:true,  minWords:30  },
    { key:'variables',       label:'Variables de investigacion',   placeholder:'Variable independiente: [nombre] - Definicion conceptual: ... - Definicion operacional: ...\nVariable dependiente: [nombre] - ...', required:true, minWords:60 },
    { key:'justificacion',   label:'Justificacion',                placeholder:'Justificacion teorica: ...\nJustificacion practica: ...\nJustificacion metodologica: ...', required:true, minWords:80 },
    { key:'delimitacion',    label:'Delimitacion',                 placeholder:'Delimitacion espacial: [donde]\nDelimitacion temporal: [cuando]\nDelimitacion tematica: [que aspectos incluye y excluye]', required:true, minWords:40 },
  ],
  'Cap. II -- Marco teorico': [
    { key:'bases_teoricas',   label:'Bases teoricas',     placeholder:'Teoria 1: Segun [Autor] ([ano]), ... \nTeoria 2: [Autor] ([ano]) plantea que...', required:true, minWords:300 },
    { key:'bases_legales',    label:'Bases legales',      placeholder:'Constitucion / Ley / Decreto que sustenta la investigacion', required:false, minWords:50  },
    { key:'marco_conceptual', label:'Marco conceptual',   placeholder:'Termino 1: Segun [Autor] ([ano]) es...\nTermino 2: ...', required:true, minWords:150 },
    { key:'estado_arte',      label:'Estado del arte',    placeholder:'Que se ha investigado sobre este tema? Que falta? Donde encaja este estudio?', required:true, minWords:150 },
  ],
  'Cap. III -- Marco metodologico': [
    { key:'tipo_inv',      label:'Tipo de investigacion',   placeholder:'Esta investigacion es de tipo [descriptiva/explicativa/correlacional] porque... Segun [Autor] ([ano])...', required:true, minWords:50 },
    { key:'diseno',        label:'Diseno de investigacion', placeholder:'El diseno es [experimental/no experimental/de campo/documental] porque...', required:true, minWords:50 },
    { key:'poblacion',     label:'Poblacion',               placeholder:'La poblacion esta conformada por [numero] [sujetos] que [caracteristicas] ubicados en [lugar]', required:true, minWords:50 },
    { key:'muestra',       label:'Muestra y muestreo',      placeholder:'La muestra es de [n] [sujetos] seleccionados mediante muestreo [tipo]. Formula aplicada: ...', required:true, minWords:60 },
    { key:'tecnicas',      label:'Tecnicas e instrumentos', placeholder:'Tecnica: [encuesta/entrevista/observacion]\nInstrumento: [cuestionario/guia] con [n] items tipo [Likert/dicotomica]', required:true, minWords:80 },
    { key:'validez',       label:'Validez y confiabilidad', placeholder:'Validez: sometido a juicio de [n] expertos que evaluaron...\nConfiabilidad: Alfa de Cronbach = [valor]', required:true, minWords:60 },
  ],
  'Conclusiones y recomendaciones': [
    { key:'conclusiones',    label:'Conclusiones',         placeholder:'En relacion al objetivo 1 (determinar X), se concluye que...\nEn relacion al objetivo 2...', required:true,  minWords:100 },
    { key:'recomendaciones', label:'Recomendaciones',      placeholder:'1. Se recomienda a [quien] que [que accion] con el fin de [para que]\n2. ...\n3. ...', required:true,  minWords:80  },
    { key:'lineas_futuras',  label:'Lineas futuras',       placeholder:'Para futuras investigaciones se sugiere explorar...', required:false, minWords:40  },
  ],
}

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
