// Supabase Edge Function -- lookup-doi
// Proxies DOI metadata lookups to CrossRef from the server instead of the
// browser. Archivo unico autocontenido para pegar directo en el editor web
// de Supabase (Dashboard -> Edge Functions -> Via Editor).
//
// Audit P1 item 9 fix: the frontend used to call
// https://api.crossref.org/works/<doi> directly from the browser
// (lookupDOI() in lib/utils.ts). That works, but leaves the app with no
// control over that call at all -- no auth requirement, no visibility if
// CrossRef is down or rate-limiting us, and every browser tab hits
// CrossRef independently with no shared handling. Centralizing it here
// mirrors the same reasoning already applied to LanguageTool
// (check-grammar/index.ts): the browser only ever talks to our own
// authenticated endpoint, and CrossRef becomes an implementation detail we
// can change, cache or rate-limit later without touching the frontend.
//
// deno-lint-ignore-file no-explicit-any
import { withSupabase } from 'npm:@supabase/server@^1'

const CROSSREF_API = 'https://api.crossref.org/works'
const MAX_DOI_LENGTH = 200

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Metodo no permitido.' }, { status: 405 })
    }
    if (!ctx.user?.id) {
      return Response.json({ error: 'No autenticado.' }, { status: 401 })
    }

    let payload: any
    try {
      payload = await req.json()
    } catch (_e) {
      return Response.json({ error: 'Cuerpo de la peticion invalido.' }, { status: 400 })
    }

    const rawDoi = typeof payload?.doi === 'string' ? payload.doi.trim() : ''
    if (!rawDoi) {
      return Response.json({ error: 'Falta el DOI.' }, { status: 400 })
    }
    if (rawDoi.length > MAX_DOI_LENGTH) {
      return Response.json({ error: 'DOI demasiado largo.' }, { status: 413 })
    }

    const clean = rawDoi.replace(/^https?:\/\/doi\.org\//, '')

    try {
      const res = await fetch(`${CROSSREF_API}/${encodeURIComponent(clean)}`, {
        headers: {
          // CrossRef's "polite pool" asks for a contact identifier in the
          // User-Agent for better rate limits/reliability -- harmless to
          // include even if we're not registered for it.
          'User-Agent': 'GraduatePro/1.0 (mailto:support@graduatepro.app)',
        },
      })

      if (!res.ok) {
        return Response.json({ error: 'No se encontro informacion para ese DOI.' }, { status: res.status === 404 ? 404 : 502 })
      }

      const data = await res.json()
      // Proxies CrossRef's response through as-is -- the frontend already
      // knows how to parse the `message` shape (see lookupDOI in
      // lib/utils.ts), so there is no need to duplicate that parsing logic
      // in two different languages/runtimes here.
      return Response.json(data)
    } catch (err) {
      console.error('lookup-doi error:', err)
      return Response.json({ error: 'No se pudo consultar CrossRef.' }, { status: 500 })
    }
  }),
}
