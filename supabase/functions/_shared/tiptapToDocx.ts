// deno-lint-ignore-file no-explicit-any
import {
  Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  HeadingLevel, AlignmentType, BorderStyle, ImageRun,
} from 'npm:docx@9.7.1'
import { Buffer } from 'node:buffer'

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
