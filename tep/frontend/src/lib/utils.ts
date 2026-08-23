import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { NormaType, PBReference, TiptapNode } from '@/types'

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

export function formatRef(r: PBReference, norma: NormaType, num = 1): string {
  if (norma === 'vancouver') return formatRefVancouver(r, num)
  return formatRefAPA(r)
}

// ── CITE TEXT ────────────────────────────────────────────────
export function buildCiteText(
  ref: PBReference, norma: NormaType, num: number, page?: string
): string {
  if (norma === 'vancouver') {
    return page ? `[${num}, p. ${page}]` : `[${num}]`
  }
  const last = ref.author.split(',')[0].trim().split(' ').pop() ?? ref.author
  return page ? `(${last}, ${ref.year}, p. ${page})` : `(${last}, ${ref.year})`
}

// ── DOI LOOKUP via CrossRef ──────────────────────────────────
export async function lookupDOI(doi: string): Promise<Partial<PBReference> | null> {
  try {
    const clean = doi.replace(/^https?:\/\/doi\.org\//,'')
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`)
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
      doi:       clean,
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

// ── DEBOUNCE ─────────────────────────────────────────────────
export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout>
  return ((...args: unknown[]) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms) }) as T
}
