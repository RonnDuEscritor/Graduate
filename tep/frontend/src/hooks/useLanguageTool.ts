import { useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/core'

// LanguageTool API - free, no key needed for public endpoint
const LT_API = 'https://api.languagetool.org/v2/check'

export interface LTMatch {
  message:     string
  shortMessage: string
  offset:      number
  length:      number
  replacements: { value: string }[]
  rule: {
    id:          string
    description: string
    category:    { id: string; name: string }
    issueType:   string
  }
}

export interface LTResult {
  matches: LTMatch[]
}

// Debounce helper
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: unknown[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}

// Extract plain text from Tiptap editor preserving offsets
function getPlainText(editor: Editor): string {
  return editor.getText()
}

export function useLanguageTool() {
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkText = useCallback(async (
    text: string,
    onResults: (matches: LTMatch[]) => void,
    language = 'es'
  ) => {
    if (!text || text.trim().length < 10) {
      onResults([])
      return
    }

    try {
      const body = new URLSearchParams({
        text,
        language,
        enabledOnly: 'false',
        level: 'picky',
      })

      const res = await fetch(LT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })

      if (!res.ok) return

      const data: LTResult = await res.json()
      onResults(data.matches)
    } catch (e) {
      // Silently fail — don't block the editor
      console.warn('LanguageTool check failed:', e)
    }
  }, [])

  // Schedule a check with debounce
  const scheduleCheck = useCallback((
    text: string,
    onResults: (matches: LTMatch[]) => void,
    delayMs = 2000,
    language = 'es'
  ) => {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current)
    checkTimerRef.current = setTimeout(() => {
      checkText(text, onResults, language)
    }, delayMs)
  }, [checkText])

  return { checkText, scheduleCheck }
}
