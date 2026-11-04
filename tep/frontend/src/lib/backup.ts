import type { PBProject, PBSection, PBReference, PBCitation } from '@/types'

// Auditoria integral (Fase 4 / Anexo "Guardado"): copia de seguridad que el
// estudiante puede descargar y conservar fuera de la plataforma. Logica
// pura y sin efectos secundarios para poder probarla; la descarga real
// (Blob + enlace) vive en ExportPanel.

export const BACKUP_FORMAT_VERSION = 1

export interface ProjectBackup {
  app: 'Graduate Pro'
  formatVersion: number
  exportedAt: string
  project: PBProject
  sections: PBSection[]
  references: PBReference[]
  citations: PBCitation[]
}

export function buildBackup(
  project: PBProject,
  sections: PBSection[],
  references: PBReference[],
  citations: PBCitation[],
  now: Date = new Date(),
): ProjectBackup {
  return {
    app: 'Graduate Pro',
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    project,
    // Orden estable de lectura, independiente del orden en que lleguen de la base.
    sections: [...sections].sort((a, b) => a.order_index - b.order_index),
    references,
    citations: [...citations].sort((a, b) => a.order_of_appearance - b.order_of_appearance),
  }
}

// Nombre de archivo seguro: sin acentos, sin caracteres reservados.
export function backupFileName(title: string, now: Date = new Date()): string {
  const slug = (title || 'tesis')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'tesis'
  return `respaldo-${slug}-${now.toISOString().slice(0, 10)}.json`
}
