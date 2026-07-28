import { Mark, mergeAttributes } from '@tiptap/core'

export interface GrammarErrorOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    grammarError: {
      /** Remove every grammarError mark from the whole document */
      clearGrammarErrors: () => ReturnType
    }
  }
}

// Native Tiptap Mark (not a raw ProseMirror plugin/decoration) used to underline
// LanguageTool matches directly inside the document. Marks are applied and removed
// via direct transactions (see src/lib/grammarPosition.ts) so they never touch
// ProseMirror's plugin system.
export const GrammarErrorMark = Mark.create<GrammarErrorOptions>({
  name: 'grammarError',

  // Errors are ephemeral/derived data - never persisted through copy/paste
  excludes: '',
  inclusive: false,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      category: {
        default: 'GRAMMAR',
        parseHTML: el => el.getAttribute('data-grammar-category'),
        renderHTML: attrs => ({ 'data-grammar-category': attrs.category }),
      },
      message: {
        default: '',
        parseHTML: el => el.getAttribute('title') || '',
        renderHTML: attrs => ({ title: attrs.message }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-grammar-category]' }]
  },

  renderHTML({ HTMLAttributes, mark }) {
    const category = String(mark.attrs.category || 'GRAMMAR')
    const underlineClass = {
      TYPOS: 'lt-spelling',
      GRAMMAR: 'lt-grammar',
      STYLE: 'lt-style',
      PUNCTUATION: 'lt-punctuation',
    }[category] || 'lt-grammar'

    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: underlineClass,
      }),
      0,
    ]
  },

  addCommands() {
    return {
      clearGrammarErrors: () => ({ tr, dispatch }) => {
        const markType = this.type
        if (dispatch) {
          tr.removeMark(0, tr.doc.content.size, markType)
          tr.setMeta('grammarMark', true)
          tr.setMeta('addToHistory', false)
        }
        return true
      },
    }
  },
})

export default GrammarErrorMark
