import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { NormaType, PBReference, TiptapNode } from '@/types'
import { NORMAS } from '@/types'
import { supabase } from '@/lib/supabase'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

// ── ROMAN NUMERALS ────────────────────────────────────────────
export function toRoman(n: number): string {
  const val = [1000,900,500,400,100,90,50,40,10,9,5,4,1]
  const sym = ['m','cm','d','cd','c','xc','l','xl','x','ix','v','iv','i']
  let r = ''; val.forEach((v,i) => { while(n>=v){r+=sym[i];n-=v} }); return r
}

// ── WORD COUNT from Tiptap JSON ───────────────────────────────
export function countWords(node: TiptapNode | null | undefined): number {
  if (!node) return 0
  let text = ''
  const extract = (n: TiptapNode) => {
    if (n.text) text += n.text + ' '
    n.content?.forEach(extract)
  }
  extract(node)
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0
}

// ── STRUCTURAL SECTION HELPERS (audit "files2" 27/08/2026) ─────
// Shared by both exporters (ExportPanel.tsx's buildHTMLDoc for PDF and
// buildDocxPayload for DOCX) so the two never drift apart on what counts
// as "this section has real content" or "these are the tables/figures in
// the document" -- exactly the kind of frontend/backend (or, here,
// PDF/DOCX) mismatch that caused the isRoman and norma-CSS bugs in
// earlier audits. Both exporters call these, not their own copies.

// True only if the Tiptap doc has visible text, an image, or a table --
// not just an empty paragraph (which is what a freshly created, untouched
// section actually contains, not `null`).
export function hasRealTiptapContent(doc: TiptapNode | null | undefined): boolean {
  if (!doc || !Array.isArray(doc.content)) return false
  let found = false
  const walk = (n: TiptapNode) => {
    if (found) return
    if (n.type === 'text' && (n.text ?? '').trim().length > 0) { found = true; return }
    if (n.type === 'image' || n.type === 'table') { found = true; return }
    n.content?.forEach(walk)
  }
  doc.content.forEach(walk)
  return found
}

// Depth-first walk collecting every node of the given types, in real
// document order (so a table appearing after a figure on the same page
// stays after it in the result -- this is NOT two separate passes).
function collectNodesByType(doc: TiptapNode | null | undefined, types: string[], out: TiptapNode[]) {
  if (!doc?.content) return
  doc.content.forEach(n => {
    if (types.includes(n.type)) out.push(n)
    collectNodesByType(n, types, out)
  })
}

export interface CaptionedItem { kind: 'table' | 'image'; number: number; sectionName: string }

// Audit P0 4.2 fix: 'Indice de tablas', 'Indice de figuras', 'Indice de
// tablas y figuras' and 'Indice de cuadros comparativos' used to all call
// the SAME general chapter table-of-contents generator as 'Indice
// general' -- so a reader looking for "list of tables" got a list of
// chapters instead. There's no captions/numbering subsystem in the editor
// yet (that's a real, separate feature -- see CAMBIOS.md pendientes), but
// without inventing one we can still walk the actual document and report
// the REAL tables/images that exist, in the order they appear, instead of
// silently substituting the wrong list. `orderedSections` must already be
// in final document reading order (preliminary sections excluded -- see
// callers) with each entry's real Tiptap content.
export function collectCaptionedItems(
  orderedSections: { name: string, content: TiptapNode | null | undefined }[],
  nodeType: 'table' | 'image',
): CaptionedItem[] {
  const items: CaptionedItem[] = []
  let counter = 0
  orderedSections.forEach(({ name, content }) => {
    const found: TiptapNode[] = []
    collectNodesByType(content, [nodeType], found)
    found.forEach(() => { counter++; items.push({ kind: nodeType, number: counter, sectionName: name }) })
  })
  return items
}

// Same as collectCaptionedItems, but for 'Indice de tablas y figuras'
// (used by tipo 1, "Proyecto factible / tecnico"): tables and figures
// interleaved in true document order, each numbered within its own kind
// (Tabla 1, Figura 1, Tabla 2, Figura 2...), matching how such a combined
// index is normally read.
export function collectCaptionedItemsMixed(
  orderedSections: { name: string, content: TiptapNode | null | undefined }[],
): CaptionedItem[] {
  const items: CaptionedItem[] = []
  let tableCount = 0, imageCount = 0
  orderedSections.forEach(({ name, content }) => {
    const found: TiptapNode[] = []
    collectNodesByType(content, ['table', 'image'], found)
    found.forEach(n => {
      if (n.type === 'table') { tableCount++; items.push({ kind: 'table', number: tableCount, sectionName: name }) }
      else { imageCount++; items.push({ kind: 'image', number: imageCount, sectionName: name }) }
    })
  })
  return items
}

// -- REFERENCE FORMATTERS -----------------------------------------
// Security note (audit 3.5): the formatted string these functions return
// is rendered via dangerouslySetInnerHTML in ReferencesPanel.tsx, and also
// dropped straight into an HTML document for the PDF export. Every field
// here comes from a user-editable form, so it must be HTML-escaped before
// interpolation -- otherwise a reference title like
// "<img src=x onerror=alert(1)>" executes as real HTML/JS for anyone who
// views that reference list. The literal <em> tags below are intentional
// markup this code adds itself, not user input, so they're left alone.
export function escapeHtml(value: string | undefined | null): string {
  if (!value) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeRefFields(r: PBReference): PBReference {
  return {
    ...r,
    author:    escapeHtml(r.author),
    initial:   escapeHtml(r.initial),
    year:      escapeHtml(r.year),
    title:     escapeHtml(r.title),
    publisher: escapeHtml(r.publisher),
    journal:   escapeHtml(r.journal),
    volume:    escapeHtml(r.volume),
    issue:     escapeHtml(r.issue),
    doi:       escapeHtml(r.doi),
    url:       escapeHtml(r.url),
    pages:     escapeHtml(r.pages),
  }
}

export function formatRefAPA(rawRef: PBReference): string {
  const r = escapeRefFields(rawRef)
  const init = r.initial ? ` ${r.initial}` : ''
  let s = `${r.author}${init} (${r.year}). <em>${r.title}</em>`
  if (r.ref_type === 'articulo') {
    if (r.journal) s += `. <em>${r.journal}</em>`
    if (r.volume)  s += `, ${r.volume}`
    if (r.issue)   s += `(${r.issue})`
    if (r.pages)   s += `, ${r.pages}`
  } else {
    if (r.publisher) s += `. ${r.publisher}`
  }
  const doiUrl = r.doi ? `https://doi.org/${r.doi.replace('https://doi.org/','')}` : r.url
  if (doiUrl) s += `. ${doiUrl}`
  return s + '.'
}

export function formatRefVancouver(rawRef: PBReference, num: number): string {
  const r = escapeRefFields(rawRef)
  const init = r.initial ? ` ${r.initial}` : ''
  let s = `${num}. ${r.author}${init}. ${r.title}. `
  if (r.ref_type === 'articulo') {
    if (r.journal) s += `${r.journal}. `
    s += `${r.year}`
    if (r.volume) s += `;${r.volume}`
    if (r.issue)  s += `(${r.issue})`
    if (r.pages)  s += `:${r.pages}`
  } else {
    if (r.publisher) s += `${r.publisher}; `
    s += r.year
  }
  if (r.doi) s += `. doi:${r.doi.replace('https://doi.org/','')}`
  return s.trimEnd() + '.'
}

export function formatRefIEEE(rawRef: PBReference, num: number): string {
  const r = escapeRefFields(rawRef)
  const init = r.initial ? `${r.initial} ` : ''
  let s = `[${num}] ${init}${r.author}, "${r.title},"`
  if (r.ref_type === 'articulo') {
    if (r.journal) s += ` <em>${r.journal}</em>,`
    if (r.volume)  s += ` vol. ${r.volume},`
    if (r.issue)   s += ` no. ${r.issue},`
    if (r.pages)   s += ` pp. ${r.pages},`
  } else {
    if (r.publisher) s += ` ${r.publisher},`
  }
  s += ` ${r.year}.`
  if (r.doi) s += ` doi: ${r.doi.replace('https://doi.org/','')}.`
  return s
}

export function formatRefChicago(rawRef: PBReference): string {
  const r = escapeRefFields(rawRef)
  const init = r.initial ? ` ${r.initial}` : ''
  let s = `${r.author}${init}. ${r.year}.`
  if (r.ref_type === 'articulo') {
    s += ` "${r.title}."`
    if (r.journal) s += ` <em>${r.journal}</em>`
    if (r.volume)  s += ` ${r.volume}`
    if (r.issue)   s += `, no. ${r.issue}`
    if (r.pages)   s += `: ${r.pages}`
  } else {
    s += ` <em>${r.title}</em>.`
    if (r.publisher) s += ` ${r.publisher}.`
  }
  const doiUrl = r.doi ? `https://doi.org/${r.doi.replace('https://doi.org/','')}` : r.url
  if (doiUrl) s += ` ${doiUrl}.`
  return s.trim()
}

// Audit P0 4.4 fix: MLA (9th ed., simplified) and Harvard were entirely
// missing -- only libre/APA/Vancouver existed, and IEEE/Chicago above were
// already written but never wired into formatRef() (see below).
export function formatRefMLA(rawRef: PBReference): string {
  const r = escapeRefFields(rawRef)
  const init = r.initial ? ` ${r.initial}` : ''
  let s = `${r.author}${init}.`
  if (r.ref_type === 'articulo') {
    s += ` "${r.title}."`
    if (r.journal) s += ` <em>${r.journal}</em>,`
    if (r.volume)  s += ` vol. ${r.volume},`
    if (r.issue)   s += ` no. ${r.issue},`
    s += ` ${r.year}`
    if (r.pages)   s += `, pp. ${r.pages}`
    s += '.'
  } else {
    s += ` <em>${r.title}</em>.`
    if (r.publisher) s += ` ${r.publisher},`
    s += ` ${r.year}.`
  }
  if (r.url) s += ` ${r.url}.`
  return s.trim()
}

export function formatRefHarvard(rawRef: PBReference): string {
  const r = escapeRefFields(rawRef)
  const init = r.initial ? ` ${r.initial}.` : ''
  let s = `${r.author}${init} (${r.year})`
  if (r.ref_type === 'articulo') {
    s += ` '${r.title}',`
    if (r.journal) s += ` <em>${r.journal}</em>,`
    if (r.volume)  s += ` ${r.volume}`
    if (r.issue)   s += `(${r.issue})`
    if (r.pages)   s += `, pp. ${r.pages}`
  } else {
    s += ` <em>${r.title}</em>.`
    if (r.publisher) s += ` ${r.publisher}.`
  }
  const doiUrl = r.doi ? `https://doi.org/${r.doi.replace('https://doi.org/','')}` : r.url
  if (doiUrl) s += ` ${doiUrl}.`
  return s.trim()
}

// Audit P0 4.4 fix: this used to hard-code `if (norma === 'vancouver')
// ... else APA`, silently formatting every other style as APA. Now
// dispatches by the actual style, and falls back to the norma's own
// citationFormat (author-year vs numbered) for any future style added to
// NORMAS in types/index.ts that doesn't have its own case yet, rather than
// defaulting straight to APA regardless of what that style actually is.
export function formatRef(r: PBReference, norma: NormaType, num = 1): string {
  switch (norma) {
    case 'vancouver': return formatRefVancouver(r, num)
    case 'ieee':      return formatRefIEEE(r, num)
    case 'chicago':   return formatRefChicago(r)
    case 'mla':       return formatRefMLA(r)
    case 'harvard':   return formatRefHarvard(r)
    case 'apa':
    case 'libre':
    default:          return formatRefAPA(r)
  }
}

// ── CITE TEXT ────────────────────────────────────────────────
// Audit P0 4.4 fix: previously hard-coded `if (norma === 'vancouver')`,
// so every other style -- including the newly wired IEEE, Chicago, MLA and
// Harvard -- fell through to the APA-shaped (Author, Year) branch. Now
// dispatches on NORMAS[norma].citationFormat (numbered vs author-year),
// the same abstraction formatRef() uses, with MLA special-cased since its
// convention is author-page rather than author-year.
export function buildCiteText(
  ref: PBReference, norma: NormaType, num: number, page?: string
): string {
  if (NORMAS[norma].citationFormat === 'numbered') {
    return page ? `[${num}, p. ${page}]` : `[${num}]`
  }
  const last = ref.author.split(',')[0].trim().split(' ').pop() ?? ref.author
  if (norma === 'mla') {
    return page ? `(${last} ${page})` : `(${last})`
  }
  return page ? `(${last}, ${ref.year}, p. ${page})` : `(${last}, ${ref.year})`
}

// ── CITATION NODE SCANNING (audit 2.1 / 3.1, GRAVE) ─────────────
// Walks a section's Tiptap JSON in document order and returns the
// referenceId of every 'citation' node found, deduplicated to first
// occurrence. This is what makes the document itself the single source of
// truth for "what is actually cited, and in what order" -- see
// syncSectionCitations() in store/index.ts, which reconciles the
// `citations` table against exactly this list on every save instead of
// trusting a separately-maintained database row that the document could
// drift away from (e.g. by the user deleting a citation chip by hand).
export function extractCitationRefIds(doc: TiptapNode | null | undefined): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  const walk = (n: TiptapNode) => {
    if (n.type === 'citation') {
      const refId = (n.attrs as { referenceId?: string } | undefined)?.referenceId
      if (refId && !seen.has(refId)) { seen.add(refId); ordered.push(refId) }
      return
    }
    n.content?.forEach(walk)
  }
  if (doc) walk(doc)
  return ordered
}

// ── DOI LOOKUP via CrossRef ──────────────────────────────────
// Audit P1 item 9 fix: this used to call api.crossref.org directly from
// the browser. It now goes through the 'lookup-doi' Supabase Edge
// Function, which requires an authenticated user and centralizes the
// actual CrossRef call server-side (see
// supabase/functions/lookup-doi/index.ts) -- same reasoning already
// applied to LanguageTool via check-grammar. Parsing the CrossRef response
// shape stays here unchanged; only where the HTTP call goes has changed.
export async function lookupDOI(doi: string): Promise<Partial<PBReference> | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lookup-doi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ doi }),
    })
    if (!res.ok) return null
    const { message: w } = await res.json()
    return {
      author:    w.author?.[0] ? `${w.author[0].family}${w.author.length>1?' et al.':''}` : '',
      initial:   w.author?.[0]?.given?.split(' ').map((n:string)=>n[0]+'.').join(' ') ?? '',
      year:      String(w['published-print']?.['date-parts']?.[0]?.[0] ?? w['published-online']?.['date-parts']?.[0]?.[0] ?? ''),
      title:     w.title?.[0] ?? '',
      journal:   w['container-title']?.[0],
      publisher: w.publisher,
      pages:     w.page,
      doi:       doi.replace(/^https?:\/\/doi\.org\//,''),
      ref_type:  'articulo',
    }
  } catch { return null }
}

// ── ACADEMIC REVISION ────────────────────────────────────────
export function extractTextFromTiptap(node: TiptapNode | null | undefined): string {
  if (!node) return ''
  let text = ''
  const walk = (n: TiptapNode) => { if (n.text) text += n.text + ' '; n.content?.forEach(walk) }
  walk(node)
  return text.trim()
}

// ── RELATIVE TIME ────────────────────────────────────────────
export function relativeTime(date: Date | string): string {
  const d = new Date(date), now = new Date()
  const m = Math.floor((now.getTime()-d.getTime())/60000)
  if (m < 1)  return 'ahora mismo'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m/60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h/24)}d`
}

// -- FRIENDLY ERROR MESSAGES (audit 4.8) ------------------------
// Supabase/PostgREST error messages come back in English and are often
// implementation details ("duplicate key value violates unique
// constraint..."). This maps the common ones to plain Spanish so the user
// never sees raw backend internals; anything unrecognized falls back to a
// generic message rather than leaking the original text.
const FRIENDLY_ERROR_PATTERNS: [RegExp, string][] = [
  [/invalid login credentials/i,               'Correo o contrasena incorrectos.'],
  [/user already registered/i,                 'Ya existe una cuenta con este correo.'],
  [/password should be at least/i,             'La contrasena es demasiado corta.'],
  [/email not confirmed/i,                     'Debes confirmar tu correo antes de iniciar sesion. Revisa tu bandeja de entrada.'],
  [/email rate limit exceeded/i,                'Demasiados intentos. Espera un momento y vuelve a intentar.'],
  [/for security purposes.*after (\d+) seconds/i, 'Por seguridad, espera unos segundos antes de intentar de nuevo.'],
  [/unable to validate email address/i,         'El correo electronico no es valido.'],
  [/rate limit/i,                               'Demasiados intentos. Espera un momento y vuelve a intentar.'],
  [/network|fetch failed|failed to fetch/i,     'No se pudo conectar con el servidor. Revisa tu conexion a internet.'],
  [/duplicate key value/i,                      'Ese registro ya existe.'],
  [/violates row-level security/i,              'No tienes permiso para realizar esta accion.'],
  [/permission denied/i,                        'No tienes permiso para realizar esta accion.'],
  [/jwt expired/i,                              'Tu sesion expiro. Inicia sesion de nuevo.'],
]

export function friendlyError(err: unknown, fallback = 'Ocurrio un error. Intenta de nuevo.'): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  for (const [pattern, friendly] of FRIENDLY_ERROR_PATTERNS) {
    if (pattern.test(raw)) return friendly
  }
  return raw ? fallback : fallback
}

// ── PAGE ESTIMATION (audit 1.1 / 2.1, CRITICO) ─────────────────
// Both the editor's page badge and the PDF/DOCX index used to count
// "1 section = 1 page" no matter how long the section actually was, so a
// 3-page introduction and a 12-page chapter were both labelled as a single
// page and the whole index/page-number system drifted further from reality
// with every section. A fully "real" fix means measuring actual rendered
// page breaks (from the live DOM in the editor, and from the print/DOCX
// engine on export) rather than estimating from word count -- that's a
// bigger, dedicated piece of work (see AUDITORIA notes) that changes how
// content flows in the editor itself. Until that lands, this at least
// stops asserting a page count we know is wrong: it estimates real page
// span from word count using typical words-per-page density for each
// norma's font/line-spacing, so a 12-page chapter is labelled as
// spanning ~12 pages instead of being flattened to "page 4".
const WORDS_PER_PAGE: Record<NormaType, number> = {
  // Times New Roman 12pt, interlineado 2.0, margenes 2.54cm (APA 7)
  apa:       270,
  // Arial 11pt, interlineado 1.5 (Vancouver)
  vancouver: 420,
  // Inter 14px, interlineado 1.85 (Libre)
  libre:     330,
  // Audit P0 4.4: added when IEEE/Chicago/MLA/Harvard were wired in --
  // density follows directly from each style's font/line-height in NORMAS
  // (types/index.ts), same reasoning as the three original entries above.
  // Times New Roman 10pt, interlineado 1.5 (IEEE)
  ieee:      380,
  // Times New Roman 12pt, interlineado 2.0 (Chicago)
  chicago:   270,
  // Times New Roman 12pt, interlineado 2.0 (MLA)
  mla:       270,
  // Times New Roman 12pt, interlineado 1.5 (Harvard)
  harvard:   330,
}

/** Estimated number of physical pages a section's content would occupy. Always at least 1. */
export function estimatePageCount(wordCount: number, norma: NormaType): number {
  const density = WORDS_PER_PAGE[norma] ?? WORDS_PER_PAGE.libre
  return Math.max(1, Math.ceil(wordCount / density))
}

export interface PageRange { start: number; end: number; label: string }

/**
 * Walks a list of { name, wordCount } entries in reading order, in either
 * roman or arabic numbering, and assigns each one an estimated page range
 * based on estimatePageCount() -- so a section spanning several pages shows
 * a range ("12-15") instead of a single fabricated number, and the next
 * section's start page actually accounts for that span.
 */
export function estimatePageRanges(
  items: { name: string, wordCount: number }[],
  norma: NormaType,
  isRoman: boolean,
  startAt = 1,
): Map<string, PageRange> {
  const ranges = new Map<string, PageRange>()
  let cursor = startAt
  for (const item of items) {
    const span  = estimatePageCount(item.wordCount, norma)
    const start = cursor
    const end   = cursor + span - 1
    const label = isRoman
      ? (start === end ? toRoman(start) : `${toRoman(start)}-${toRoman(end)}`)
      : (start === end ? String(start) : `${start}-${end}`)
    ranges.set(item.name, { start, end, label })
    cursor = end + 1
  }
  return ranges
}

// ── DEBOUNCE ─────────────────────────────────────────────────
export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout>
  return ((...args: unknown[]) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms) }) as T
}
