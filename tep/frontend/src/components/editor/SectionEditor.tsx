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
import { pb } from '@/lib/pb'
import { useStore } from '@/store'
import { countWords } from '@/lib/utils'
import { useLanguageTool } from '@/hooks/useLanguageTool'
import type { LTMatch } from '@/hooks/useLanguageTool'
import type { TiptapDoc } from '@/types'

interface SectionEditorProps {
  sectionId:   string
  sectionName: string
  fase:        string
  isRoman:     boolean
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
  sectionId, sectionName, fase,
  content, pageNum, tesisTitulo, normaClass, projectId, zoom,
  onGrammarResults,
}: SectionEditorProps) {
  const { activeSectionId, setActiveSection, saveSectionContent, setSaving, setLastSaved } = useStore()
  const isActive  = activeSectionId === sectionId
  const isVirtual = sectionId.startsWith('virtual-')
  const pbIdRef   = useRef<string | null>(isVirtual ? null : sectionId)

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
      Placeholder.configure({
        placeholder: `Escribe el contenido de "${sectionName}"...`,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: (content as TiptapDoc) ?? undefined,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON() as TiptapDoc
      const wc   = countWords(json as any)
      handleSave(json, wc)

      // Schedule grammar check via LanguageTool
      const text = editor.getText()
      if (text.trim().length > 20) {
        scheduleCheck(text, (matches) => {
          // Apply visual underlines via CSS classes on editor marks
          // No ProseMirror plugin needed - just notify parent
          if (onGrammarResults) {
            onGrammarResults(matches, pbIdRef.current ?? sectionId)
          }
        }, 2500)
      }
    },
    editorProps: { attributes: { class: 'tiptap' } },
  })

  // Save handler
  const handleSave = useCallback(async (json: TiptapDoc, wc: number) => {
    if (!pbIdRef.current) {
      setSaving(true)
      try {
        const rec = await pb.collection('sections').create({
          project:     projectId,
          name:        sectionName,
          fase:        fase,
          order_index: 1,
          word_count:  wc,
          content:     json,
        })
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
  }, [projectId, sectionName, fase, saveSectionContent, setSaving, setLastSaved])

  // Manual save
  useEffect(() => {
    const handler = () => {
      if (!isActive || !editor) return
      const json = editor.getJSON() as TiptapDoc
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

  // Cite insertion
  const handleInsertCite = useCallback((e: Event) => {
    const { citeText, sectionId: targetId } = (e as CustomEvent).detail
    if (targetId !== (pbIdRef.current ?? sectionId) || !editor) return
    editor.chain().focus().insertContent(
      `<span class="cite-chip">${citeText}</span>&nbsp;`
    ).run()
  }, [editor, sectionId])

  useEffect(() => {
    window.addEventListener('insert-cite', handleInsertCite)
    return () => window.removeEventListener('insert-cite', handleInsertCite)
  }, [handleInsertCite])

  // Apply grammar fix from panel
  const handleApplyFix = useCallback((e: Event) => {
    const { match, replacement, sectionId: targetId } = (e as CustomEvent).detail
    if (targetId !== (pbIdRef.current ?? sectionId) || !editor) return
    const text = editor.getText()
    const before = text.slice(0, match.offset)
    const after  = text.slice(match.offset + match.length)
    const newText = before + replacement + after
    // Simple approach: replace full text content
    editor.commands.setContent(`<p>${newText}</p>`)
  }, [editor, sectionId])

  useEffect(() => {
    window.addEventListener('apply-grammar-fix', handleApplyFix)
    return () => window.removeEventListener('apply-grammar-fix', handleApplyFix)
  }, [handleApplyFix])

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
