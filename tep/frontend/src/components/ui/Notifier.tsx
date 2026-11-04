import { useEffect, useRef, useState } from 'react'
import { subscribe, dismissToast, resolveConfirm } from '@/lib/notify'
import type { NotifyState } from '@/lib/notify'

// Renderiza los avisos (toasts) y el dialogo de confirmacion de lib/notify.
// Accesibilidad: los avisos usan role="status"/"alert" (los lee el lector de
// pantalla sin robar el foco); el dialogo es role="alertdialog" modal, mueve
// el foco al boton seguro (Cancelar), atrapa Tab, se cierra con Escape y
// devuelve el foco a donde estaba.
export default function Notifier() {
  const [state, setState] = useState<NotifyState>({ toasts: [], confirm: null })
  useEffect(() => subscribe(setState), [])

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)]" aria-label="Avisos">
        {state.toasts.map(t => <Toast key={t.id} id={t.id} kind={t.kind} message={t.message} />)}
      </div>
      {state.confirm && <ConfirmDialog key={state.confirm.id} item={state.confirm} />}
    </>
  )
}

function Toast({ id, kind, message }: { id: number; kind: 'info' | 'success' | 'error'; message: string }) {
  useEffect(() => {
    const t = setTimeout(() => dismissToast(id), kind === 'error' ? 10000 : 6000)
    return () => clearTimeout(t)
  }, [id, kind])
  const styles =
    kind === 'error'   ? 'bg-red-950 border-red-300 text-red-50' :
    kind === 'success' ? 'bg-green-950 border-green-300 text-green-50' :
                         'bg-brand-900 border-brand-200 text-brand-50'
  return (
    <div role={kind === 'error' ? 'alert' : 'status'}
      className={`border rounded-lg px-3.5 py-3 text-sm shadow-lg flex items-start gap-3 ${styles}`}>
      <span className="flex-1 whitespace-pre-line">{message}</span>
      <button onClick={() => dismissToast(id)} aria-label="Cerrar aviso"
        className="text-current opacity-90 hover:opacity-100 text-base leading-none px-1">&times;</button>
    </div>
  )
}

function ConfirmDialog({ item }: { item: NonNullable<NotifyState['confirm']> }) {
  const cancelRef  = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<Element | null>(null)

  useEffect(() => {
    returnFocus.current = document.activeElement
    cancelRef.current?.focus()
    return () => { (returnFocus.current as HTMLElement | null)?.focus?.() }
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); resolveConfirm(false); return }
    if (e.key === 'Tab') {
      const first = cancelRef.current, last = confirmRef.current
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4" onKeyDown={onKeyDown}>
      <div role="alertdialog" aria-modal="true" aria-labelledby={`dlg-t-${item.id}`} aria-describedby={`dlg-d-${item.id}`}
        className="bg-brand-900 border border-brand-200/60 rounded-xl p-5 w-full max-w-md shadow-2xl">
        <h2 id={`dlg-t-${item.id}`} className="font-serif text-lg text-brand-50 mb-2">{item.title}</h2>
        <p id={`dlg-d-${item.id}`} className="text-sm text-brand-100 whitespace-pre-line mb-5">{item.message}</p>
        <div className="flex gap-2 justify-end">
          <button ref={cancelRef} onClick={() => resolveConfirm(false)}
            className="px-4 py-2 rounded-lg text-sm border border-brand-200 text-brand-50 hover:bg-brand-800">
            {item.cancelLabel}
          </button>
          <button ref={confirmRef} onClick={() => resolveConfirm(true)}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${item.danger ? 'bg-red-700 hover:bg-red-600' : 'bg-brand-500 hover:bg-brand-400'}`}>
            {item.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
