import { describe, it, expect } from 'vitest'
import { backoffDelay, retryWithBackoff } from '@/lib/retry'

describe('backoffDelay', () => {
  it('crece de forma exponencial y se acota al maximo', () => {
    expect([1, 2, 3, 4, 5].map(n => backoffDelay(n))).toEqual([1000, 2000, 4000, 8000, 16000])
    expect(backoffDelay(6)).toBe(30000)
    expect(backoffDelay(50)).toBe(30000)
  })
  it('trata intentos invalidos como el primero', () => {
    expect(backoffDelay(0)).toBe(1000)
    expect(backoffDelay(-3)).toBe(1000)
  })
})

describe('retryWithBackoff', () => {
  it('devuelve el resultado sin esperar si el primer intento funciona', async () => {
    const waits: number[] = []
    const r = await retryWithBackoff(async () => 'ok', { sleep: async ms => { waits.push(ms) } })
    expect(r).toBe('ok'); expect(waits).toEqual([])
  })
  it('reintenta con backoff hasta tener exito', async () => {
    const waits: number[] = []; let calls = 0
    const r = await retryWithBackoff(async () => { if (++calls < 3) throw new Error('red'); return 'listo' },
      { retries: 3, sleep: async ms => { waits.push(ms) } })
    expect(r).toBe('listo'); expect(calls).toBe(3); expect(waits).toEqual([1000, 2000])
  })
  it('relanza el ultimo error al agotar los reintentos', async () => {
    let calls = 0
    await expect(retryWithBackoff(async () => { calls++; throw new Error('siempre falla') }, { retries: 2, sleep: async () => {} }))
      .rejects.toThrow('siempre falla')
    expect(calls).toBe(3)
  })
  it('no reintenta errores que shouldRetry descarta', async () => {
    let calls = 0
    await expect(retryWithBackoff(async () => { calls++; throw new Error('permiso') }, { shouldRetry: () => false, sleep: async () => {} }))
      .rejects.toThrow('permiso')
    expect(calls).toBe(1)
  })
})
