// deno-lint-ignore-file no-explicit-any
import {
  Document, Paragraph, TextRun, TableOfContents, PageNumber,
  Header, Footer, AlignmentType, HeadingLevel, NumberFormat, SectionType,
  BorderStyle,
} from 'npm:docx@9.7.1'
import { resolveNorma } from './normas.ts'
import { tiptapToDocxElements, NUMBERING_CONFIG } from './tiptapToDocx.ts'

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
