// PocketBase JS Hooks — pb_hooks/main.pb.js
// Se ejecutan en el servidor de PocketBase automaticamente

// ── DOCX GENERATION PROXY ─────────────────────────────────────
// The actual OOXML rendering happens in a small internal Node service
// (backend/docx-service) using the real `docx` npm library -- PocketBase's
// JS hooks run on a sandboxed goja VM that cannot build a real .docx (no
// npm, no zip/deflate bindings). This route is the single public entry
// point: it forwards the request to 127.0.0.1 (never exposed externally)
// and streams the resulting file back to the browser.
//
// IMPORTANT: $http.send()'s response.raw is a JS string decoded as UTF-8,
// which corrupts arbitrary binary bytes. So the Node service returns the
// document as base64 JSON instead, and we decode it back to raw bytes here
// with a plain-JS decoder (goja has no atob/Buffer).
//
// NOTE: PocketBase compiles/executes each hook callback as its own isolated
// "program" -- a helper function declared at file top-level is NOT visible
// inside a routerAdd callback, so the base64 decoder must be nested here.
routerAdd("POST", "/api/docx/generate", (c) => {
  function base64Decode(str) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    var lookup = {}
    for (var i = 0; i < chars.length; i++) lookup[chars[i]] = i
    str = String(str || "").replace(/[\r\n]/g, "").replace(/=+$/, "")
    var bytes = []
    var buffer = 0, bits = 0
    for (var j = 0; j < str.length; j++) {
      var c2 = str[j]
      if (!(c2 in lookup)) continue
      buffer = (buffer << 6) | lookup[c2]
      bits += 6
      if (bits >= 8) {
        bits -= 8
        bytes.push((buffer >> bits) & 0xff)
      }
    }
    return bytes
  }

  const info = $apis.requestInfo(c)

  // Require a logged-in PocketBase user (the Node service additionally
  // re-checks that this user actually owns the requested project).
  if (!info.authRecord) {
    return c.json(401, { error: "Debes iniciar sesion para exportar." })
  }

  const authHeader = c.request().header.get("Authorization")
  // Fixed internal port -- matches DOCX_SERVICE_PORT's default in docx-service/server.js.
  // Both processes run in the same container; this port is never exposed publicly.
  const docxPort = "8091"

  let res
  try {
    res = $http.send({
      url: "http://127.0.0.1:" + docxPort + "/generate",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader || "",
      },
      body: JSON.stringify(info.data),
      timeout: 60,
    })
  } catch (err) {
    return c.json(502, { error: "El servicio de generacion de documentos no esta disponible.", detail: String(err) })
  }

  let parsed
  try {
    parsed = JSON.parse(res.raw)
  } catch (_e) {
    return c.json(502, { error: "Respuesta invalida del servicio de generacion de documentos." })
  }

  if (res.statusCode !== 200 || !parsed.base64) {
    return c.json(res.statusCode || 500, { error: parsed.error || "No se pudo generar el documento." })
  }

  const bytes = base64Decode(parsed.base64)
  const project = (info.data && info.data.project) || {}
  const safeTitle = String(project.title || "tesis").replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "tesis"

  c.response().header().set(
    "Content-Disposition",
    'attachment; filename="' + safeTitle + '.docx"'
  )
  return c.blob(
    200,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes
  )
})
// ── AUTO WORD COUNT al guardar sección ───────────────────────
onRecordBeforeUpdateRequest((e) => {
  const record = e.record
  if (!record) return

  const content = record.get("content")
  if (!content) return

  // Extraer texto del JSON Tiptap y contar palabras
  function extractText(node) {
    let text = ""
    if (node.text) text += node.text + " "
    if (node.content) node.content.forEach(n => { text += extractText(n) })
    return text
  }

  try {
    const doc = typeof content === "string" ? JSON.parse(content) : content
    const text = extractText(doc).trim()
    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0
    record.set("word_count", wordCount)
  } catch (_) {
    // Si el JSON es inválido, no bloquear el guardado
  }
}, "sections")

// ── AUTO SNAPSHOT cada 30 minutos por proyecto ───────────────
// (versión simplificada — en producción puedes usar un cron job)
onRecordAfterUpdateRequest((e) => {
  const section = e.record
  if (!section) return

  const projectId = section.get("project")
  if (!projectId) return

  try {
    // Verificar si hay una versión auto reciente (últimos 30 min)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const recent = $app.dao().findRecordsByFilter(
      "versions",
      `project = '${projectId}' && auto = true && created >= '${thirtyMinAgo}'`,
      "-created",
      1,
      0
    )

    if (recent.length > 0) return // Ya hay snapshot reciente

    // Obtener todas las secciones del proyecto
    const sections = $app.dao().findRecordsByFilter(
      "sections",
      `project = '${projectId}'`,
      "order_index",
      500,
      0
    )

    const snapshot = {}
    sections.forEach(s => {
      snapshot[s.id] = s.get("content")
    })

    // Crear versión automática
    const versionsCol = $app.dao().findCollectionByNameOrId("versions")
    const versionRecord = new Record(versionsCol, {
      project:  projectId,
      label:    `Auto ${new Date().toLocaleString("es-ES")}`,
      snapshot: snapshot,
      auto:     true,
    })
    $app.dao().saveRecord(versionRecord)

    // Limpiar versiones auto antiguas (conservar últimas 10)
    const oldVersions = $app.dao().findRecordsByFilter(
      "versions",
      `project = '${projectId}' && auto = true`,
      "-created",
      100,
      10  // skip first 10 (the most recent)
    )
    oldVersions.forEach(v => {
      try { $app.dao().deleteRecord(v) } catch (_) {}
    })

  } catch (err) {
    // No bloquear el guardado si el snapshot falla
    console.error("Auto-snapshot error:", err)
  }
}, "sections")

// ── ACTUALIZAR word_count del proyecto al guardar sección ─────
onRecordAfterUpdateRequest((e) => {
  const section = e.record
  if (!section) return

  const projectId = section.get("project")
  if (!projectId) return

  try {
    // Sumar palabras de todas las secciones
    const sections = $app.dao().findRecordsByFilter(
      "sections",
      `project = '${projectId}'`,
      "",
      500,
      0
    )

    let total = 0
    sections.forEach(s => { total += (s.get("word_count") || 0) })

    // Actualizar proyecto
    const project = $app.dao().findRecordById("projects", projectId)
    project.set("word_count", total)
    $app.dao().saveRecord(project)
  } catch (_) {}
}, "sections")
