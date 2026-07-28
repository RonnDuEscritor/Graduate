import type { LTMatch } from '@/hooks/useLanguageTool'

export const CATEGORY_COLORS: Record<string, string> = {
  TYPOS:       'text-red-500   bg-red-50   border-red-200',
  GRAMMAR:     'text-orange-500 bg-orange-50 border-orange-200',
  STYLE:       'text-blue-500  bg-blue-50  border-blue-200',
  PUNCTUATION: 'text-yellow-600 bg-yellow-50 border-yellow-200',
}

export const CATEGORY_LABELS: Record<string, string> = {
  TYPOS:       'Ortografia',
  GRAMMAR:     'Gramatica',
  STYLE:       'Estilo',
  PUNCTUATION: 'Puntuacion',
}

// CSS class applied inside the editor to underline the error (see index.css)
export const CATEGORY_UNDERLINE_CLASS: Record<string, string> = {
  TYPOS:       'lt-spelling',
  GRAMMAR:     'lt-grammar',
  STYLE:       'lt-style',
  PUNCTUATION: 'lt-punctuation',
}

export function getCategoryKey(match: LTMatch): string {
  const cat = match.rule?.category?.id ?? ''
  if (cat.includes('TYPO') || match.rule?.issueType === 'misspelling') return 'TYPOS'
  if (cat.includes('GRAM')) return 'GRAMMAR'
  if (cat.includes('STYLE') || cat.includes('REDUNDANCY')) return 'STYLE'
  if (cat.includes('PUNCT')) return 'PUNCTUATION'
  return 'GRAMMAR'
}
