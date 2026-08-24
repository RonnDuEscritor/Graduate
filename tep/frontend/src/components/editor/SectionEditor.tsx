import { useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Placeholder from '@tiptap/extension-placeholder'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/store'
import { countWords } from '@/lib/utils'
import { useLanguageTool } from '@/hooks/useLanguageTool'
import type { LTMatch } from '@/hooks/useLanguageTool'
import type { TiptapDoc, TiptapNode } from '@/types'
import { GrammarErrorMark } from '@/extensions/GrammarErrorMark'
import { CitationNode } from '@/extensions/CitationNode'
import { applyGrammarMarks, applyGrammarFix, stripGrammarMarksFromJSON } from '@/lib/grammarPosition'
import { extractCitationRefIds } from '@/lib/utils'

interface SectionEditorProps {
  sectionId:   string
  sectionName: string
  fase:        string
  isRoman:     boolean
  orderIndex:  number
  content:     object | null
  wordCount:   number
  pageNum:     string
  tesisTitulo: string
  normaClass:  string
  projectId:   string
  zoom:        number
  onGrammarResults?: (matches: LTMatch[], sectionId: string) => void
}

export default function SectionEditor({
  sectionId, sectionName, fase, orderIndex,
  content, pageNum, tesisTitulo, normaClass, projectId, zoom,
  onGrammarResults,
}: SectionEditorProps) {
  const { activeSectionId, setActiveSection, saveSectionContent, setSaving, setLastSaved, syncSectionCitations } = useStore()
  const isActive  = activeSectionId === sectionId
  const isVirtual = sectionId.startsWith('virtual-')
  const pbIdRef   = useRef<string | null>(isVirtual ? null : sectionId)
  // Audit 2.1: remembers the last citation-refId list we reconciled to the
  // database, so syncSectionCitations only fires network calls when that
  // list actually changed -- not on every keystroke of an unrelated edit.
  const lastCitationRefsRef = useRef<string>('')

  const { scheduleCheck } = useLanguageTool()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: { depth: 50 } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Image.configure({ inline: false }),
      Table.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      GrammarErrorMark,
      CitationNode,
      Placeholder.configure({
        placeholder: `Escribe el contenido de "${sectionName}"...`,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: (content as TiptapDoc) ?? undefined,
    onUpdate: ({ editor, transaction }) => {
      // Ignore transactions we dispatched ourselves to paint grammar underlines -
      // they don't represent a real content change and must not re-trigger a save
      // or a new grammar check (that would loop forever).
      if (transaction.getMeta('grammarMark')) return

      const json = stripGrammarMarksFromJSON(editor.getJSON()) as TiptapDoc
      const wc   = countWords(json as any)
      handleSave(json, wc)

      // Schedule grammar check via LanguageTool
      const text = editor.getText()
      if (text.trim().length > 20) {
        scheduleCheck(text, (matches) => {
          // Underline the matches directly in the document using the
          // grammarError Tiptap mark (no ProseMirror plugin involved).
          applyGrammarMarks(editor, matches)
          if (onGrammarResults) {
            onGrammarResults(matches, pbIdRef.current ?? sectionId)
          }
        }, 2500)
      } else {
        applyGrammarMarks(editor, [])
      }
    },
    editorProps: { attributes: { class: 'tiptap' } },
  })

  // Save handler
  const handleSave = useCallback(async (json: TiptapDoc, wc: number) => {
    if (!pbIdRef.current) {
      setSaving(true)
      try {
        const { data: rec, error } = await supabase
          .from('sections')
          .insert({
            project:     projectId,
            name:        sectionName,
            fase:        fase,
            order_index: orderIndex,
            word_count:  wc,
            content:     json,
          })
          .select().single()
        if (error) throw error
        pbIdRef.current = rec.id
        saveSectionContent(rec.id, json, wc)
        setSaving(false)
        setLastSaved(new Date())
      } catch (e) {
        console.error('Error creating section:', e)
        setSaving(false)
      }
    } else {
      saveSectionContent(pbIdRef.current, json, wc)
    }

    // Audit 2.1/3.1 fix: reconcile the citations table against what the
    // document actually contains right now, so deleting a citation chip
    // (or moving a paragraph) is reflected in the bibliography and
    // Vancouver numbering on the very next save -- not left stale. Skipped
    // when the extracted reference list hasn't changed, so an unrelated
    // keystroke doesn't trigger citation network calls.
    if (pbIdRef.current) {
      const refIds = extractCitationRefIds(json as unknown as TiptapNode)
      const signature = refIds.join(',')
      if (signature !== lastCitationRefsRef.current) {
        lastCitationRefsRef.current = signature
        syncSectionCitations(pbIdRef.current, refIds)
      }
    }
  }, [projectId, sectionName, fase, saveSectionContent, setSaving, setLastSaved, syncSectionCitations])

  // Manual save
  useEffect(() => {
    const handler = () => {
      if (!isActive || !editor) return
      const json = stripGrammarMarksFromJSON(editor.getJSON()) as TiptapDoc
      const wc   = countWords(json as any)
      handleSave(json, wc)
    }
    window.addEventListener('manual-save', handler)
    return () => window.removeEventListener('manual-save', handler)
  }, [isActive, editor, handleSave])

  // Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && isActive) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('manual-save'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isActive])

  // Expose editor to toolbar
  useEffect(() => {
    if (isActive && editor) {
      window.dispatchEvent(new CustomEvent('active-editor', {
        detail: { editor, sectionId: pbIdRef.current ?? sectionId }
      }))
    }
  }, [isActive, editor, sectionId])

  // Cite insertion.
  // Audit 2.1 fix (GRAVE): now inserts a real 'citation' Tiptap node
  // (referenceId + page + display) instead of a plain HTML span, so the
  // document itself can be scanned as the source of truth for what's
  // actually cited (see extractCitationRefIds/syncSectionCitations).
  const handleInsertCite = useCallback((e: Event) => {
    const { citeText, sectionId: targetId, refId, page, citationStyle } = (e as CustomEvent).detail
    if (targetId !== (pbIdRef.current ?? sectionId) || !editor) return
    editor.chain().focus().insertCitation({
      referenceId: refId, page: page ?? null, display: citeText, citationStyle: citationStyle ?? null,
    }).run()
  }, [editor, sectionId])

  useEffect(() => {
    window.addEventListener('insert-cite', handleInsertCite)
    return () => window.removeEventListener('insert-cite', handleInsertCite)
  }, [handleInsertCite])

  // Apply grammar fix from panel - replaces just the matched range in place,
  // preserving the rest of the document's structure and formatting.
  const handleApplyFix = useCallback((e: Event) => {
    const { match, replacement, sectionId: targetId } = (e as CustomEvent).detail
    if (targetId !== (pbIdRef.current ?? sectionId) || !editor) return
    applyGrammarFix(editor, match, replacement)
  }, [editor, sectionId])

  useEffect(() => {
    window.addEventListener('apply-grammar-fix', handleApplyFix)
    return () => window.removeEventListener('apply-grammar-fix', handleApplyFix)
  }, [handleApplyFix])

  // Manual "Revisar ahora" trigger from the ribbon
  const handleForceGrammarCheck = useCallback(() => {
    if (!isActive || !editor) return
    const text = editor.getText()
    scheduleCheck(text, (matches) => {
      applyGrammarMarks(editor, matches)
      if (onGrammarResults) {
        onGrammarResults(matches, pbIdRef.current ?? sectionId)
      }
    }, 0)
  }, [isActive, editor, scheduleCheck, onGrammarResults, sectionId])

  useEffect(() => {
    window.addEventListener('force-grammar-check', handleForceGrammarCheck)
    return () => window.removeEventListener('force-grammar-check', handleForceGrammarCheck)
  }, [handleForceGrammarCheck])

  const handleFocus = () => setActiveSection(pbIdRef.current ?? sectionId)

  return (
    <div
      id={`section-${sectionId}`}
      className={`a4-page ${normaClass} transition-shadow ${isActive ? 'ring-1 ring-brand-400/30' : ''}`}
      style={{
        transform: `scale(${zoom})`,
        transformOrigin: 'top center',
        marginBottom: zoom !== 1 ? `${(1 - zoom) * -800}px` : '24px'
      }}>

      <div className="page-header">
        <span>{tesisTitulo}</span>
        <span>Graduate Pro</span>
      </div>

      <span className="section-anchor-label">
        {fase} &rsaquo; {sectionName}
      </span>

      <EditorContent editor={editor} onClick={handleFocus} onFocus={handleFocus} />

      <div className="page-footer">
        <span>{pageNum}</span>
      </div>
    </div>
  )
}
