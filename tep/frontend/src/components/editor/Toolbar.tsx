import { useEffect, useState, useCallback } from 'react'
import type { Editor } from '@tiptap/core'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'

type RibbonTab = 'inicio' | 'insertar' | 'formato' | 'referencias' | 'revisar'

interface ToolbarProps {
  grammarCount?: number
}

export default function Toolbar({ grammarCount = 0 }: ToolbarProps) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [tab, setTab] = useState<RibbonTab>('inicio')
  const { norma } = useStore()

  useEffect(() => {
    const handler = (e: Event) => setEditor((e as CustomEvent).detail.editor)
    window.addEventListener('active-editor', handler)
    return () => window.removeEventListener('active-editor', handler)
  }, [])

  const isActive = useCallback((type: string, attrs?: Record<string,unknown>) =>
    editor?.isActive(type, attrs) ?? false, [editor])

  const Btn = ({
    label, action, active = false, title = '', wide = false, disabled = false
  }: {
    label: React.ReactNode
    action: () => void
    active?: boolean
    title?: string
    wide?: boolean
    disabled?: boolean
  }) => (
    <button
      onClick={action}
      title={title}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center rounded-md border transition-all text-xs font-medium select-none disabled:opacity-30 disabled:cursor-not-allowed',
        wide ? 'px-2 h-8' : 'w-8 h-8',
        active
          ? 'bg-brand-500 text-white border-brand-500'
          : 'bg-transparent text-brand-600 border-transparent hover:bg-brand-100 hover:text-brand-800'
      )}>
      {label}
    </button>
  )

  const Group = ({ label, children }: { label: string, children: React.ReactNode }) => (
    <div className="ribbon-group">
      <div className="flex flex-col items-center">
        <div className="flex items-end gap-0.5">{children}</div>
        <span className="ribbon-group-label">{label}</span>
      </div>
    </div>
  )

  const insertImage = () => {
    const url = prompt('URL de la imagen:')
    if (url && editor) editor.chain().focus().setImage({ src: url }).run()
  }

  const insertTable = () => {
    if (editor) editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  const saveCurrent = () => window.dispatchEvent(new CustomEvent('manual-save'))
  const openCiteModal = () => window.dispatchEvent(new CustomEvent('open-cite-modal'))
  const forceGrammarCheck = () => window.dispatchEvent(new CustomEvent('force-grammar-check'))
  const switchSidebarTab = (t: string) => window.dispatchEvent(new CustomEvent('switch-sidebar-tab', { detail: t }))

  const TABS: { id: RibbonTab, label: string }[] = [
    { id: 'inicio',      label: 'Inicio' },
    { id: 'insertar',    label: 'Insertar' },
    { id: 'formato',     label: 'Formato' },
    { id: 'referencias', label: 'Referencias' },
    { id: 'revisar',     label: 'Revisar' },
  ]

  // Norma indicator - ASCII only, no emojis or accented chars
  const normaLabel = norma === 'apa'
    ? 'APA 7 | Times NR 12pt | x2.0'
    : norma === 'vancouver'
    ? 'Vancouver | Arial 11pt | x1.5'
    : ''

  const noEditor = !editor

  return (
    <div className="bg-white border-b border-brand-100 flex-shrink-0">
      {/* Tab strip */}
      <div className="flex items-center border-b border-brand-100 px-2 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn('ribbon-tab-btn flex-shrink-0', tab === t.id && 'active')}>
            {t.label}
          </button>
        ))}
        {grammarCount > 0 && (
          <span className="ml-auto mr-2 flex-shrink-0 flex items-center gap-1 text-xs text-orange-600">
            <i className="ti ti-alert-triangle text-xs" />
            {grammarCount} {grammarCount === 1 ? 'sugerencia' : 'sugerencias'}
          </span>
        )}
        {normaLabel && (
          <span className={cn('hidden md:inline text-xs text-brand-400 italic whitespace-nowrap flex-shrink-0', grammarCount === 0 && 'ml-auto')}>
            [NORMA] {normaLabel}
          </span>
        )}
      </div>

      {/* Ribbon content */}
      <div className="flex items-stretch overflow-x-auto py-1 px-1 min-h-[52px]">
        {noEditor && (
          <div className="flex items-center px-3">
            <span className="text-xs text-brand-300 italic">Haz clic en una seccion para comenzar a editar</span>
          </div>
        )}

        {!noEditor && tab === 'inicio' && (
          <>
            <Group label="Guardar">
              <Btn label={<i className="ti ti-device-floppy text-sm"/>}
                action={saveCurrent} title="Guardar (Ctrl+S)" />
            </Group>
            <Group label="Deshacer">
              <Btn label={<i className="ti ti-arrow-back-up text-sm"/>}
                action={() => editor!.chain().focus().undo().run()} title="Deshacer (Ctrl+Z)" />
              <Btn label={<i className="ti ti-arrow-forward-up text-sm"/>}
                action={() => editor!.chain().focus().redo().run()} title="Rehacer (Ctrl+Y)" />
            </Group>
            <Group label="Fuente">
              <Btn label={<b>N</b>}
                action={() => editor!.chain().focus().toggleBold().run()}
                active={isActive('bold')} title="Negrita (Ctrl+B)" />
              <Btn label={<i>C</i>}
                action={() => editor!.chain().focus().toggleItalic().run()}
                active={isActive('italic')} title="Cursiva (Ctrl+I)" />
              <Btn label={<u>S</u>}
                action={() => editor!.chain().focus().toggleUnderline().run()}
                active={isActive('underline')} title="Subrayado (Ctrl+U)" />
            </Group>
            <Group label="Parrafo">
              <Btn label={<i className="ti ti-list text-sm"/>}
                action={() => editor!.chain().focus().toggleBulletList().run()}
                active={isActive('bulletList')} title="Lista" />
              <Btn label={<i className="ti ti-list-numbers text-sm"/>}
                action={() => editor!.chain().focus().toggleOrderedList().run()}
                active={isActive('orderedList')} title="Lista numerada" />
              <Btn label={<i className="ti ti-align-left text-sm"/>}
                action={() => editor!.chain().focus().setTextAlign('left').run()}
                active={isActive({textAlign:'left'})} title="Izquierda" />
              <Btn label={<i className="ti ti-align-center text-sm"/>}
                action={() => editor!.chain().focus().setTextAlign('center').run()}
                active={isActive({textAlign:'center'})} title="Centrar" />
              <Btn label={<i className="ti ti-align-right text-sm"/>}
                action={() => editor!.chain().focus().setTextAlign('right').run()}
                active={isActive({textAlign:'right'})} title="Derecha" />
              <Btn label={<i className="ti ti-align-justified text-sm"/>}
                action={() => editor!.chain().focus().setTextAlign('justify').run()}
                active={isActive({textAlign:'justify'})} title="Justificar" />
            </Group>
            <Group label="Estilos">
              <Btn label="H1" wide
                action={() => editor!.chain().focus().toggleHeading({level:1}).run()}
                active={isActive('heading',{level:1})} title="Titulo 1" />
              <Btn label="H2" wide
                action={() => editor!.chain().focus().toggleHeading({level:2}).run()}
                active={isActive('heading',{level:2})} title="Titulo 2" />
              <Btn label="H3" wide
                action={() => editor!.chain().focus().toggleHeading({level:3}).run()}
                active={isActive('heading',{level:3})} title="Titulo 3" />
              <Btn label="P"
                action={() => editor!.chain().focus().setParagraph().run()}
                active={isActive('paragraph')} title="Parrafo" />
            </Group>
          </>
        )}

        {!noEditor && tab === 'insertar' && (
          <>
            <Group label="Tablas">
              <Btn label={<i className="ti ti-table text-sm"/>}
                action={insertTable} title="Insertar tabla" />
            </Group>
            <Group label="Ilustraciones">
              <Btn label={<i className="ti ti-photo text-sm"/>}
                action={insertImage} title="Insertar imagen (URL)" />
            </Group>
            <Group label="Texto">
              <Btn label={<span className="italic text-base leading-none">"</span>}
                action={() => editor!.chain().focus().toggleBlockquote().run()}
                active={isActive('blockquote')} title="Cita en bloque" />
            </Group>
            <Group label="Citas">
              <Btn label="(cit)" wide action={openCiteModal} title="Insertar cita bibliografica" />
            </Group>
          </>
        )}

        {!noEditor && tab === 'formato' && (
          <>
            <Group label="Estilos de texto">
              <Btn label="H1" wide
                action={() => editor!.chain().focus().toggleHeading({level:1}).run()}
                active={isActive('heading',{level:1})} title="Titulo 1" />
              <Btn label="H2" wide
                action={() => editor!.chain().focus().toggleHeading({level:2}).run()}
                active={isActive('heading',{level:2})} title="Titulo 2" />
              <Btn label="H3" wide
                action={() => editor!.chain().focus().toggleHeading({level:3}).run()}
                active={isActive('heading',{level:3})} title="Titulo 3" />
              <Btn label="P"
                action={() => editor!.chain().focus().setParagraph().run()}
                active={isActive('paragraph')} title="Parrafo" />
            </Group>
            <Group label="Enfasis">
              <Btn label={<b>N</b>}
                action={() => editor!.chain().focus().toggleBold().run()}
                active={isActive('bold')} title="Negrita (Ctrl+B)" />
              <Btn label={<i>C</i>}
                action={() => editor!.chain().focus().toggleItalic().run()}
                active={isActive('italic')} title="Cursiva (Ctrl+I)" />
              <Btn label={<u>S</u>}
                action={() => editor!.chain().focus().toggleUnderline().run()}
                active={isActive('underline')} title="Subrayado (Ctrl+U)" />
            </Group>
            <Group label="Alineacion">
              <Btn label={<i className="ti ti-align-left text-sm"/>}
                action={() => editor!.chain().focus().setTextAlign('left').run()}
                active={isActive({textAlign:'left'})} title="Izquierda" />
              <Btn label={<i className="ti ti-align-center text-sm"/>}
                action={() => editor!.chain().focus().setTextAlign('center').run()}
                active={isActive({textAlign:'center'})} title="Centrar" />
              <Btn label={<i className="ti ti-align-right text-sm"/>}
                action={() => editor!.chain().focus().setTextAlign('right').run()}
                active={isActive({textAlign:'right'})} title="Derecha" />
              <Btn label={<i className="ti ti-align-justified text-sm"/>}
                action={() => editor!.chain().focus().setTextAlign('justify').run()}
                active={isActive({textAlign:'justify'})} title="Justificar" />
            </Group>
            <Group label="Listas">
              <Btn label={<i className="ti ti-list text-sm"/>}
                action={() => editor!.chain().focus().toggleBulletList().run()}
                active={isActive('bulletList')} title="Lista" />
              <Btn label={<i className="ti ti-list-numbers text-sm"/>}
                action={() => editor!.chain().focus().toggleOrderedList().run()}
                active={isActive('orderedList')} title="Lista numerada" />
            </Group>
            {normaLabel && (
              <Group label="Norma activa">
                <span className="text-xs text-brand-500 px-1 whitespace-nowrap self-center">{normaLabel}</span>
              </Group>
            )}
          </>
        )}

        {!noEditor && tab === 'referencias' && (
          <>
            <Group label="Citas">
              <Btn label="(cit)" wide action={openCiteModal} title="Insertar cita bibliografica" />
            </Group>
            <Group label="Bibliografia">
              <Btn label={<i className="ti ti-books text-sm"/>}
                action={() => switchSidebarTab('refs')} title="Ver panel de referencias" />
            </Group>
            {normaLabel && (
              <Group label="Norma activa">
                <span className="text-xs text-brand-500 px-1 whitespace-nowrap self-center">{normaLabel}</span>
              </Group>
            )}
          </>
        )}

        {!noEditor && tab === 'revisar' && (
          <>
            <Group label="Ortografia y gramatica">
              <Btn label={<i className="ti ti-text-spellcheck text-sm"/>} wide
                action={forceGrammarCheck} title="Revisar ahora" />
              <span className="text-xs text-brand-500 px-2 self-center whitespace-nowrap">Revisar ahora</span>
            </Group>
            <Group label="Panel de errores">
              <Btn label={<i className="ti ti-list-details text-sm"/>} wide
                action={() => switchSidebarTab('grammar')} title="Ver errores en el panel lateral" />
              {grammarCount > 0 && (
                <span className="text-xs text-orange-600 px-2 self-center whitespace-nowrap">
                  {grammarCount} {grammarCount === 1 ? 'sugerencia' : 'sugerencias'}
                </span>
              )}
            </Group>
          </>
        )}
      </div>
    </div>
  )
}
