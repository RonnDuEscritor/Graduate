import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Supabase simulado: cada llamada a .update(...).eq(...) consume el
// siguiente resultado de la cola `results` (null = exito, string = error).
const results: (string | null)[] = []
const calls: any[] = []
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (payload: any) => ({
        eq: (_c: string, id: string) => {
          calls.push({ id, payload })
          const r = results.length ? results.shift()! : null
          return Promise.resolve({ error: r ? { message: r } : null })
        },
      }),
    }),
  },
}))

// localStorage minimo para localDraftBackup (que lo usa via window.localStorage)
const store = new Map<string, string>()
const fakeLocalStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size },
}
vi.stubGlobal('localStorage', fakeLocalStorage)
vi.stubGlobal('window', { localStorage: fakeLocalStorage })

const DRAFT_KEY = 'graduate_draft_v1:s1'
const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hola mundo' }] }] } as any
let useStore: typeof import('@/store').useStore

beforeEach(async () => {
  vi.useFakeTimers()
  results.length = 0; calls.length = 0; store.clear()
  vi.stubGlobal('navigator', { onLine: true })
  vi.resetModules()
  ;({ useStore } = await import('@/store'))
})
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('guardado de secciones: estados, reintentos y sin conexion', () => {
  it('guarda tras el debounce y termina en "saved"', async () => {
    useStore.getState().saveSectionContent('s1', doc, 2)
    expect(calls).toHaveLength(0)                      // aun dentro del debounce de 1.5 s
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull() // borrador local escrito de inmediato
    await vi.advanceTimersByTimeAsync(1500)
    expect(calls).toHaveLength(1)
    expect(useStore.getState().saveStatus).toBe('saved')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull() // borrador local limpiado tras guardar
  })

  it('si falla, informa "error", conserva el borrador y reintenta con backoff hasta guardar', async () => {
    results.push('fallo de red', 'fallo de red')       // dos fallos y luego exito
    useStore.getState().saveSectionContent('s1', doc, 2)
    await vi.advanceTimersByTimeAsync(1500)
    expect(useStore.getState().saveStatus).toBe('error')
    expect(calls).toHaveLength(1)
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull() // si falla, el borrador local se CONSERVA
    await vi.advanceTimersByTimeAsync(1000)            // 1.er reintento (backoff 1 s)
    expect(calls).toHaveLength(2)
    expect(useStore.getState().saveStatus).toBe('error')
    await vi.advanceTimersByTimeAsync(2000)            // 2.o reintento (backoff 2 s)
    expect(calls).toHaveLength(3)
    expect(useStore.getState().saveStatus).toBe('saved')
    // el contenido reintentado es el mismo que se intento guardar al inicio
    expect(calls.every(c => c.payload.word_count === 2)).toBe(true)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()  // y se limpia solo cuando por fin se guarda
  })

  it('una edicion mas reciente NO es pisada por el reintento de una anterior', async () => {
    results.push('fallo')
    const newer = { ...doc, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'version nueva mas larga' }] }] }
    useStore.getState().saveSectionContent('s1', doc, 2)
    await vi.advanceTimersByTimeAsync(1500)            // falla
    useStore.getState().saveSectionContent('s1', newer, 4)  // el usuario sigue escribiendo
    await vi.advanceTimersByTimeAsync(1500)            // se guarda la nueva
    expect(calls[calls.length - 1].payload.word_count).toBe(4)
    await vi.advanceTimersByTimeAsync(40000)           // ningun reintento viejo debe sobreescribir
    expect(calls[calls.length - 1].payload.word_count).toBe(4)
    expect(useStore.getState().saveStatus).toBe('saved')
  })

  it('sin conexion: no intenta la red, avisa "offline" y guarda al volver', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    useStore.getState().saveSectionContent('s1', doc, 2)
    await vi.advanceTimersByTimeAsync(1500)
    expect(calls).toHaveLength(0)
    expect(useStore.getState().saveStatus).toBe('offline')
    vi.stubGlobal('navigator', { onLine: true })
    await useStore.getState().flushPendingSaves()      // lo que dispara el evento `online`
    expect(calls).toHaveLength(1)
    expect(useStore.getState().saveStatus).toBe('saved')
  })

  it('flushPendingSaves no se cuelga en un bucle infinito estando offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    useStore.getState().saveSectionContent('s1', doc, 2)
    useStore.getState().saveSectionContent('s2', doc, 2)
    await expect(useStore.getState().flushPendingSaves()).resolves.toBeUndefined()
    expect(useStore.getState().saveStatus).toBe('offline')
  })
})
