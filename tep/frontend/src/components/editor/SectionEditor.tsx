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
}

export default function SectionEditor({
  sectionId, sectionName, fase,
  content, pageNum, tesisTitulo, normaClass, projectId, zoom
}: SectionEditorProps) {
  const { activeSectionId, setActiveSection, saveSectionContent, setSaving, setLastSaved } = useStore()
  const isActive  = activeSectionId === sectionId
  const isVirtual = sectionId.startsWith('virtual-')
  const pbIdRef   = useRef<string | null>(isVirtual ? null : sectionId)
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: { depth: 50 } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Image.configure({ inline: false, HTMLAttributes: { class: 'rounded-md max-w-full' } }),
      Table.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      Placeholder.configure({
        placeholder: `Escribe aquÃ­ el contenido de "${sectionName}"â€¦`,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: (content as TiptapDoc) ?? undefined,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON() as TiptapDoc
      const wc   = countWords(json as any)
      handleSave(json, wc)
    },
    editorProps: { attributes: { class: 'tiptap' } },
  })

  editorRef.current = editor

  // Save â€” creates PB record if virtual (first write), updates if exists
  const handleSave = useCallback(async (json: TiptapDoc, wc: number) => {
    if (!pbIdRef.current) {
      setSaving(true)
      try {
        const rec = await pb.collection('sections').create({
          project:     projectId,
          name:        sectionName,
          fase:        fase,
          order_index: 1, // avoid Nonzero rejection â€” order doesn't matter, sidebar uses TIPOS_TESIS order
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

  // Manual save (Ctrl+S or toolbar button)
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

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && isActive) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('manual-save'))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isActive])

  // Expose editor to toolbar
  useEffect(() => {
    if (isActive && editor) {
      window.dispatchEvent(new CustomEvent('active-editor', {
        detail: { editor, sectionId: pbIdRef.current ?? sectionId }
      }))
    }
  }, [isActive, editor, sectionId])

  // Listen for cite insertion
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

  const handleFocus = () => setActiveSection(pbIdRef.current ?? sectionId)

  return (
    <div
      id={`section-${sectionId}`}
      className={`a4-page ${normaClass} transition-shadow ${isActive ? 'ring-1 ring-brand-400/30' : ''}`}
      style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', marginBottom: zoom !== 1 ? `${(1-zoom) * -1000}px` : '24px' }}>

      <div className="page-header">
        <span>{tesisTitulo}</span>
        <span>TesisEditor Pro</span>
      </div>

      <span className="section-anchor-label">
        {fase} â€º {sectionName}
      </span>

      <EditorContent editor={editor} onClick={handleFocus} onFocus={handleFocus} />

      <div className="page-footer">
        <span>{pageNum}</span>
      </div>
    </div>
  )
}
