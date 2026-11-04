import { describe, it, expect } from 'vitest'
import {
  countWords, hasRealTiptapContent, interpolatedPageLabel,
  collectCaptionedItems, collectCaptionedItemsMixed, toRoman,
} from '@/lib/utils'

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const doc = (...content: any[]) => ({ type: 'doc', content })

describe('countWords', () => {
  it('cuenta palabras en texto anidado (tablas, listas)', () => {
    const d = doc(p('Esta es la introduccion de la tesis'),
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p('Variable X')] }] }] })
    expect(countWords(d as any)).toBe(9)
  })
  it('devuelve 0 para vacio o null', () => {
    expect(countWords(null)).toBe(0)
    expect(countWords(doc({ type: 'paragraph' }) as any)).toBe(0)
  })
})

describe('hasRealTiptapContent', () => {
  it('detecta texto, imagen o tabla; ignora parrafos vacios', () => {
    expect(hasRealTiptapContent(doc({ type: 'paragraph' }) as any)).toBe(false)
    expect(hasRealTiptapContent(doc(p('   ')) as any)).toBe(false)
    expect(hasRealTiptapContent(doc(p('hola')) as any)).toBe(true)
    expect(hasRealTiptapContent(doc({ type: 'image', attrs: { src: 'x' } }) as any)).toBe(true)
    expect(hasRealTiptapContent(null)).toBe(false)
  })
})

describe('interpolatedPageLabel', () => {
  const range = { start: 10, end: 13, label: '10-13' }
  it('ubica el elemento proporcionalmente dentro del rango', () => {
    expect(interpolatedPageLabel(range, false, 0, 1200)).toBe('10')
    expect(interpolatedPageLabel(range, false, 300, 1200)).toBe('11')
    expect(interpolatedPageLabel(range, false, 600, 1200)).toBe('12')
    expect(interpolatedPageLabel(range, false, 1199, 1200)).toBe('13')
  })
  it('usa numeros romanos en la fase preliminar y no se sale del rango', () => {
    expect(interpolatedPageLabel({ start: 5, end: 5, label: '5' }, true, 50, 100)).toBe('v')
    expect(interpolatedPageLabel(range, false, 99999, 10)).toBe('13')
  })
})

describe('collectCaptionedItems', () => {
  const sections = [
    { name: 'Introduccion', content: doc(p('uno dos'), { type: 'table', content: [] }, { type: 'image' }) as any },
    { name: 'Cap I', content: doc({ type: 'image' }, p('tres')) as any },
  ]
  it('numera tablas e imagenes por separado, en orden de documento', () => {
    const tables = collectCaptionedItems(sections, 'table')
    expect(tables.map(t => [t.number, t.sectionName])).toEqual([[1, 'Introduccion']])
    const figs = collectCaptionedItems(sections, 'image')
    expect(figs.map(t => [t.number, t.sectionName])).toEqual([[1, 'Introduccion'], [2, 'Cap I']])
  })
  it('la lista mixta conserva el orden real y numera cada tipo aparte', () => {
    const mixed = collectCaptionedItemsMixed(sections)
    expect(mixed.map(i => `${i.kind}${i.number}`)).toEqual(['table1', 'image1', 'image2'])
  })
  it('registra cuantas palabras preceden a cada elemento', () => {
    const t = collectCaptionedItems(sections, 'table')[0]
    expect(t.wordsBefore).toBe(2)
    expect(t.sectionWordCount).toBe(2)
  })
})

describe('toRoman', () => {
  it('convierte a minusculas romanas', () => {
    expect([1, 4, 9, 14].map(toRoman)).toEqual(['i', 'iv', 'ix', 'xiv'])
  })
})
