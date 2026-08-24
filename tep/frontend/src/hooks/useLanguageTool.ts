import { useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// Audit 6.1 fix (GRAVE / privacidad y escalabilidad): this used to call
// https://api.languagetool.org/v2/check directly from the browser, sending
// the student's thesis text straight to a third-party service with no
// server-side control. It now goes through the 'check-grammar' Supabase
// Edge Function, which requires an authenticated user and applies its own
// length cap / throttling before ever reaching LanguageTool. See
// supabase/functions/check-grammar/index.ts.

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

export function useLanguageTool() {
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Audit 6.1: aborts any in-flight check before starting a new one, so
  // rapid edits don't pile up parallel requests (each editor previously had
  // no way to cancel a stale request already on the wire).
  const abortRef = useRef<AbortController | null>(null)

  const checkText = useCallback(async (
    text: string,
    onResults: (matches: LTMatch[]) => void,
    language = 'es'
  ) => {
    if (!text || text.trim().length < 10) {
      onResults([])
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return // not logged in (e.g. session expired mid-edit) -- fail silently, don't block the editor

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-grammar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ text, language }),
        signal: controller.signal,
      })

      if (!res.ok) return

      const data: LTResult = await res.json()
      onResults(data.matches ?? [])
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return // superseded by a newer check, not a real failure
      // Silently fail otherwise -- don't block the editor
      console.warn('Grammar check failed:', e)
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
