import { useState } from 'react'
import { useStore } from '@/store'
import { TIPOS_TESIS, NORMAS } from '@/types'
import { formatRef, escapeHtml, estimatePageRanges } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { PBSection, TiptapNode } from '@/types'

// Security note (audit 3.5): this builds an HTML string that gets fed to
// document.write() in the print/PDF export window, so any user-entered
// text has to be escaped -- otherwise typing literal HTML/script tags into
// a section and exporting it executes as real script in that window.
function tiptapToHTML(node: TiptapNode | null | undefined): string {
  if (!node) return ''
  if (node.type === 'text') {
    let text = escapeHtml(node.text ?? '')
    node.marks?.forEach(m => {
      if (m.type === 'bold')      text = `<strong>${text}</strong>`
      if (m.type === 'italic')    text = `<em>${text}</em>`
      if (m.type === 'underline') text = `<u>${text}</u>`
    })
    return text
  }
  const inner = node.content?.map(n => tiptapToHTML(n)).join('') ?? ''
  const attrs = node.attrs ?? {}
  switch (node.type) {
    case 'doc':           return inner
    case 'paragraph':     return `<p>${inner || '<br>'}</p>`
    case 'heading':       return `<h${attrs.level}>${inner}</h${attrs.level}>`
    case 'bulletList':    return `<ul>${inner}</ul>`
    case 'orderedList':   return `<ol>${inner}</ol>`
    case 'listItem':      return `<li>${inner}</li>`
    case 'blockquote':    return `<blockquote>${inner}</blockquote>`
    case 'horizontalRule':return `<hr>`
    case 'hardBreak':     return `<br>`
    case 'table':         return `<table>${inner}</table>`
    case 'tableRow':      return `<tr>${inner}</tr>`
    case 'tableHeader':   return `<th>${inner}</th>`
    case 'tableCell':     return `<td>${inner}</td>`
    case 'image':         return `<img src="${escapeHtml(String(attrs.src ?? ''))}" alt="${escapeHtml(String(attrs.alt ?? ''))}" style="max-width:100%">`
    // Audit 2.1: citation is an atomic node (no .content children), so it
    // rendered as an empty string via the default case below until this
    // was added -- citations would have silently vanished from every PDF
    // export. `display` is the human-readable text set when the citation
    // was inserted, e.g. "(Garcia, 2024)" or "[3]".
    case 'citation':      return `<span class="cite-chip">${escapeHtml(String(attrs.display ?? ''))}</span>`
    default:              return inner
  }
}

export default function ExportPanel({ onClose }: { onClose: () => void }) {
  const { project, sections, references, citations, norma } = useStore()
  const [loading, setLoading] = useState(false)

  const buildHTMLDoc = () => {
    if (!project) return ''
    const t   = TIPOS_TESIS[project.tipo]
    const cfg = NORMAS[norma]

    // Cited refs
    const citedIds = new Set(citations.map(c => c.reference))
    const vcOrder  = new Map<string, number>()
    let vcNum = 1
    ;[...citations].sort((a,b) => a.order_of_appearance - b.order_of_appearance).forEach(c => {
      if (!vcOrder.has(c.reference)) vcOrder.set(c.reference, vcNum++)
    })

    let citedRefs = references.filter(r => citedIds.has(r.id))
    if (norma === 'vancouver') citedRefs = citedRefs.sort((a,b) => (vcOrder.get(a.id)??0) - (vcOrder.get(b.id)??0))
    else citedRefs = citedRefs.sort((a,b) => a.author.localeCompare(b.author, 'es'))

    const secMap = new Map<string, PBSection>()
    sections.forEach(s => secMap.set(s.name, s))

    let bodyHTML = ''

    const AUTO_IDX = ['Índice general','Índice de tablas','Índice de figuras','Índice de tablas y figuras','Índice de cuadros comparativos']

    // Audit 2.1 fix (CRITICO): this used to label every section's printed
    // page number as a single incrementing integer ("1 seccion = 1
    // pagina"), so a 3-page introduction and a 12-page chapter were both
    // stamped as one page, and everything after the first long chapter was
    // wrong by however many real pages it actually spanned. Labels are now
    // an estimated range from estimatePageRanges() (same estimator used in
    // the editor's own page badges, see EditorPage.tsx), so a long chapter
    // reads "4-15" instead of falsely claiming "4". The browser's print
    // engine still paginates the actual printed content correctly on its
    // own -- this only fixes the human-readable page LABEL shown per
    // section and in the table of contents (buildTOCHTML below); real
    // pixel-accurate estimation would require measuring the live DOM,
    // which is a larger change tracked separately.
    let arCursor = 1, romCursor = 1
    t.fases.forEach(fase => {
      const items  = fase.items.map(name => ({ name, wordCount: secMap.get(name)?.word_count ?? 0 }))
      const ranges = estimatePageRanges(items, norma, fase.isRoman, fase.isRoman ? romCursor : arCursor)
      const last   = [...ranges.values()].pop()
      if (last) { if (fase.isRoman) romCursor = last.end + 1; else arCursor = last.end + 1 }

      items.forEach(({ name }) => {
        const sec = secMap.get(name)
        const pg  = ranges.get(name)?.label ?? ''

        const isAutoIdx  = AUTO_IDX.some(x => name.startsWith(x))
        const content = sec?.content ? tiptapToHTML(sec.content as unknown as TiptapNode) : '<p style="color:#aaa;font-style:italic">Sin contenido.</p>'

        bodyHTML += `<div style="page-break-before:always">
          <div style="font-size:8pt;color:#999;text-align:right;margin-bottom:8pt">${pg}</div>
          <h2>${name}</h2>
          ${isAutoIdx ? buildTOCHTML(t, sections) : content}
        </div>`
      })
    })

    // Bibliography
    let bibHTML = ''
    if (citedRefs.length > 0) {
      bibHTML = '<div style="page-break-before:always"><h2>Referencias bibliográficas</h2>'
      citedRefs.forEach((r, i) => {
        const num = norma === 'vancouver' ? (vcOrder.get(r.id) ?? i+1) : i+1
        bibHTML += `<p style="padding-left:24pt;text-indent:-24pt;margin-bottom:8pt">${formatRef(r, norma, num)}</p>`
      })
      bibHTML += '</div>'
    }

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:2.54cm}
body{font-family:${cfg.font};font-size:${cfg.fontSize};line-height:${cfg.lineHeight};color:#000;margin:0;background:#fff}
h1{font-family:'Playfair Display',serif;font-size:18pt;color:#20040D;margin:1em 0 .4em}
h2{font-family:'Playfair Display',serif;font-size:15pt;color:#450A1B;margin:.8em 0 .3em;border-bottom:.5pt solid #ddd;padding-bottom:6pt}
h3{font-family:'Playfair Display',serif;font-size:13pt;color:#5A0F24;margin:.7em 0 .25em}
p{margin:0 0 .8em;text-align:${cfg.textAlign}}
ul,ol{padding-left:1.5em;margin-bottom:.8em}
blockquote{border-left:2pt solid #CB8698;padding:4px 14px;margin:.8em 0;color:#444;font-style:italic}
table{border-collapse:collapse;width:100%;margin:1em 0}
th{font-weight:600;color:#450A1B;padding:6pt 9pt;border-bottom:1.5pt solid #7D1A31;text-align:left}
td{padding:5pt 9pt;border-bottom:.5pt solid #E9BAC5}
</style></head><body>
<div style="text-align:center;page-break-after:always;padding:80pt 0">
  <div style="font-size:9pt;text-transform:uppercase;letter-spacing:.12em;color:#7D1A31;margin-bottom:10pt">Tesis de Grado · ${NORMAS[norma].label}</div>
  <h1 style="font-size:22pt;margin:0 0 10pt">${escapeHtml(project.title)}</h1>
  ${project.author ? `<p style="font-size:11pt;color:#666">${escapeHtml(project.author)}</p>` : ''}
  ${project.institution ? `<p style="font-size:10pt;color:#888">${escapeHtml(project.institution)}</p>` : ''}
  <p style="font-size:10pt;color:#aaa;margin-top:16pt">Graduate Pro — RonnDu Corp. · ${project.year ?? new Date().getFullYear()}</p>
</div>
${bodyHTML}${bibHTML}
</body></html>`
  }

  const buildTOCHTML = (t: typeof TIPOS_TESIS[0], secs: PBSection[]) => {
    const secByName = new Map(secs.map(s => [s.name, s]))
    let html = '<div style="font-size:11pt">'
    let arCursor = 1, romCursor = 1
    t.fases.forEach(f => {
      const items  = f.items.map(name => ({ name, wordCount: secByName.get(name)?.word_count ?? 0 }))
      const ranges = estimatePageRanges(items, norma, f.isRoman, f.isRoman ? romCursor : arCursor)
      const last   = [...ranges.values()].pop()
      if (last) { if (f.isRoman) romCursor = last.end + 1; else arCursor = last.end + 1 }

      html += `<div style="font-size:8pt;text-transform:uppercase;letter-spacing:.1em;color:#A8546A;margin:12pt 0 4pt;border-bottom:.5pt solid #ddd;padding-bottom:3pt">${f.fase}</div>`
      items.forEach(({ name }) => {
        const pg = ranges.get(name)?.label ?? ''
        html += `<div style="display:flex;justify-content:space-between;padding:3pt 0;border-bottom:.5pt dotted #eee"><span>${name}</span><span style="color:#7D1A31;font-weight:500">${pg}</span></div>`
      })
    })
    return html + '</div>'
  }

  const exportPDF = async () => {
    setLoading(true)
    const html = buildHTMLDoc()
    const w = window.open('', '_blank', 'width=900,height=750')
    if (!w) { alert('Permite ventanas emergentes para exportar.'); setLoading(false); return }
    w.document.write(html)
    w.document.close()
    w.onload = () => { w.focus(); setTimeout(() => { w.print(); setLoading(false) }, 500) }
  }

  const [docxError, setDocxError] = useState<string | null>(null)

  // Builds the payload the Supabase Edge Function (generate-docx) needs to
  // needs to render a *real* OOXML .docx: ordered sections with their raw
  // Tiptap JSON (so headings become native Word styles the TOC field can
  // find), plus references already formatted as HTML via formatRef().
  const buildDocxPayload = () => {
    if (!project) return null
    const t = TIPOS_TESIS[project.tipo]

    const citedIds = new Set(citations.map(c => c.reference))
    const vcOrder  = new Map<string, number>()
    let vcNum = 1
    ;[...citations].sort((a,b) => a.order_of_appearance - b.order_of_appearance).forEach(c => {
      if (!vcOrder.has(c.reference)) vcOrder.set(c.reference, vcNum++)
    })
    let citedRefs = references.filter(r => citedIds.has(r.id))
    if (norma === 'vancouver') citedRefs = citedRefs.sort((a,b) => (vcOrder.get(a.id)??0) - (vcOrder.get(b.id)??0))
    else citedRefs = citedRefs.sort((a,b) => a.author.localeCompare(b.author, 'es'))

    const secMap = new Map<string, PBSection>()
    sections.forEach(s => secMap.set(s.name, s))
    const AUTO_IDX = ['Índice general','Índice de tablas','Índice de figuras','Índice de tablas y figuras','Índice de cuadros comparativos']

    const docxSections = t.fases.flatMap(fase => fase.items.map(name => ({
      name,
      isAutoIndex: AUTO_IDX.some(x => name.startsWith(x)),
      content: secMap.get(name)?.content ?? null,
    })))

    const referencesHtml = citedRefs.map((r, i) =>
      formatRef(r, norma, norma === 'vancouver' ? (vcOrder.get(r.id) ?? i+1) : i+1)
    )

    return {
      project: {
        id: project.id, title: project.title, author: project.author ?? '',
        institution: project.institution ?? '', year: project.year ?? new Date().getFullYear(),
        norma,
      },
      sections: docxSections,
      referencesHtml,
    }
  }

  const exportDocx = async () => {
    const payload = buildDocxPayload()
    if (!payload) return
    setLoading(true)
    setDocxError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Debes iniciar sesion para exportar.')

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-docx`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Error ${res.status} generando el documento.`)
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `${project?.title ?? 'tesis'}.docx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e: any) {
      setDocxError(e?.message || 'No se pudo generar el documento. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const done  = sections.filter(s => s.word_count > 0).length
  const total = sections.length

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => { if(e.target===e.currentTarget) onClose() }}>
      <div className="bg-brand-900 border border-brand-700 rounded-2xl p-6 w-full max-w-sm animate-fadeIn">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-700/50 flex items-center justify-center text-xl">📄</div>
          <div>
            <h3 className="font-serif text-brand-100 font-medium">Exportar tesis</h3>
            <p className="text-brand-500 text-xs">{done} de {total} secciones con contenido</p>
          </div>
        </div>

        <div className="bg-brand-800/50 rounded-xl p-3 mb-4 text-xs text-brand-400 space-y-1">
          <div className="flex justify-between"><span>Norma:</span><span className="text-brand-200">{NORMAS[norma].label}</span></div>
          <div className="flex justify-between"><span>Tipo:</span><span className="text-brand-200 text-right">{project ? TIPOS_TESIS[project.tipo].nombre : '—'}</span></div>
          <div className="flex justify-between"><span>Palabras:</span><span className="text-brand-200">{sections.reduce((s,sec)=>s+sec.word_count,0).toLocaleString('es')}</span></div>
        </div>

        <div className="space-y-2">
          <button onClick={exportPDF} disabled={loading}
            className="w-full flex items-center gap-3 bg-red-900/30 hover:bg-red-900/50 border border-red-700/30 rounded-xl px-4 py-3 text-sm text-red-300 font-medium transition-all disabled:opacity-50">
            <i className="ti ti-file-type-pdf text-xl" />
            <div className="text-left">
              <div>Exportar PDF</div>
              <div className="text-xs text-red-500 font-normal">Abre diálogo de impresión</div>
            </div>
          </button>
          <button onClick={exportDocx} disabled={loading}
            className="w-full flex items-center gap-3 bg-brand-700/30 hover:bg-brand-700/50 border border-brand-600/30 rounded-xl px-4 py-3 text-sm text-brand-300 font-medium transition-all disabled:opacity-50">
            <i className="ti ti-file-word text-xl" />
            <div className="text-left">
              <div>Exportar Word (.docx)</div>
              <div className="text-xs text-brand-500 font-normal">Documento real editable, con indice automatico</div>
            </div>
          </button>
        </div>

        {docxError && (
          <p className="mt-3 text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2">
            {docxError}
          </p>
        )}

        <button onClick={onClose} className="w-full mt-3 py-2 text-xs text-brand-500 hover:text-brand-300 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  )
}
