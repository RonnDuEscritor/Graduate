// Mirrors frontend/src/types/index.ts NORMAS, but resolved into the units
// docx.js expects (half-points for font size, twips*20 line spacing, etc).
// Kept intentionally separate from the frontend copy -- this file only
// controls low-level OOXML rendering, never academic/business rules
// (those stay in the frontend, the single source of truth).

const NORMAS = {
  libre: {
    label: 'Libre',
    font: 'Inter',
    fontHalfPt: 22,       // ~11pt
    lineMultiplier: 1.85,
    align: 'LEFT',
  },
  apa: {
    label: 'APA 7',
    font: 'Times New Roman',
    fontHalfPt: 24,       // 12pt
    lineMultiplier: 2.0,
    align: 'LEFT',
  },
  vancouver: {
    label: 'Vancouver',
    font: 'Arial',
    fontHalfPt: 22,       // 11pt
    lineMultiplier: 1.5,
    align: 'JUSTIFIED',
  },
}

function resolveNorma(norma) {
  return NORMAS[norma] || NORMAS.libre
}

module.exports = { NORMAS, resolveNorma }
