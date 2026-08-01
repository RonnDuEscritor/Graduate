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
import { createClient } from 'npm:@supabase/supabase-js@2'
import { Buffer } from 'node:buffer'

// =================================================================
// norma (academic style) config
// =================================================================
// Mirrors frontend/src/types/index.ts NORMAS, but resolved into the units
// docx.js expects (half-points for font size, line-spacing multiplier etc).
// Kept intentionally separate from the frontend copy -- this file only
// controls low-level OOXML rendering, never academic/business rules
// (those stay in the frontend, the single source of truth).

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
}

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

// Flattens a paragraph-like node's inline content (text + hardBreak) into TextRuns
function inlineToRuns(content: any[] | undefined) {
  const runs: any[] = []
  ;(content || []).forEach(n => {
    if (n.type === 'text') {
      runs.push(new TextRun({ text: n.text || '', ...marksToRunOptions(n.marks) }))
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
      return (node.content || []).map((child: any) => new Paragraph({
        indent: { left: 480 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'CB8698', space: 8 } },
        children: (child.content && child.content.length)
          ? child.content.map((n: any) => n.type === 'text'
              ? new TextRun({ text: n.text || '', italics: true, ...marksToRunOptions(n.marks) })
              : new TextRun({ text: '', break: 1 }))
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
// Parses the small subset of inline HTML used by the frontend's reference
// formatters (formatRefAPA/Vancouver/... in lib/utils.ts), which only ever
// emit plain text and <em>...</em> for italics.
function htmlRefToRuns(html: string) {
  const runs: any[] = []
  const re = /<em>(.*?)<\/em>|([^<]+)/g
  let m
  while ((m = re.exec(html || '')) !== null) {
    if (m[1] !== undefined) runs.push(new TextRun({ text: m[1], italics: true }))
    else if (m[2]) runs.push(new TextRun({ text: m[2] }))
  }
  if (runs.length === 0) runs.push(new TextRun({ text: html || '' }))
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
  }
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
//   sections: [ { name, isAutoIndex, content: TiptapDoc|null } ],
//   referencesHtml: [ string ]   // already formatted via the frontend's formatRef()
// }
export function buildDocx(payload: any) {
  const project = payload.project || {}
  const normaCfg = resolveNorma(project.norma)

  const bodyChildren: any[] = []
  ;(payload.sections || []).forEach((sec: any) => {
    if (sec.isAutoIndex) return // covered by the real TOC field section, not duplicated here
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
      coverSection(project, normaCfg),
      tocSection(),
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
// Auth: Supabase verifies the caller's JWT before this code even runs
// (default verify_jwt=true for edge functions). We additionally re-check,
// scoped to the caller's own token, that the requested project actually
// belongs to them -- RLS on the `projects` table means the query below
// simply returns no rows if it doesn't.


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonError('Metodo no permitido.', 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonError('Debes iniciar sesion para exportar.', 401)
  }

  let payload: any
  try {
    payload = await req.json()
  } catch (_e) {
    return jsonError('Cuerpo de la peticion invalido.', 400)
  }

  const projectId = payload?.project?.id
  if (!projectId) {
    return jsonError('Falta el id del proyecto.', 400)
  }

  try {
    // Scoped to the caller's own JWT -- RLS enforces ownership for us.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: project, error } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle()

    if (error || !project) {
      return jsonError('No autorizado para exportar este proyecto.', 403)
    }

    const doc = buildDocx(payload)
    const buffer = await Packer.toBuffer(doc)

    const safeTitle = String(payload?.project?.title || 'tesis')
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .trim() || 'tesis'

    return new Response(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeTitle}.docx"`,
      },
    })
  } catch (err) {
    console.error('generate-docx error:', err)
    return jsonError('No se pudo generar el documento.', 500)
  }
})
