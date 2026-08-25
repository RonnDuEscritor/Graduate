import { useCallback } from 'react'
import { useStore } from '@/store'
import { extractTextFromTiptap } from '@/lib/utils'
import { NORMAS } from '@/types'
import type { RevisionIssue, TiptapNode } from '@/types'

export function useRevision() {
  const { sections, references, citations, norma, setRevisionIssues } = useStore()

  const runRevision = useCallback((): RevisionIssue[] => {
    const issues: RevisionIssue[] = []
    let issueId = 0
    const id = () => String(++issueId)

    sections.forEach(sec => {
      const doc = sec.content as TiptapNode | null
      const text = extractTextFromTiptap(doc)
      const words = text ? text.split(/\s+/).filter(Boolean).length : 0

      // ── Section empty ──────────────────────────────────────
      if (!sec.content || words === 0) {
        issues.push({
          id: id(), sectionId: sec.id, sectionName: sec.name,
          level: 'warning', code: 'EMPTY_SECTION',
          message: `Sección vacía: "${sec.name}"`,
        })
        return
      }

      // ── Body sections too short ────────────────────────────
      if (!sec.is_roman && words < 30) {
        issues.push({
          id: id(), sectionId: sec.id, sectionName: sec.name,
          level: 'warning', code: 'SECTION_TOO_SHORT',
          message: `"${sec.name}" muy corta (${words} palabras — mínimo recomendado: 30)`,
        })
      }

      // ── Check for paragraphs > 300 words ──────────────────
      if (doc) {
        const checkNode = (node: TiptapNode) => {
          if (node.type === 'paragraph') {
            const pText = extractTextFromTiptap(node)
            const pw = pText.split(/\s+/).filter(Boolean).length
            if (pw > 300) {
              issues.push({
                id: id(), sectionId: sec.id, sectionName: sec.name,
                level: 'warning', code: 'PARAGRAPH_TOO_LONG',
                message: `Párrafo muy largo en "${sec.name}" (${pw} palabras). Considera dividirlo.`,
              })
            }
          }
          node.content?.forEach(checkNode)
        }
        checkNode(doc as TiptapNode)
      }

      // ── Tables without source note ─────────────────────────
      if (doc) {
        let tableCount = 0
        const checkTables = (node: TiptapNode, parent?: TiptapNode) => {
          if (node.type === 'table') {
            tableCount++
            // Check if next sibling paragraph contains "Nota."
            const siblings = parent?.content ?? []
            const idx = siblings.indexOf(node)
            const next = siblings[idx + 1]
            const nextText = next ? extractTextFromTiptap(next) : ''
            // Audit P1 items 4 and 5 fix: this used to be level:'error'
            // and phrased as a flat statement of fact ("no tiene nota de
            // fuente"), but the check itself is a heuristic -- it only
            // looks for the word "nota" in the very next paragraph after
            // the table, so a source note phrased differently, placed as
            // a table caption, or a few paragraphs down would trigger a
            // false positive; and a paragraph that happens to contain
            // "nota" for an unrelated reason would produce a false
            // negative. A heuristic like this should never be presented as
            // a definitive academic error, only as something worth double
            // checking -- hence 'warning', not 'error', and message
            // wording that says so explicitly.
            if (!nextText.toLowerCase().includes('nota')) {
              issues.push({
                id: id(), sectionId: sec.id, sectionName: sec.name,
                level: 'warning', code: 'TABLE_NO_SOURCE',
                message: `Revisa la Tabla ${tableCount} en "${sec.name}": no se detecto una nota de fuente (Nota. ...) justo despues. Puede ser un falso positivo si la nota esta en otro lugar o redactada de otra forma.`,
              })
            }
          }
          node.content?.forEach(n => checkTables(n, node))
        }
        checkTables(doc as TiptapNode)
      }

      // ── Headings: H1 in non-preliminary sections ───────────
      if (!sec.is_roman && doc) {
        let h1Count = 0
        const countH1 = (node: TiptapNode) => {
          if (node.type === 'heading' && node.attrs?.level === 1) h1Count++
          node.content?.forEach(countH1)
        }
        countH1(doc as TiptapNode)
        if (h1Count > 0) {
          issues.push({
            id: id(), sectionId: sec.id, sectionName: sec.name,
            level: 'info', code: 'H1_IN_BODY',
            message: `"${sec.name}" usa Título 1 (H1). En tesis académicas el H1 es el título del capítulo — considera H2/H3 para subsecciones.`,
          })
        }
      }
    })

    // ── References: cited but not registered ───────────────
    const registeredIds = new Set(references.map(r => r.id))
    const citedIds = new Set(citations.map(c => c.reference))

    citedIds.forEach(refId => {
      if (!registeredIds.has(refId)) {
        issues.push({
          id: id(), level: 'error', code: 'CITATION_NO_REF',
          message: `Hay una cita en el texto cuya referencia no está registrada en la biblioteca (id: ${refId.slice(0,8)})`,
        })
      }
    })

    // ── References: registered but never cited ─────────────
    references.forEach(ref => {
      if (!citedIds.has(ref.id)) {
        issues.push({
          id: id(), level: 'info', code: 'REF_NOT_CITED',
          message: `Referencia no citada en el texto: ${ref.author} (${ref.year}) — "${ref.title.slice(0,40)}..."`,
        })
      }
    })

    // ── Duplicate references ───────────────────────────────
    // Audit P1 item 7 fix: the key used to be just author+year, so two
    // genuinely different sources by the same author in the same year
    // (a common, normal thing -- e.g. two 2023 papers by the same
    // researcher) were flagged as duplicates. Folding a normalized title
    // into the key makes it require the same author, year AND title
    // before warning, which is what "duplicate reference" should actually
    // mean. Still a heuristic (a retyped title with different punctuation
    // won't match), so this stays a 'warning', never a hard error.
    const seen = new Map<string, string>()
    references.forEach(ref => {
      const k = `${ref.author.toLowerCase()}${ref.year}${ref.title.toLowerCase().trim().replace(/\s+/g, ' ')}`
      if (seen.has(k)) {
        issues.push({
          id: id(), level: 'warning', code: 'DUPLICATE_REF',
          message: `Posible referencia duplicada: ${ref.author} (${ref.year}) aparece más de una vez.`,
        })
      }
      seen.set(k, ref.id)
    })

    // ── Numbered-citation styles (Vancouver, IEEE) ─────────
    // Audit P0 4.4: generalized from a Vancouver-only check now that IEEE
    // is also a numbered style (see NORMAS[norma].citationFormat).
    if (NORMAS[norma].citationFormat === 'numbered') {
      issues.push({
        id: id(), level: 'info', code: 'VANCOUVER_REMINDER',
        message: `${NORMAS[norma].label} activo: las citas [N] se numeran por orden de primera aparicion en el documento.`,
      })
    }

    // ── No sections with content at all ───────────────────
    const filledSections = sections.filter(s => s.word_count > 0)
    if (filledSections.length === 0) {
      issues.push({
        id: id(), level: 'info', code: 'NO_CONTENT',
        message: 'El documento está vacío. Comienza escribiendo en cualquier sección.',
      })
    }

    setRevisionIssues(issues)
    return issues
  }, [sections, references, citations, norma, setRevisionIssues])

  return { runRevision }
}
