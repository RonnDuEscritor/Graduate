// Supabase Edge Function -- check-grammar
// Proxies grammar-check requests to LanguageTool from the server instead of
// the browser. Archivo unico autocontenido para pegar directo en el editor
// web de Supabase (Dashboard -> Edge Functions -> Via Editor).
//
// Audit 6.1 fix (GRAVE / privacidad y escalabilidad): the frontend used to
// call https://api.languagetool.org/v2/check directly from the browser with
// the raw thesis text, so a student's unpublished work left the app and
// went straight to a third-party service with no visibility or control on
// our side, and every open editor instance made its own independent calls
// (no shared rate limiting). This function centralizes that call behind
// Supabase auth: only a logged-in owner of the project can trigger a check,
// the text length is capped server-side, and everything funnels through one
// controllable endpoint we can rate-limit, cache or swap providers on later
// without touching the frontend.
//
// deno-lint-ignore-file no-explicit-any
import { withSupabase } from 'npm:@supabase/server@^1'

const LT_API = 'https://api.languagetool.org/v2/check'

// Hard cap on how much text we forward per request. A full thesis section
// should never come close to this; it exists to stop a single request from
// hammering the upstream API with an enormous payload.
const MAX_TEXT_LENGTH = 20000

// Very small in-memory throttle, keyed by user id. Edge Function instances
// are not guaranteed to be warm/shared between requests, so this is a
// best-effort backstop (not a hard guarantee) -- its purpose is to absorb
// the common case of a single editor re-triggering checks too fast, not to
// replace proper infrastructure-level rate limiting.
const lastRequestAt = new Map<string, number>()
const MIN_INTERVAL_MS = 800

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Metodo no permitido.' }, { status: 405 })
    }

    let payload: any
    try {
      payload = await req.json()
    } catch (_e) {
      return Response.json({ error: 'Cuerpo de la peticion invalido.' }, { status: 400 })
    }

    const text = typeof payload?.text === 'string' ? payload.text : ''
    const language = typeof payload?.language === 'string' ? payload.language : 'es'

    if (!text || text.trim().length < 10) {
      return Response.json({ matches: [] })
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return Response.json(
        { error: `El texto excede el limite de ${MAX_TEXT_LENGTH} caracteres por revision.` },
        { status: 413 },
      )
    }

    const userId = ctx.user?.id ?? 'anon'
    const now = Date.now()
    const last = lastRequestAt.get(userId) ?? 0
    if (now - last < MIN_INTERVAL_MS) {
      return Response.json({ error: 'Demasiadas revisiones seguidas. Intenta de nuevo en un momento.' }, { status: 429 })
    }
    lastRequestAt.set(userId, now)

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

      if (!res.ok) {
        return Response.json({ error: 'El servicio de revision gramatical no respondio correctamente.' }, { status: 502 })
      }

      const data = await res.json()
      return Response.json({ matches: data.matches ?? [] })
    } catch (err) {
      console.error('check-grammar error:', err)
      return Response.json({ error: 'No se pudo completar la revision gramatical.' }, { status: 500 })
    }
  }),
}
