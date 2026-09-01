// Supabase Edge Function -- generate-docx
// Genera un .docx real (OOXML) a partir del contenido Tiptap de una tesis.
// Archivo unico autocontenido para pegar directo en el editor web de
// Supabase (Dashboard -> Edge Functions -> Via Editor).
//
// deno-lint-ignore-file no-explicit-any
import {
  Document, Paragraph, TextRun, TableOfContents, PageNumber,
  Header, Footer, AlignmentType, HeadingLevel, NumberFormat, SectionType,
  BorderStyle, Table, TableRow, TableCell, WidthType, ImageRun, Packer,
} from 'npm:docx@9.7.1'
import { withSupabase } from 'npm:@supabase/server@^1'
import { Buffer } from 'node:buffer'

// Audit item 6 fix (MEDIA-ALTA): none of these existed before -- the
// function checked auth and project ownership, but nothing bounded the
// size of the export payload itself (sections, image data URIs, ...) that
// an authenticated caller could send. A pathological or malicious request
// could drive excessive memory use, long generation times, or timeouts.
const MAX_REQUEST_BYTES = 25 * 1024 * 1024 // 25MB raw request body
const MAX_SECTIONS      = 300              // generous ceiling for a real thesis (usually 10-40)
const MAX_IMAGE_BYTES   = 8 * 1024 * 1024  // 8MB per decoded image (used in dataUriToImageRun below)

// =================================================================
// norma (academic style) config
// =================================================================
// Mirrors frontend/src/types/index.ts NORMAS, but resolved into the units
// docx.js expects (half-points for font size, line-spacing multiplier etc).
// Kept intentionally separate from the frontend copy -- this file only
// controls low-level OOXML rendering, never academic/business rules
// (those stay in the frontend, the single source of truth).
//
// Audit P0 4.1 fix (CRITICO): this used to define only libre/apa/vancouver,
// even though the frontend (types/index.ts NORMAS) already exercised seven
// styles (libre, apa, vancouver, ieee, chicago, mla, harvard) since the
// P0 4.4 fix in CAMBIOS.md. resolveNorma() silently fell back to
// NORMAS.libre for any of the other four, so choosing IEEE/Chicago/MLA/
// Harvard in the UI produced a DOCX that quietly ignored the selected
// font, size, line spacing and alignment and used Libre's instead -- the
// interface promised seven styles but the exported Word document only
// ever honored three. All seven are now defined here, values converted
// 1:1 from the frontend's NormaConfig (pt -> half-points *2, textAlign
// 'justify'/'left' -> docx.js AlignmentType names).
export const NORMAS: Record<string, {
  label: string
  font: string
  fontHalfPt: number
  lineMultiplier: number
  align: 'LEFT' | 'JUSTIFIED'
}> = {
  libre: {
    label: 'Libre',
    font: 'Inter',
    fontHalfPt: 22, // ~11pt
    lineMultiplier: 1.85,
    align: 'LEFT',
  },
  apa: {
    label: 'APA 7',
    font: 'Times New Roman',
    fontHalfPt: 24, // 12pt
    lineMultiplier: 2.0,
    align: 'LEFT',
  },
  vancouver: {
    label: 'Vancouver',
    font: 'Arial',
    fontHalfPt: 22, // 11pt
    lineMultiplier: 1.5,
    align: 'JUSTIFIED',
  },
  ieee: {
    label: 'IEEE',
    font: 'Times New Roman',
    fontHalfPt: 20, // 10pt
    lineMultiplier: 1.5,
    align: 'JUSTIFIED',
  },
  chicago: {
    label: 'Chicago',
    font: 'Times New Roman',
    fontHalfPt: 24, // 12pt
    lineMultiplier: 2.0,
    align: 'LEFT',
  },
  mla: {
    label: 'MLA',
    font: 'Times New Roman',
    fontHalfPt: 24, // 12pt
    lineMultiplier: 2.0,
    align: 'LEFT',
  },
  harvard: {
    label: 'Harvard',
    font: 'Times New Roman',
    fontHalfPt: 24, // 12pt
    lineMultiplier: 1.5,
    align: 'JUSTIFIED',
  },
}

// Audit note: resolveNorma() still falls back to NORMAS.libre if it ever
// receives a norma value NOT in this map. That fallback is now purely
// defensive (e.g. a future frontend value shipped before this file is
// updated to match) rather than the silent default path every non-core
// style hit before this fix -- projects.norma also has a CHECK constraint
// (see supabase/migrations/0007_norma_expansion.sql) restricting it to
// exactly these seven values, so in practice this function's map should
// always have an exact match.
export function resolveNorma(norma: string) {
  return NORMAS[norma] || NORMAS.libre
}


// =================================================================
// tiptap JSON -> docx.js elements
// =================================================================
const HEADING_MAP: Record<number, any> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
}

const ALIGN_MAP: Record<string, any> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
}

function marksToRunOptions(marks: any[] | undefined) {
  const opts: any = {}
  ;(marks || []).forEach(m => {
    if (m.type === 'bold') opts.bold = true
    if (m.type === 'italic') opts.italics = true
    if (m.type === 'underline') opts.underline = {}
  })
  return opts
}

// Flattens a paragraph-like node's inline content (text + hardBreak +
// citation) into TextRuns.
// Audit 2.1 fix: 'citation' is a new atomic Tiptap node (see
// frontend/src/extensions/CitationNode.ts) with no text content of its
// own -- without this branch every citation node fell through to the
// final `else` below as if it were a hardBreak, so every citation in the
// document silently disappeared from the exported .docx.
function inlineToRuns(content: any[] | undefined) {
  const runs: any[] = []
  ;(content || []).forEach(n => {
    if (n.type === 'text') {
      runs.push(new TextRun({ text: n.text || '', ...marksToRunOptions(n.marks) }))
    } else if (n.type === 'citation') {
      runs.push(new TextRun({ text: (n.attrs && n.attrs.display) || '' }))
    } else if (n.type === 'hardBreak') {
      runs.push(new TextRun({ text: '', break: 1 }))
    }
  })
  if (runs.length === 0) runs.push(new TextRun({ text: '' }))
  return runs
}

function dataUriToImageRun(src: string | undefined) {
  const match = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i.exec(src || '')
  if (!match) return null
  try {
    const buffer = Buffer.from(match[2], 'base64')
    // Audit item 6 fix (MEDIA-ALTA): images are embedded as base64 data
    // URIs directly in the document content, with nothing capping how big
    // one could be -- a single oversized image could blow up memory usage
    // or generation time for the whole export. An image this large would
    // never come from the editor's own upload flow, so skipping it (same
    // "silently omit" behaviour as an unparseable image, via the
    // `if (!run) return []` above) keeps the rest of the document
    // exporting normally instead of failing or timing out the whole request.
    if (buffer.length > MAX_IMAGE_BYTES) return null
    return new ImageRun({
      data: buffer,
      transformation: { width: 420, height: 280 },
      type: match[1].toLowerCase() === 'jpg' ? 'jpeg' : (match[1].toLowerCase() as any),
    })
  } catch (_e) {
    return null
  }
}

// Converts a single Tiptap block node into one or more docx elements.
// `ctx` carries the active numbering reference/level for nested lists.
function blockToDocx(node: any, ctx: any): any[] {
  if (!node) return []

  switch (node.type) {
    case 'paragraph': {
      if (!node.content || node.content.length === 0) {
        return [new Paragraph({ children: [new TextRun({ text: '' })] })]
      }
      return [new Paragraph({
        children: inlineToRuns(node.content),
        alignment: ctx.align,
        ...(ctx.numbering ? { numbering: ctx.numbering } : {}),
      })]
    }

    case 'heading': {
      const level = node.attrs && node.attrs.level
      return [new Paragraph({
        heading: HEADING_MAP[level] || HeadingLevel.HEADING_3,
        children: inlineToRuns(node.content),
      })]
    }

    case 'bulletList':
    case 'orderedList': {
      const reference = node.type === 'bulletList' ? 'graduate-bullet' : 'graduate-numbered'
      const level = (ctx.listLevel || 0)
      const out: any[] = []
      ;(node.content || []).forEach((li: any) => {
        ;(li.content || []).forEach((child: any) => {
          if (child.type === 'bulletList' || child.type === 'orderedList') {
            out.push(...blockToDocx(child, { ...ctx, listLevel: level + 1 }))
          } else {
            out.push(...blockToDocx(child, {
              ...ctx,
              numbering: { reference, level: Math.min(level, 2) },
            }))
          }
        })
      })
      return out
    }

    case 'listItem': {
      const out: any[] = []
      ;(node.content || []).forEach((child: any) => out.push(...blockToDocx(child, ctx)))
      return out
    }

    case 'blockquote': {
      // Blockquotes are simple in Tiptap's schema (a sequence of paragraphs),
      // so render each inner paragraph directly with indent + left border + italics
      // rather than reusing the generic paragraph path.
      // Audit 2.1: adds a citation branch here too (mirroring inlineToRuns
      // above) so a citation inside a blockquote renders instead of being
      // silently dropped as if it were a hardBreak; italics is kept applied
      // to text runs specifically, same as before this fix.
      return (node.content || []).map((child: any) => new Paragraph({
        indent: { left: 480 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'CB8698', space: 8 } },
        children: (child.content && child.content.length)
          ? child.content.map((n: any) => {
              if (n.type === 'text') return new TextRun({ text: n.text || '', italics: true, ...marksToRunOptions(n.marks) })
              if (n.type === 'citation') return new TextRun({ text: (n.attrs && n.attrs.display) || '', italics: true })
              return new TextRun({ text: '', break: 1 })
            })
          : [new TextRun({ text: '', italics: true })],
      }))
    }

    case 'horizontalRule': {
      return [new Paragraph({
        border: { bottom: { color: 'CB8698', space: 1, style: BorderStyle.SINGLE, size: 6 } },
        children: [new TextRun({ text: '' })],
      })]
    }

    case 'table': {
      const rows = (node.content || []).map((row: any) => {
        const cells = (row.content || []).map((cell: any) => {
          const cellParagraphs: any[] = []
          ;(cell.content || []).forEach((child: any) => cellParagraphs.push(...blockToDocx(child, ctx)))
          return new TableCell({
            children: cellParagraphs.length ? cellParagraphs : [new Paragraph({ children: [new TextRun({ text: '' })] })],
            shading: cell.type === 'tableHeader' ? { fill: 'F5DEE3' } : undefined,
          })
        })
        return new TableRow({ children: cells })
      })
      return [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })]
    }

    case 'image': {
      const run = dataUriToImageRun(node.attrs && node.attrs.src)
      if (!run) return []
      return [new Paragraph({ alignment: AlignmentType.CENTER, children: [run] })]
    }

    default:
      return []
  }
}

// Converts a full Tiptap document ({ type:'doc', content:[...] }) into an
// array of docx.js block elements ready to drop into a Document section.
export function tiptapToDocxElements(doc: any, opts: any = {}) {
  if (!doc || !Array.isArray(doc.content)) {
    return [new Paragraph({ children: [new TextRun({ text: 'Sin contenido.', italics: true, color: '999999' })] })]
  }
  const ctx = { align: ALIGN_MAP[opts.align] || AlignmentType.LEFT }
  const out: any[] = []
  doc.content.forEach((node: any) => out.push(...blockToDocx(node, ctx)))
  return out.length ? out : [new Paragraph({ children: [new TextRun({ text: '' })] })]
}

export const NUMBERING_CONFIG = {
  config: [
    {
      reference: 'graduate-bullet',
      levels: [0, 1, 2].map(level => ({
        level,
        format: 'bullet',
        text: '\u2022',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
      })),
    },
    {
      reference: 'graduate-numbered',
      levels: [0, 1, 2].map(level => ({
        level,
        format: 'decimal',
        text: `%${level + 1}.`,
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
      })),
    },
  ],
}


// =================================================================
// full document assembly
// =================================================================
// Audit ALTA fix -- the frontend's formatRef() functions run every field
// through escapeHtml() (lib/utils.ts) before building the small HTML
// snippet htmlRefToRuns() below parses, so this receives text like
// "Garc\u00eda &amp; L\u00f3pez" rather than the original "Garc\u00eda & L\u00f3pez". That's
// correct for HTML (the PDF export renders it directly as HTML, so the
// entity is exactly what a browser needs), but a .docx TextRun's `text` is
// literal document text, not HTML -- writing the escaped string put the
// literal characters "&amp;" into the Word document instead of "&". This
// reverses exactly the five entities escapeHtml() produces, in the same
// order, before any text reaches a TextRun.
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

// Parses the small subset of inline HTML used by the frontend's reference
// formatters (formatRefAPA/Vancouver/... in lib/utils.ts), which only ever
// emit plain text and <em>...</em> for italics.
function htmlRefToRuns(html: string) {
  const runs: any[] = []
  const re = /<em>(.*?)<\/em>|([^<]+)/g
  let m
  while ((m = re.exec(html || '')) !== null) {
    if (m[1] !== undefined) runs.push(new TextRun({ text: decodeHtmlEntities(m[1]), italics: true }))
    else if (m[2]) runs.push(new TextRun({ text: decodeHtmlEntities(m[2]) }))
  }
  if (runs.length === 0) runs.push(new TextRun({ text: decodeHtmlEntities(html || '') }))
  return runs
}

function buildStyles(cfg: any) {
  return {
    default: {
      document: {
        run: { font: cfg.font, size: cfg.fontHalfPt },
        paragraph: {
          spacing: { line: Math.round(240 * cfg.lineMultiplier), lineRule: 'auto' },
          alignment: cfg.align === 'JUSTIFIED' ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
        },
      },
      heading1: {
        run: { font: 'Georgia', size: 36, bold: true, color: '20040D' },
        paragraph: { spacing: { before: 360, after: 200 }, alignment: AlignmentType.LEFT },
      },
      heading2: {
        run: { font: 'Georgia', size: 30, bold: true, color: '450A1B' },
        paragraph: { spacing: { before: 300, after: 160 } },
      },
      heading3: {
        run: { font: 'Georgia', size: 26, bold: true, color: '5A0F24' },
        paragraph: { spacing: { before: 240, after: 120 } },
      },
    },
    // Audit P1 5.3 fix (files2 27/08/2026, GRAVE): preliminary section
    // titles (Aprobacion del jurado, Dedicatoria y agradecimientos,
    // Resumen / Abstract, Palabras clave / Keywords...) used to use
    // `heading: HeadingLevel.HEADING_1` just like real chapter titles.
    // tocSection()'s TableOfContents field has headingStyleRange:'1-3',
    // so those preliminary titles were being picked up and listed INSIDE
    // "Indice general" right alongside the actual thesis chapters --
    // academically wrong, an index should be governed by the norma/
    // institution's structure, not simply "every Heading 1 in the file".
    // PreliminaryTitle looks IDENTICAL to Heading 1 (same font/size/
    // color/spacing) but Word's TOC field only walks the built-in
    // heading styles, so text using a custom style name is invisible to
    // it -- the preliminary title still displays exactly like a heading,
    // it just doesn't get listed inside the general index anymore.
    paragraphStyles: [
      {
        id: 'PreliminaryTitle',
        name: 'Preliminary Title',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Georgia', size: 36, bold: true, color: '20040D' },
        paragraph: { spacing: { before: 360, after: 200 }, alignment: AlignmentType.LEFT },
      },
    ],
  }
}

// Audit P0 4.1 fix (files2 27/08/2026, CRITICO -- doble portada): mirrors
// hasRealTiptapContent() in frontend/src/lib/utils.ts. Deliberately a tiny,
// self-contained predicate (not a config table like NORMAS) so keeping two
// copies carries little of the drift risk that caused earlier audit
// findings -- there's no field list to fall out of sync, just "does this
// document have any real text/image/table".
function hasRealContent(doc: any): boolean {
  if (!doc || !Array.isArray(doc.content)) return false
  let found = false
  const walk = (n: any) => {
    if (found) return
    if (n.type === 'text' && (n.text ?? '').trim().length > 0) { found = true; return }
    if (n.type === 'image' || n.type === 'table') { found = true; return }
    ;(n.content || []).forEach(walk)
  }
  doc.content.forEach(walk)
  return found
}

function coverSection(project: any, normaCfg: any) {
  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: { pageNumbers: { formatType: NumberFormat.DECIMAL } },
    },
    children: [
      new Paragraph({ spacing: { before: 2000 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `TESIS DE GRADO \u00b7 ${normaCfg.label}`, size: 18, color: '7D1A31', bold: true })] }),
      new Paragraph({ spacing: { before: 300 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: project.title || 'Sin titulo', size: 44, bold: true, font: 'Georgia' })] }),
      ...(project.author ? [new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: project.author, size: 22 })] })] : []),
      ...(project.institution ? [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: project.institution, size: 20, color: '888888' })] })] : []),
      new Paragraph({ spacing: { before: 800 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `Graduate Pro \u00b7 RonnDu Corp. \u00b7 ${project.year || new Date().getFullYear()}`, size: 18, color: 'AAAAAA' })] }),
    ],
  }
}

// Audit P0 4.1 fix (files2 27/08/2026, CRITICO -- doble portada): the
// exporter used to ALWAYS use coverSection() (generated from project
// metadata) AND ALSO render the user-editable 'Portada oficial' /
// 'Portada, aprobacion, dedicatoria' section as an ordinary roman
// preliminary page -- two cover pages. Per the audit's recommended
// Option A, when that section has real content (see hasRealContent
// above), IT becomes the actual cover -- same invisible-page-number
// section properties as coverSection(), just filled with the user's real
// content instead of a fixed template. See buildDocx() for the fallback
// (still coverSection()) when it's empty, and for how this section is
// excluded from the normal preliminary-pages loop either way.
function coverSectionFromContent(content: any, normaCfg: any) {
  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: { pageNumbers: { formatType: NumberFormat.DECIMAL } },
    },
    children: tiptapToDocxElements(content, { align: normaCfg.align.toLowerCase() }),
  }
}

function romanFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT] })],
    })],
  })
}

function tocSection() {
  return {
    properties: { type: SectionType.NEXT_PAGE, page: { pageNumbers: { formatType: NumberFormat.LOWER_ROMAN, start: 1 } } },
    headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: 'Indice general', size: 16, color: '999999' })] })] }) },
    footers: { default: romanFooter() },
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Indice general' })] }),
      new TableOfContents('Indice general', {
        hyperlink: true,
        headingStyleRange: '1-3',
      }),
    ],
  }
}

function arabicFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT] })],
    })],
  })
}

function sectionHeader(project: any) {
  return new Header({
    children: [new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E9BAC5', space: 4 } },
      children: [
        new TextRun({ text: project.title || '', size: 16, color: '999999' }),
      ],
    })],
  })
}

// Builds the full docx.js Document. `payload` shape:
// {
//   project: { title, author, institution, year, norma },
//   sections: [ { name, isAutoIndex, isRoman, isPortada,
//                 captionIndex: {tableLabel, items:[{kind,number,pageLabel}]} | null,
//                 content: TiptapDoc|null } ],
//   referencesHtml: [ string ]   // already formatted via the frontend's formatRef()
// }
//
// Audit P0 4.1 fix (CRITICO, sexto pase): previously every section in
// payload.sections -- preliminary AND body alike -- was pushed into the
// single arabic-numbered bodySection, with only the auto-index items
// (Indice general/tablas/figuras) skipped (a real Word TOC field already
// covers 'Indice general'). That meant preliminary sections that academic
// norms require to be roman-numbered were rendered as ordinary
// arabic-numbered pages mixed into the thesis body. Fixed by splitting
// into two real Word Sections using isRoman.
//
// Audit P0 4.1 fix (files2 27/08/2026, CRITICO -- doble portada): fixing
// the above surfaced a second bug -- the exporter ALSO always generated
// its own cover page from project metadata (coverSection below), so once
// 'Portada oficial' correctly became a roman preliminary page, the
// document had two cover pages: the automatic one and the user-editable
// one. Per the audit's Option A, whichever section has isPortada:true
// becomes the actual cover when it has real content (hasRealContent
// above); the metadata cover is only a fallback for an empty project, and
// either way this section never ALSO appears in the ordinary preliminary
// pages loop below.
//
// Audit P0 4.2 fix (files2 27/08/2026, CRITICO -- indices especificos):
// 'Indice de tablas'/'Indice de figuras'/'Indice de tablas y figuras'/
// 'Indice de cuadros comparativos' used to be silently dropped (isAutoIndex
// caused them to be skipped entirely, with no field connecting to real
// tables/figures -- there's no captions/numbering subsystem in the editor
// yet, see CAMBIOS.md pendientes). Each of those sections now carries a
// pre-computed captionIndex (built once in ExportPanel.tsx, shared with
// the PDF export so the two can't disagree) listing the REAL tables/
// images found in the document, in order, with the estimated page label
// of the section they're in -- rendered as a simple list instead of
// either the wrong general index or nothing at all.
export function buildDocx(payload: any) {
  const project = payload.project || {}
  const normaCfg = resolveNorma(project.norma)

  const allSections: any[] = payload.sections || []
  // isRoman/isPortada/captionIndex may be absent on a payload from a
  // not-yet-updated frontend build -- treated the same as
  // false/false/null (old behavior) rather than throwing, so this stays
  // backwards compatible instead of breaking export outright.
  const portadaSec = allSections.find(sec => sec.isPortada)
  const coverSec = (portadaSec && hasRealContent(portadaSec.content))
    ? coverSectionFromContent(portadaSec.content, normaCfg)
    : coverSection(project, normaCfg)

  // 'Indice general' is isAutoIndex with captionIndex:null (it uses the
  // real TableOfContents field in tocSection(), not a captioned list) --
  // that's the ONE isAutoIndex section still excluded from preliminary
  // rendering entirely. Every other roman section (including the
  // tablas/figuras/cuadros indices, which now DO render via captionIndex)
  // is included, except the portada (handled above as the cover).
  const preliminarySections = allSections.filter(sec =>
    sec.isRoman && !sec.isPortada && !(sec.isAutoIndex && !sec.captionIndex))
  const bodySections = allSections.filter(sec => !sec.isRoman)

  const renderCaptionIndex = (spec: { tableLabel: string, items: { kind: string, number: number, pageLabel: string }[] }) => {
    if (!spec.items || spec.items.length === 0) {
      return [new Paragraph({ children: [new TextRun({ text: 'No se encontraron elementos en el documento.', italics: true, color: '999999' })] })]
    }
    return spec.items.map(it => new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: `${it.kind === 'table' ? spec.tableLabel : 'Figura'} ${it.number}` }),
        new TextRun({ text: `   \u2014   ${it.pageLabel || ''}`, color: '7D1A31', bold: true }),
      ],
    }))
  }

  const preliminaryChildren: any[] = []
  preliminarySections.forEach(sec => {
    // Audit P1 5.3 fix: 'PreliminaryTitle' (see buildStyles above) instead
    // of `heading: HeadingLevel.HEADING_1` -- looks identical, but keeps
    // this title out of the general index's heading-based TOC field.
    preliminaryChildren.push(new Paragraph({
      style: 'PreliminaryTitle',
      pageBreakBefore: true,
      children: [new TextRun({ text: sec.name || '' })],
    }))
    preliminaryChildren.push(...(sec.captionIndex ? renderCaptionIndex(sec.captionIndex) : tiptapToDocxElements(sec.content, { align: normaCfg.align.toLowerCase() })))
  })

  const bodyChildren: any[] = []
  bodySections.forEach((sec: any) => {
    if (sec.isAutoIndex) return // defensive: auto-index items are always isRoman, so this should never fire
    bodyChildren.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: sec.name || '' })] }))
    bodyChildren.push(...tiptapToDocxElements(sec.content, { align: normaCfg.align.toLowerCase() }))
  })

  if (Array.isArray(payload.referencesHtml) && payload.referencesHtml.length > 0) {
    bodyChildren.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Referencias bibliograficas' })], pageBreakBefore: true }))
    payload.referencesHtml.forEach((html: string) => {
      bodyChildren.push(new Paragraph({
        indent: { left: 480, hanging: 480 },
        spacing: { after: 160 },
        children: htmlRefToRuns(html),
      }))
    })
  }

  // Same physical Word Section as tocSection() (same roman page-number
  // scheme, no extra section break needed) -- the real TOC field comes
  // first, then each preliminary section's actual content, each starting
  // on its own page.
  const preliminarySectionDoc = tocSection()
  preliminarySectionDoc.children.push(...preliminaryChildren)

  const bodySection = {
    properties: { type: SectionType.NEXT_PAGE, page: { pageNumbers: { formatType: NumberFormat.DECIMAL, start: 1 } } },
    headers: { default: sectionHeader(project) },
    footers: { default: arabicFooter() },
    children: bodyChildren,
  }

  const doc = new Document({
    creator: 'Graduate Pro',
    title: project.title || 'Tesis',
    numbering: NUMBERING_CONFIG,
    styles: buildStyles(normaCfg),
    sections: [
      coverSec,
      preliminarySectionDoc,
      bodySection,
    ],
  })

  return doc
}


// =================================================================
// HTTP handler
// =================================================================
// Supabase Edge Function -- POST /functions/v1/generate-docx
//
// Replaces the old PocketBase-hook + Node-sidecar architecture entirely.
// Deno's npm: specifier lets us import the real `docx` npm package directly
// here, so there's no need to proxy to a separate service or relay bytes
// through base64 -- the Response can just return the raw file bytes.
//
// withSupabase({ auth: 'user' }) verifies the caller's JWT before our
// handler even runs, and hands us ctx.supabase already scoped to that
// user's RLS -- so the ownership check below simply returns no rows if
// the project doesn't belong to them. CORS (incl. preflight) is handled
// by withSupabase too.

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Metodo no permitido.' }, { status: 405 })
    }

    // Audit item 6 fix: reject an oversized body before even reading it,
    // using the Content-Length header the client sent -- cheaper than
    // buffering the whole thing into memory first just to find out it's
    // too big.
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > MAX_REQUEST_BYTES) {
      return Response.json(
        { error: `El documento a exportar es demasiado grande (limite ${Math.round(MAX_REQUEST_BYTES / 1024 / 1024)}MB).` },
        { status: 413 },
      )
    }

    let payload: any
    try {
      payload = await req.json()
    } catch (_e) {
      return Response.json({ error: 'Cuerpo de la peticion invalido.' }, { status: 400 })
    }

    const projectId = payload?.project?.id
    if (!projectId) {
      return Response.json({ error: 'Falta el id del proyecto.' }, { status: 400 })
    }

    // Audit item 6 fix: same reasoning as the Content-Length check above,
    // applied to the section count specifically (a request could stay
    // under the raw byte cap while still listing an absurd number of tiny
    // sections).
    if (Array.isArray(payload?.sections) && payload.sections.length > MAX_SECTIONS) {
      return Response.json(
        { error: `Demasiadas secciones para exportar (limite ${MAX_SECTIONS}).` },
        { status: 413 },
      )
    }

    try {
      const { data: project, error } = await ctx.supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .maybeSingle()

      if (error || !project) {
        return Response.json({ error: 'No autorizado para exportar este proyecto.' }, { status: 403 })
      }

      const doc = buildDocx(payload)
      const buffer = await Packer.toBuffer(doc)

      const safeTitle = String(payload?.project?.title || 'tesis')
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .trim() || 'tesis'

      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${safeTitle}.docx"`,
        },
      })
    } catch (err) {
      console.error('generate-docx error:', err)
      return Response.json({ error: 'No se pudo generar el documento.' }, { status: 500 })
    }
  }),
}
