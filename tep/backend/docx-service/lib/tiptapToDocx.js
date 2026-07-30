const {
  Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  HeadingLevel, AlignmentType, BorderStyle, ImageRun,
} = require('docx')

const HEADING_MAP = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
}

const ALIGN_MAP = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
}

function marksToRunOptions(marks) {
  const opts = {}
  ;(marks || []).forEach(m => {
    if (m.type === 'bold') opts.bold = true
    if (m.type === 'italic') opts.italics = true
    if (m.type === 'underline') opts.underline = {}
  })
  return opts
}

// Flattens a paragraph-like node's inline content (text + hardBreak) into TextRuns
function inlineToRuns(content) {
  const runs = []
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

function dataUriToImageRun(src) {
  const match = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i.exec(src || '')
  if (!match) return null
  try {
    const buffer = Buffer.from(match[2], 'base64')
    return new ImageRun({
      data: buffer,
      transformation: { width: 420, height: 280 },
      type: match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase(),
    })
  } catch (_e) {
    return null
  }
}

// Converts a single Tiptap block node into one or more docx elements.
// `ctx` carries the active numbering reference/level for nested lists.
function blockToDocx(node, ctx) {
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
      const out = []
      ;(node.content || []).forEach(li => {
        (li.content || []).forEach(child => {
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
      const out = []
      ;(node.content || []).forEach(child => out.push(...blockToDocx(child, ctx)))
      return out
    }

    case 'blockquote': {
      // Blockquotes are simple in Tiptap's schema (a sequence of paragraphs),
      // so render each inner paragraph directly with indent + left border + italics
      // rather than reusing the generic paragraph path.
      return (node.content || []).map(child => new Paragraph({
        indent: { left: 480 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'CB8698', space: 8 } },
        children: (child.content && child.content.length)
          ? child.content.map(n => n.type === 'text'
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
      const rows = (node.content || []).map(row => {
        const cells = (row.content || []).map(cell => {
          const cellParagraphs = []
          ;(cell.content || []).forEach(child => cellParagraphs.push(...blockToDocx(child, ctx)))
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
function tiptapToDocxElements(doc, opts = {}) {
  if (!doc || !Array.isArray(doc.content)) {
    return [new Paragraph({ children: [new TextRun({ text: 'Sin contenido.', italics: true, color: '999999' })] })]
  }
  const ctx = { align: ALIGN_MAP[opts.align] || AlignmentType.LEFT }
  const out = []
  doc.content.forEach(node => out.push(...blockToDocx(node, ctx)))
  return out.length ? out : [new Paragraph({ children: [new TextRun({ text: '' })] })]
}

const NUMBERING_CONFIG = {
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

module.exports = { tiptapToDocxElements, NUMBERING_CONFIG }
