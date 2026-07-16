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

// ── REFERENCE FORMATTERS ─────────────────────────────────────
export function formatRefAPA(r: PBReference): string {
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

export function formatRefVancouver(r: PBReference, num: number): string {
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

export function formatRefIEEE(r: PBReference, num: number): string {
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

export function formatRefChicago(r: PBReference): string {
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
  if (norma === 'ieee')      return formatRefIEEE(r, num)
  if (norma === 'chicago')   return formatRefChicago(r)
  return formatRefAPA(r)
}

// ── CITE TEXT ────────────────────────────────────────────────
export function buildCiteText(
  ref: PBReference, norma: NormaType, num: number, page?: string
): string {
  if (norma === 'vancouver' || norma === 'ieee') {
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

// ── DEBOUNCE ─────────────────────────────────────────────────
export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout>
  return ((...args: unknown[]) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms) }) as T
}
