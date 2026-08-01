// Supabase Edge Function -- POST /functions/v1/generate-docx
//
// Replaces the old PocketBase-hook + Node-sidecar architecture entirely.
// Deno's npm: specifier lets us import the real `docx` npm package directly
// here, so there's no need to proxy to a separate service or relay bytes
// through base64 -- the Response can just return the raw file bytes.
//
// Auth: Supabase verifies the caller's JWT before this code even runs
// (default verify_jwt=true for edge functions). We additionally re-check,
// scoped to the caller's own token, that the requested project actually
// belongs to them -- RLS on the `projects` table means the query below
// simply returns no rows if it doesn't.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { Packer } from 'npm:docx@9.7.1'
import { buildDocx } from '../_shared/buildDocx.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonError('Metodo no permitido.', 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonError('Debes iniciar sesion para exportar.', 401)
  }

  let payload: any
  try {
    payload = await req.json()
  } catch (_e) {
    return jsonError('Cuerpo de la peticion invalido.', 400)
  }

  const projectId = payload?.project?.id
  if (!projectId) {
    return jsonError('Falta el id del proyecto.', 400)
  }

  try {
    // Scoped to the caller's own JWT -- RLS enforces ownership for us.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: project, error } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle()

    if (error || !project) {
      return jsonError('No autorizado para exportar este proyecto.', 403)
    }

    const doc = buildDocx(payload)
    const buffer = await Packer.toBuffer(doc)

    const safeTitle = String(payload?.project?.title || 'tesis')
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .trim() || 'tesis'

    return new Response(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeTitle}.docx"`,
      },
    })
  } catch (err) {
    console.error('generate-docx error:', err)
    return jsonError('No se pudo generar el documento.', 500)
  }
})
