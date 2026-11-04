// Auditoria integral (5.5 Accesibilidad): "Alternativas a alert() y
// confirm() para una experiencia coherente". Mini bus de eventos sin
// dependencias: cualquier modulo (hooks, store, componentes) puede avisar o
// pedir confirmacion sin importar React; <Notifier /> (components/ui)
// renderiza los avisos de forma accesible.

export type ToastKind = 'info' | 'success' | 'error'
export interface ToastItem { id: number; kind: ToastKind; message: string }
export interface ConfirmItem {
  id: number
  message: string
  title: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  resolve: (accepted: boolean) => void
}
export interface NotifyState { toasts: ToastItem[]; confirm: ConfirmItem | null }

let nextId = 1
let state: NotifyState = { toasts: [], confirm: null }
const queue: ConfirmItem[] = []
const listeners = new Set<(s: NotifyState) => void>()

function emit() { listeners.forEach(l => l(state)) }

export function subscribe(listener: (s: NotifyState) => void): () => void {
  listeners.add(listener)
  listener(state)
  return () => { listeners.delete(listener) }
}

export function notify(message: string, kind: ToastKind = 'info'): void {
  state = { ...state, toasts: [...state.toasts, { id: nextId++, kind, message }].slice(-4) }
  emit()
}

export function dismissToast(id: number): void {
  state = { ...state, toasts: state.toasts.filter(t => t.id !== id) }
  emit()
}

export interface ConfirmOptions { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }

// Devuelve una promesa: true si el usuario acepta, false si cancela o cierra
// con Escape. Las peticiones simultaneas se atienden una tras otra.
export function confirmAction(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    queue.push({
      id: nextId++, message, resolve,
      title: opts.title ?? 'Confirmar',
      confirmLabel: opts.confirmLabel ?? 'Aceptar',
      cancelLabel: opts.cancelLabel ?? 'Cancelar',
      danger: opts.danger ?? false,
    })
    pump()
  })
}

function pump() {
  if (state.confirm || queue.length === 0) return
  state = { ...state, confirm: queue.shift()! }
  emit()
}

export function resolveConfirm(accepted: boolean): void {
  const current = state.confirm
  if (!current) return
  state = { ...state, confirm: null }
  emit()
  current.resolve(accepted)
  pump()
}

// Solo para pruebas.
export function __resetNotifyForTests() {
  nextId = 1; state = { toasts: [], confirm: null }; queue.length = 0; listeners.clear()
}
