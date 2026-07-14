import { useEffect, useState, useCallback } from 'react'
import type { Editor } from '@tiptap/core'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'

export default function Toolbar() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const { norma } = useStore()

  useEffect(() => {
    const handler = (e: Event) => setEditor((e as CustomEvent).detail.editor)
    window.addEventListener('active-editor', handler)
    return () => window.removeEventListener('active-editor', handler)
  }, [])

  const isActive = useCallback((type: string, attrs?: Record<string,unknown>) =>
    editor?.isActive(type, attrs) ?? false, [editor])

  const Btn = ({
    label, action, active = false, title = '', wide = false
  }: {
    label: React.ReactNode
    action: () => void
    active?: boolean
    title?: string
    wide?: boolean
  }) => (
    <button
      onClick={action}
      title={title}
      className={cn(
        'flex items-center justify-center rounded-md border transition-all text-xs font-medium select-none',
        wide ? 'px-2 h-7' : 'w-7 h-7',
        active
          ? 'bg-brand-500 text-white border-brand-500'
          : 'bg-transparent text-brand-600 border-transparent hover:bg-brand-100 hover:text-brand-800'
      )}>
      {label}
    </button>
  )

  const Sep = () => <div className="w-px h-5 bg-brand-200 mx-0.5 flex-shrink-0" />

  const insertImage = () => {
    const url = prompt('URL de la imagen:')
    if (url && editor) editor.chain().focus().setImage({ src: url }).run()
  }

  const insertTable = () => {
    if (editor) editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  const saveCurrent = () => window.dispatchEvent(new CustomEvent('manual-save'))

  if (!editor) return (
    <div className="h-9 bg-white border-b border-brand-100 flex items-center px-3 flex-shrink-0">
      <span className="text-xs text-brand-300 italic">Haz clic en una seccion para comenzar a editar</span>
    </div>
  )

  // Norma indicator — ASCII only, no emojis or accented chars
  const normaLabel = norma === 'apa'
    ? 'APA 7 | Times NR 12pt | x2.0'
    : norma === 'vancouver'
    ? 'Vancouver | Arial 11pt | x1.5'
    : ''

  return (
    <div className="bg-white border-b border-brand-100 flex items-center px-2 gap-0.5 overflow-x-auto flex-shrink-0 flex-wrap py-1">

      {/* Save */}
      <Btn
        label={<i className="ti ti-device-floppy text-sm"/>}
        action={saveCurrent}
        title="Guardar (Ctrl+S)"
      />
      <Sep />

      {/* Text style */}
      <Btn label={<b>N</b>}
        action={() => editor.chain().focus().toggleBold().run()}
        active={isActive('bold')} title="Negrita (Ctrl+B)" />
      <Btn label={<i>C</i>}
        action={() => editor.chain().focus().toggleItalic().run()}
        active={isActive('italic')} title="Cursiva (Ctrl+I)" />
      <Btn label={<u>S</u>}
        action={() => editor.chain().focus().toggleUnderline().run()}
        active={isActive('underline')} title="Subrayado (Ctrl+U)" />
      <Sep />

      {/* Headings */}
      <Btn label="H1" wide
        action={() => editor.chain().focus().toggleHeading({level:1}).run()}
        active={isActive('heading',{level:1})} title="Titulo 1" />
      <Btn label="H2" wide
        action={() => editor.chain().focus().toggleHeading({level:2}).run()}
        active={isActive('heading',{level:2})} title="Titulo 2" />
      <Btn label="H3" wide
        action={() => editor.chain().focus().toggleHeading({level:3}).run()}
        active={isActive('heading',{level:3})} title="Titulo 3" />
      <Btn label="P"
        action={() => editor.chain().focus().setParagraph().run()}
        active={isActive('paragraph')} title="Parrafo" />
      <Btn label={<span className="italic text-base leading-none">"</span>}
        action={() => editor.chain().focus().toggleBlockquote().run()}
        active={isActive('blockquote')} title="Cita bloque" />
      <Sep />

      {/* Lists */}
      <Btn label={<i className="ti ti-list text-sm"/>}
        action={() => editor.chain().focus().toggleBulletList().run()}
        active={isActive('bulletList')} title="Lista" />
      <Btn label={<i className="ti ti-list-numbers text-sm"/>}
        action={() => editor.chain().focus().toggleOrderedList().run()}
        active={isActive('orderedList')} title="Lista numerada" />
      <Sep />

      {/* Alignment */}
      <Btn label={<i className="ti ti-align-left text-sm"/>}
        action={() => editor.chain().focus().setTextAlign('left').run()}
        active={isActive({textAlign:'left'})} title="Izquierda" />
      <Btn label={<i className="ti ti-align-center text-sm"/>}
        action={() => editor.chain().focus().setTextAlign('center').run()}
        active={isActive({textAlign:'center'})} title="Centrar" />
      <Btn label={<i className="ti ti-align-right text-sm"/>}
        action={() => editor.chain().focus().setTextAlign('right').run()}
        active={isActive({textAlign:'right'})} title="Derecha" />
      <Btn label={<i className="ti ti-align-justified text-sm"/>}
        action={() => editor.chain().focus().setTextAlign('justify').run()}
        active={isActive({textAlign:'justify'})} title="Justificar" />
      <Sep />

      {/* Insert */}
      <Btn label={<i className="ti ti-table text-sm"/>}
        action={insertTable} title="Insertar tabla" />
      <Btn label={<i className="ti ti-photo text-sm"/>}
        action={insertImage} title="Insertar imagen (URL)" />
      <Btn label="(cit)" wide
        action={() => window.dispatchEvent(new CustomEvent('open-cite-modal'))}
        title="Insertar cita bibliografica" />
      <Sep />

      {/* Undo / Redo */}
      <Btn label={<i className="ti ti-arrow-back-up text-sm"/>}
        action={() => editor.chain().focus().undo().run()} title="Deshacer (Ctrl+Z)" />
      <Btn label={<i className="ti ti-arrow-forward-up text-sm"/>}
        action={() => editor.chain().focus().redo().run()} title="Rehacer (Ctrl+Y)" />

      {/* Norma indicator — ASCII only */}
      {normaLabel && (
        <>
          <Sep />
          <span className="text-xs text-brand-400 italic px-1 whitespace-nowrap">
            [NORMA] {normaLabel}
          </span>
        </>
      )}
    </div>
  )
}
