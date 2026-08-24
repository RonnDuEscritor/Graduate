import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { LTMatch } from '@/hooks/useLanguageTool'
import { getCategoryKey } from '@/lib/grammarCategory'

// Must match the separator used when extracting text for LanguageTool
// (see SectionEditor.tsx -> editor.getText()).
const BLOCK_SEPARATOR = '\n\n'

interface OffsetMap {
  text: string
  // offsetToPos[i] = ProseMirror position of the character at plain-text index i
  offsetToPos: number[]
}

/**
 * Walks the document the same way ProseMirror's Node.textBetween() does
 * (which is what Tiptap's editor.getText() calls under the hood) while
 * recording, for every character in the resulting plain text, the matching
 * ProseMirror position. This lets us translate LanguageTool's offset/length
 * (computed against that plain text) back into real editor positions so we
 * can apply marks.
 *
 * Audit 5.1 fix (GRAVE): the previous version inserted a BLOCK_SEPARATOR
 * before *every* block-type node except the very first one. Because
 * doc.descendants() visits wrapper nodes too (a single paragraph inside a
 * list item inside a bullet list is 3 nested block nodes), that inserted
 * several separators in a row for structures like lists and tables --
 * something the real textBetween()/getText() never does. The drift
 * accumulated with every list/table in the section, so LanguageTool offsets
 * increasingly pointed at the wrong word the further into the document a
 * match was. The fix mirrors ProseMirror's actual algorithm: a separator is
 * only emitted right before the first block boundary encountered *after*
 * some text was written (tracked via `separated`), matching exactly how
 * many separator characters getText() itself produces.
 */
function buildOffsetMap(doc: PMNode): OffsetMap {
  let text = ''
  const offsetToPos: number[] = []
  let separated = true // mirrors ProseMirror's initial `separated = true`

  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (node.isText) {
      const nodeText = node.text || ''
      for (let i = 0; i < nodeText.length; i++) {
        offsetToPos.push(pos + i)
      }
      text += nodeText
      separated = false
      return
    }
    if (!separated && node.isBlock) {
      for (let i = 0; i < BLOCK_SEPARATOR.length; i++) {
        offsetToPos.push(pos)
      }
      text += BLOCK_SEPARATOR
      separated = true
    }
  })

  return { text, offsetToPos }
}

/**
 * Applies grammarError marks for the given LanguageTool matches, replacing
 * any previous marks. Dispatched as a single direct transaction (not through
 * editor.commands) so it doesn't fight with the user's current selection or
 * re-trigger onUpdate side effects (see the 'grammarMark' meta flag, checked
 * in SectionEditor's onUpdate).
 */
export function applyGrammarMarks(editor: Editor, matches: LTMatch[]) {
  const { state, view } = editor
  const markType = state.schema.marks.grammarError
  if (!markType) return

  const { doc } = state
  let tr = state.tr
  tr = tr.removeMark(0, doc.content.size, markType)

  if (matches.length > 0) {
    const { offsetToPos } = buildOffsetMap(doc)

    for (const match of matches) {
      const fromIdx = match.offset
      const toIdx   = match.offset + match.length - 1
      const from = offsetToPos[fromIdx]
      const to   = offsetToPos[toIdx]
      if (from === undefined || to === undefined) continue
      if (from >= to + 1) continue

      const category = getCategoryKey(match)
      try {
        tr = tr.addMark(from, to + 1, markType.create({
          category,
          message: match.shortMessage || match.message || '',
        }))
      } catch {
        // Skip matches whose range no longer fits the current doc
      }
    }
  }

  tr.setMeta('grammarMark', true)
  tr.setMeta('addToHistory', false)
  view.dispatch(tr)
}

export function clearGrammarMarks(editor: Editor) {
  applyGrammarMarks(editor, [])
}

/**
 * Replaces the exact range covered by a single LanguageTool match with the
 * chosen replacement, preserving the rest of the document's structure
 * (headings, lists, other paragraphs) - unlike naively rebuilding the whole
 * editor content from plain text.
 */
export function applyGrammarFix(editor: Editor, match: LTMatch, replacement: string) {
  const { doc } = editor.state
  const { offsetToPos } = buildOffsetMap(doc)

  const fromIdx = match.offset
  const toIdx   = match.offset + match.length - 1
  const from = offsetToPos[fromIdx]
  const to   = offsetToPos[toIdx]
  if (from === undefined || to === undefined) return

  editor.chain().focus().insertContentAt({ from, to: to + 1 }, replacement).run()
}

/**
 * Removes grammarError marks from a Tiptap JSON document before it's
 * persisted, so the ephemeral underline data never ends up saved in
 * the backend.
 */
export function stripGrammarMarksFromJSON<T>(json: T): T {
  const node = json as unknown as { marks?: Array<{ type: string }>, content?: unknown[] }
  if (Array.isArray(node?.marks)) {
    node.marks = node.marks.filter(m => m.type !== 'grammarError')
  }
  if (Array.isArray(node?.content)) {
    node.content = node.content.map(child => stripGrammarMarksFromJSON(child))
  }
  return json
}
