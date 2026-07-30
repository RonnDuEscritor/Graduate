const express = require('express')
const http = require('http')
const { Packer } = require('docx')
const { buildDocx } = require('./lib/buildDocx')

const app = express()
app.use(express.json({ limit: '25mb' })) // theses can carry embedded images as data URIs

const INTERNAL_PORT = process.env.DOCX_SERVICE_PORT || 8091
const PB_PORT = process.env.PORT || 8090 // PocketBase listens on the public $PORT in the same container

// Confirms the caller's PocketBase auth token actually grants access to the
// requested project, by asking PocketBase itself (reusing its own collection
// API rules instead of re-implementing JWT verification here).
function verifyProjectAccess(projectId, authHeader) {
  return new Promise((resolve) => {
    if (!projectId || !authHeader) return resolve(false)
    const req = http.request({
      host: '127.0.0.1',
      port: PB_PORT,
      path: `/api/collections/projects/records/${encodeURIComponent(projectId)}`,
      method: 'GET',
      headers: { Authorization: authHeader },
      timeout: 5000,
    }, (res) => {
      res.resume() // discard body, we only care about the status
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.end()
  })
}

app.post('/generate', async (req, res) => {
  try {
    const payload = req.body || {}
    const projectId = payload.project && payload.project.id
    const authHeader = req.get('authorization') || req.get('Authorization')

    const authorized = await verifyProjectAccess(projectId, authHeader)
    if (!authorized) {
      return res.status(403).json({ error: 'No autorizado para exportar este proyecto.' })
    }

    const doc = buildDocx(payload)
    const buffer = await Packer.toBuffer(doc)

    res.json({ base64: buffer.toString('base64') })
  } catch (err) {
    console.error('docx-service error:', err)
    res.status(500).json({ error: 'No se pudo generar el documento.', detail: String(err && err.message || err) })
  }
})

app.get('/health', (_req, res) => res.json({ ok: true }))

app.listen(INTERNAL_PORT, '127.0.0.1', () => {
  console.log(`docx-service listening on 127.0.0.1:${INTERNAL_PORT} (internal only)`)
})
