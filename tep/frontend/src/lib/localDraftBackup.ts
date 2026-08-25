import type { TiptapDoc } from '@/types'

// Audit 7.1 / 8.1 fix (GRAVE): the editor previously had no local safety
// net at all -- if the debounced Supabase write never completed (closed
// tab, lost connection, Supabase briefly down, the browser killing the
// page mid-flush) the last seconds of edits were simply gone, with nothing
// to recover from. This keeps a synchronous, best-effort copy of each
// section's latest content in localStorage the moment it changes, well
// before the 1.5s debounce even starts its Supabase write. It's a backstop,
// not a replacement for Supabase: cleared automatically as soon as the real
// save confirms, and only ever read back to *offer* a restore, never to
// silently overwrite server data.

const PREFIX = 'graduate_draft_v1:'

interface LocalDraft {
  content:   TiptapDoc
  wordCount: number
  savedAt:   number // epoch ms
}

function key(sectionId: string) {
  return `${PREFIX}${sectionId}`
}

/** Best-effort synchronous write. Never throws -- storage can be full,
 * disabled (private browsing in some browsers), or unavailable entirely,
 * and none of that should ever interrupt typing. */
export function saveDraftLocally(sectionId: string, content: TiptapDoc, wordCount: number) {
  try {
    const draft: LocalDraft = { content, wordCount, savedAt: Date.now() }
    window.localStorage.setItem(key(sectionId), JSON.stringify(draft))
  } catch {
    // Ignore -- this is a safety net, not a critical path.
  }
}

export function clearLocalDraft(sectionId: string) {
  try {
    window.localStorage.removeItem(key(sectionId))
  } catch {
    // Ignore
  }
}

export function getLocalDraft(sectionId: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(key(sectionId))
    if (!raw) return null
    return JSON.parse(raw) as LocalDraft
  } catch {
    return null
  }
}

// Audit P1 item 13 fix: local drafts can contain unpublished thesis
// content (a student's own unfinished academic work), and there was no
// point at which they were ever cleared other than a successful save
// syncing that exact section. On a shared or public computer, signing out
// left every draft still sitting in localStorage for the next person who
// opens the browser -- readable by anyone with access to that profile,
// indefinitely. Called from signOut() in hooks/useAuth.ts so every local
// draft is wiped the moment the user actually leaves the account, not just
// when each one happens to sync successfully.
export function clearAllLocalDrafts() {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(PREFIX)) toRemove.push(k)
    }
    toRemove.forEach(k => window.localStorage.removeItem(k))
  } catch {
    // Ignore -- best effort, same as every other function in this file.
  }
}
