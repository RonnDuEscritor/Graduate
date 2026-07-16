import { useState } from 'react'
import { useStore } from '@/store'
import { TIPOS_TESIS, NORMAS, flattenFaseItems } from '@/types'
import { formatRef, toRoman } from '@/lib/utils'
import type { PBSection, TiptapNode } from '@/types'

function tiptapToHTML(node: TiptapNode | null | undefined): string {
  if (!node) return ''
  if (node.type === 'text') {
    let text = node.text ?? ''
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
    case 'image':         return `<img src="${attrs.src}" alt="${attrs.alt ?? ''}" style="max-width:100%">`
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

    let arPg = 1, romPg = 1
    let bodyHTML = ''

    const AUTO_IDX = ['Índice general','Índice de tablas','Índice de figuras','Índice de tablas y figuras','Índice de cuadros comparativos']

    t.fases.forEach(fase => {
      flattenFaseItems(fase).forEach(({ name, group }) => {
        const sec = secMap.get(name)
        const pg  = fase.isRoman ? toRoman(romPg) : arPg
        if (fase.isRoman) romPg++; else arPg++

        const isAutoIdx  = AUTO_IDX.some(x => name.startsWith(x))
        const displayName = group ? name.split(' · ')[1] : name
        const content = sec?.content ? tiptapToHTML(sec.content as unknown as TiptapNode) : '<p style="color:#aaa;font-style:italic">Sin contenido.</p>'

        bodyHTML += `<div style="page-break-before:always">
          <div style="font-size:8pt;color:#999;text-align:right;margin-bottom:8pt">${pg}</div>
          <h2>${group ? `${group} — ${displayName}` : displayName}</h2>
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
h1{font-family:'Playfair Display',serif;font-size:18pt;color:#1A1133;margin:1em 0 .4em}
h2{font-family:'Playfair Display',serif;font-size:15pt;color:#2E1F5E;margin:.8em 0 .3em;border-bottom:.5pt solid #ddd;padding-bottom:6pt}
h3{font-family:'Playfair Display',serif;font-size:13pt;color:#3D2B7A;margin:.7em 0 .25em}
p{margin:0 0 .8em;text-align:${cfg.textAlign}}
ul,ol{padding-left:1.5em;margin-bottom:.8em}
blockquote{border-left:2pt solid #A99FDE;padding:4px 14px;margin:.8em 0;color:#444;font-style:italic}
table{border-collapse:collapse;width:100%;margin:1em 0}
th{font-weight:600;color:#2E1F5E;padding:6pt 9pt;border-bottom:1.5pt solid #534AB7;text-align:left}
td{padding:5pt 9pt;border-bottom:.5pt solid #D4CEEF}
</style></head><body>
<div style="text-align:center;page-break-after:always;padding:80pt 0">
  <div style="font-size:9pt;text-transform:uppercase;letter-spacing:.12em;color:#534AB7;margin-bottom:10pt">Tesis de Grado · ${NORMAS[norma].label}</div>
  <h1 style="font-size:22pt;margin:0 0 10pt">${project.title}</h1>
  ${project.author ? `<p style="font-size:11pt;color:#666">${project.author}</p>` : ''}
  ${project.institution ? `<p style="font-size:10pt;color:#888">${project.institution}</p>` : ''}
  <p style="font-size:10pt;color:#aaa;margin-top:16pt">TesisEditor Pro — RonnDu Corp. · ${project.year ?? new Date().getFullYear()}</p>
</div>
${bodyHTML}${bibHTML}
</body></html>`
  }

  const buildTOCHTML = (t: typeof TIPOS_TESIS[0], secs: PBSection[]) => {
    let html = '<div style="font-size:11pt">'
    let ar = 1, ro = 1
    t.fases.forEach(f => {
      html += `<div style="font-size:8pt;text-transform:uppercase;letter-spacing:.1em;color:#7B6FCC;margin:12pt 0 4pt;border-bottom:.5pt solid #ddd;padding-bottom:3pt">${f.fase}</div>`
      flattenFaseItems(f).forEach(({ name, group }) => {
        const pg = f.isRoman ? toRoman(ro) : ar
        if (f.isRoman) ro++; else ar++
        const displayName = group ? name.split(' · ')[1] : name
        const indent = group ? 'padding-left:14pt;color:#666' : ''
        html += `<div style="display:flex;justify-content:space-between;padding:3pt 0;border-bottom:.5pt dotted #eee;${indent}"><span>${displayName}</span><span style="color:#534AB7;font-weight:500">${pg}</span></div>`
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

  const exportWord = () => {
    setLoading(true)
    const html    = buildHTMLDoc()
    const content = '<?xml version="1.0" encoding="UTF-8"?>\n' + html
    const blob    = new Blob([content], { type: 'application/vnd.ms-word;charset=utf-8' })
    const url     = URL.createObjectURL(blob)
    const a       = document.createElement('a')
    a.href = url; a.download = `${project?.title ?? 'tesis'}.doc`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => { URL.revokeObjectURL(url); setLoading(false) }, 1000)
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
          <button onClick={exportWord} disabled={loading}
            className="w-full flex items-center gap-3 bg-brand-700/30 hover:bg-brand-700/50 border border-brand-600/30 rounded-xl px-4 py-3 text-sm text-brand-300 font-medium transition-all disabled:opacity-50">
            <i className="ti ti-file-word text-xl" />
            <div className="text-left">
              <div>Exportar Word (.doc)</div>
              <div className="text-xs text-brand-500 font-normal">Descarga directa</div>
            </div>
          </button>
        </div>

        <button onClick={onClose} className="w-full mt-3 py-2 text-xs text-brand-500 hover:text-brand-300 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  )
}
