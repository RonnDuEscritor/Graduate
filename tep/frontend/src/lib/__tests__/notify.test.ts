import { describe, it, expect, beforeEach } from 'vitest'
import { notify, confirmAction, resolveConfirm, subscribe, dismissToast, __resetNotifyForTests } from '@/lib/notify'

describe('notify / confirmAction', () => {
  beforeEach(() => __resetNotifyForTests())
  it('publica avisos y limita a 4 visibles', () => {
    let last: any; subscribe(s => { last = s })
    for (let i = 0; i < 6; i++) notify('m' + i, 'error')
    expect(last.toasts.map((t: any) => t.message)).toEqual(['m2', 'm3', 'm4', 'm5'])
    dismissToast(last.toasts[0].id); expect(last.toasts).toHaveLength(3)
  })
  it('confirmAction resuelve true/false segun la respuesta', async () => {
    let last: any; subscribe(s => { last = s })
    const p = confirmAction('¿Seguro?', { danger: true })
    expect(last.confirm.message).toBe('¿Seguro?'); expect(last.confirm.danger).toBe(true)
    resolveConfirm(true); expect(await p).toBe(true); expect(last.confirm).toBeNull()
    const q = confirmAction('otra'); resolveConfirm(false); expect(await q).toBe(false)
  })
  it('atiende confirmaciones simultaneas una tras otra', async () => {
    let last: any; subscribe(s => { last = s })
    const a = confirmAction('A'); const b = confirmAction('B')
    expect(last.confirm.message).toBe('A')
    resolveConfirm(true); expect(await a).toBe(true)
    expect(last.confirm.message).toBe('B')
    resolveConfirm(false); expect(await b).toBe(false)
  })
})
