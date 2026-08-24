import { Node, mergeAttributes } from '@tiptap/core'

// Audit 2.1 fix (GRAVE): citations used to be inserted as plain HTML
// (`<span class="cite-chip">...</span>`) with no real link back to the
// bibliography. That gave the app two separate sources of truth -- the
// `citations` database row, and whatever text happened to still be sitting
// in the document -- and they could drift apart: deleting the chip by hand
// left the database row (and therefore the bibliography entry and Vancouver
// numbering) untouched, since nothing told the database anything had
// changed.
//
// This Node makes a citation a real, atomic, structured part of the
// document (referenceId + page + display + citationStyle), so the document
// itself can be scanned to find out which references are actually cited,
// in what order, right now -- see extractCitationRefs() in lib/utils.ts and
// syncSectionCitations() in store/index.ts, which reconcile the database
// against exactly that scan on every save. Delete the chip, and the next
// save removes the database row with it. No separate migration script is
// needed for documents that already contain the old plain-HTML chips: this
// node's parseHTML rule below recognizes that old markup and upgrades it
// the next time the section is opened in the editor.
export interface CitationAttrs {
  referenceId:   string
  page:          string | null
  display:       string
  citationStyle: string | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    citation: {
      insertCitation: (attrs: CitationAttrs) => ReturnType
    }
  }
}

export const CitationNode = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      referenceId: {
        default: null,
        parseHTML: el => el.getAttribute('data-ref-id'),
        renderHTML: attrs => ({ 'data-ref-id': attrs.referenceId }),
      },
      page: {
        default: null,
        parseHTML: el => el.getAttribute('data-page') || null,
        renderHTML: attrs => attrs.page ? { 'data-page': attrs.page } : {},
      },
      display: {
        default: '',
        parseHTML: el => el.textContent || '',
        renderHTML: () => ({}),
      },
      citationStyle: {
        default: null,
        parseHTML: el => el.getAttribute('data-style') || null,
        renderHTML: attrs => attrs.citationStyle ? { 'data-style': attrs.citationStyle } : {},
      },
    }
  },

  parseHTML() {
    return [
      // Only matches chips carrying a real reference id -- older documents
      // saved before Audit 9.1 (data-ref-id existed but wasn't a schema
      // node yet) already had this attribute in the HTML the app itself
      // generated, so this rule doubles as the migration path for them.
      { tag: 'span.cite-chip[data-ref-id]' },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['span', mergeAttributes({ class: 'cite-chip' }, HTMLAttributes), node.attrs.display]
  },

  addCommands() {
    return {
      insertCitation: (attrs: CitationAttrs) => ({ chain }) => {
        return chain()
          .insertContent({ type: this.name, attrs })
          .insertContent('\u00A0')
          .run()
      },
    }
  },
})
