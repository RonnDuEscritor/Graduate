import { describe, it, expect } from 'vitest'
import { buildBackup, backupFileName, BACKUP_FORMAT_VERSION } from '@/lib/backup'
import { computeReadiness } from '@/lib/readiness'

const project: any = { id: 'p1', title: 'Análisis del Impacto: ¿Sí?', tipo: 0, norma: 'apa', author: 'Ana', institution: 'UCE', year: 2026 }
const txt = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
const sec = (id: string, name: string, order: number, content: any = null): any => ({ id, name, order_index: order, content, word_count: 0, project: 'p1', fase: 'x', is_roman: false })
const ref = (id: string): any => ({ id, project: 'p1', author: 'Perez', year: '2020', title: 'T' + id, ref_type: 'libro' })
const cit = (id: string, section: string, reference: string, order: number): any => ({ id, project: 'p1', section, reference, order_of_appearance: order })

describe('buildBackup / backupFileName', () => {
  it('incluye todo el proyecto y ordena secciones y citas', () => {
    const b = buildBackup(project, [sec('b', 'B', 2), sec('a', 'A', 1)], [ref('r1')], [cit('c2', 'a', 'r1', 20), cit('c1', 'a', 'r1', 10)], new Date('2026-10-28T10:00:00Z'))
    expect(b.app).toBe('Graduate Pro'); expect(b.formatVersion).toBe(BACKUP_FORMAT_VERSION)
    expect(b.exportedAt).toBe('2026-10-28T10:00:00.000Z')
    expect(b.sections.map(s => s.id)).toEqual(['a', 'b'])
    expect(b.citations.map(c => c.id)).toEqual(['c1', 'c2'])
    expect(JSON.parse(JSON.stringify(b)).project.id).toBe('p1')
  })
  it('genera un nombre de archivo seguro sin acentos ni simbolos', () => {
    expect(backupFileName(project.title, new Date('2026-10-28T10:00:00Z'))).toBe('respaldo-Analisis-del-Impacto-Si-2026-10-28.json')
    expect(backupFileName('', new Date('2026-01-02T00:00:00Z'))).toBe('respaldo-tesis-2026-01-02.json')
  })
})

describe('computeReadiness', () => {
  it('senala secciones vacias, ignorando portada, indices y bibliografia', () => {
    const r = computeReadiness(project,
      [sec('1', 'Portada oficial', 0), sec('2', 'Indice general', 1), sec('3', 'Referencias bibliograficas', 9),
       sec('4', 'Introduccion', 2), sec('5', 'Cap. I', 3, txt('contenido'))], [], [])
    const e = r.errors.find(x => x.id === 'empty-sections')!
    expect(e.text).toContain('1 seccion(es)'); expect(e.text).toContain('Introduccion')
    expect(e.text).not.toContain('Portada'); expect(e.text).not.toContain('Cap. I')
  })
  it('detecta citas huerfanas y bibliografia vacia con citas', () => {
    const r = computeReadiness(project, [sec('s1', 'Introduccion', 1, txt('x'))], [], [cit('c', 's1', 'ghost', 1)])
    expect(r.errors.map(x => x.id)).toEqual(expect.arrayContaining(['orphan-citations', 'no-bibliography']))
  })
  it('recomienda sobre referencias sin citar, norma libre y datos de portada', () => {
    const r = computeReadiness({ ...project, norma: 'libre', author: '', year: undefined }, [sec('s1', 'Introduccion', 1, txt('x'))], [ref('r1'), ref('r2')], [cit('c', 's1', 'r1', 1)])
    const ids = r.recommendations.map(x => x.id)
    expect(ids).toEqual(expect.arrayContaining(['uncited-refs', 'norma-libre', 'meta']))
    expect(r.recommendations.find(x => x.id === 'meta')!.text).toMatch(/autor.*anio/)
  })
  it('siempre informa lo que NO se puede comprobar', () => {
    const r = computeReadiness(project, [], [], [])
    expect(r.unchecked.map(x => x.id)).toEqual(['pagination', 'template', 'citation-fmt', 'content'])
  })
})
