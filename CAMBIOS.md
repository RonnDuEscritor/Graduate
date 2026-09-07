# Correcciones aplicadas - Auditoria Graduate-main(6)

Todos los errores marcados como CRITICO o GRAVE en el informe fueron revisados.
Build verificado: npm ci + tsc --noEmit + npm run build, todos pasan limpio.

## Corregidos en este pase

1. [CRITICO] Paginacion ficticia en el editor (item 1) - EditorPage.tsx
   ahora usa estimatePageRanges() (lib/utils.ts): el numero de pagina de
   cada seccion se calcula por densidad real de palabras/pagina segun la
   norma, no "1 seccion = 1 pagina". Se marca con "~" para indicar que es
   una estimacion, no un conteo exacto.

2. [CRITICO] Paginacion ficticia en el PDF exportado (item 2) -
   ExportPanel.tsx (buildHTMLDoc + buildTOCHTML) usa el mismo estimador,
   tanto en el numero impreso por seccion como en el indice con paginas.
   Nota: el DOCX (generate-docx) ya usaba PageNumber.CURRENT de Word, que
   es 100% real -- no necesitaba este fix.

3. [GRAVE/CRITICO] Validacion academica no distinguia tipo de tesis
   (item 3) - AcademicValidator.tsx ahora tiene 3 sets de reglas
   independientes (Investigacion cientifica / Proyecto tecnico / Revision
   sistematica), elegidas segun project.tipo.

4. [GRAVE] Dos sistemas de estructura de tesis (item 4) -
   lib/tesisStructure.ts (TIPOS_TESIS_EXTENDED) eliminado: no lo importaba
   ningun archivo del proyecto y solo cubria 1 de los 3 tipos de tesis.
   types/index.ts (TIPOS_TESIS + SECTION_GUIDANCE) queda como unica fuente
   de verdad.

5. [GRAVE] Offsets de gramatica podian desalinearse (item 5) -
   grammarPosition.ts: buildOffsetMap() reescrito para replicar el
   algoritmo real de ProseMirror (textBetween/getText), en vez de insertar
   un separador por cada nodo de bloque anidado (listas/tablas generaban
   separadores de mas y el subrayado terminaba en la palabra equivocada).

6. [GRAVE] LanguageTool recibia el texto de la tesis directo desde el
   navegador (item 6) - nueva Edge Function
   supabase/functions/check-grammar/index.ts hace de proxy autenticado
   (limite de longitud + rate-limit basico). useLanguageTool.ts ahora la
   usa en vez de llamar a api.languagetool.org directo, y cancela
   peticiones anteriores con AbortController.

7. [GRAVE] Riesgo en autoguardado al cerrar el navegador (item 7) y
   [GRAVE] sin recuperacion local de emergencia (item 8) -
   lib/localDraftBackup.ts guarda cada cambio en localStorage de forma
   sincronica (antes de que arranque el debounce de 1.5s hacia Supabase).
   store/index.ts limpia el draft local solo cuando Supabase confirma el
   guardado. useProject.ts detecta al abrir un proyecto si hay un draft
   local mas nuevo que lo guardado en el servidor y ofrece restaurarlo.

9. [GRAVE, mitigacion parcial] Citas sin nodo semantico (item 9) - se
   verifico que insertar la misma fuente dos veces en una seccion SI
   inserta el chip de cita en el editor las dos veces (item 10 no se
   reprodujo con el codigo actual). Se agrego data-ref-id al chip de cita
   para trazabilidad futura. El nodo Tiptap semantico real (citation con
   referenceId/page/display) sigue pendiente -- ver seccion "Pendiente".

10. Verificado, no era un bug: la comprobacion alreadyCited solo evita
    duplicar la FILA en la tabla citations (correcto: una referencia debe
    tener una sola fila de bibliografia), pero el chip visual SI se
    inserta cada vez que se hace clic. Reportado como corregido en el
    informe de auditoria pero el codigo actual ya se comporta bien.

## Pendiente (requiere una sesion dedicada, no un parche rapido)

- Paginacion REAL pixel-exacta en el editor (no solo estimada por
  palabras). La auditoria recomienda decidir entre paginacion real del
  editor o convertirlo en editor continuo y dejar la paginacion solo para
  exportacion -- esa decision de arquitectura no se tomo aqui para no
  arriesgar romper el editor sin poder probarlo en vivo.
- Nodo Tiptap semantico para citas (citation { referenceId, page, display })
  en vez de <span> plano -- requiere nuevo Node type + migracion de datos +
  cambios en el export DOCX.
- SECTION_GUIDANCE (types/index.ts) solo tiene sub-items detallados para
  Investigacion cientifica; Proyecto tecnico y Revision sistematica no
  tienen placeholders guiados todavia (la validacion SI ya distingue los
  3 tipos, pero los placeholders de ayuda en el editor no).
- Recuperacion de contrasena (item 11), version UX visible (item 12),
  pruebas automatizadas de integracion (item 16) -- quedan fuera del
  alcance CRITICO/GRAVE marcado para este pase.

## Continuacion (segundo pase)

11. [IMPORTANTE] No existia recuperacion de contrasena (item 11) -
    hooks/useAuth.ts agrega requestPasswordReset() / updatePassword().
    LoginPage.tsx tiene un modo "reset" (enlace "Olvidaste tu contrasena?").
    pages/NewPasswordPage.tsx es la pantalla que se muestra cuando el
    usuario vuelve del enlace que le llega por correo (Supabase dispara el
    evento PASSWORD_RECOVERY, capturado en useAuth y usado en App.tsx para
    mostrar esta pantalla antes que el resto de la app).

Build final verificado de nuevo: tsc --noEmit + npm run build, limpio.

## Tercer pase -- Auditoria de seguimiento (post-recuperacion de contrasena)

Esta auditoria evaluo la version ya corregida y bajo la calificacion a 8.6/10,
senalando 4 puntos como CRITICO/GRAVE restantes. Se corrigieron los 3 que eran
seguros de resolver sin una reescritura de arquitectura del editor:

11. [GRAVE] Sistema de citas no semantico + orden Vancouver no fiel al
    documento (items 2 y 3 de la auditoria) -- esta era la pieza central
    pendiente. Se creo extensions/CitationNode.ts: un Node real de Tiptap
    (no HTML plano) con atributos referenceId/page/display/citationStyle.
    - lib/utils.ts: extractCitationRefIds() escanea el documento y devuelve
      los referenceId realmente presentes, en orden de aparicion real.
    - store/index.ts: syncSectionCitations() reconcilia la tabla
      `citations` contra ese escaneo en cada guardado -- inserta lo nuevo,
      borra lo que ya no esta en el documento, y corrige
      order_of_appearance con la posicion real. El documento pasa a ser la
      unica fuente de verdad; si el usuario borra un chip a mano, la
      siguiente vez que guarda esa referencia deja de figurar como citada.
    - SectionEditor.tsx: registra CitationNode, inserta citas como nodo
      real (insertCitation), y llama a syncSectionCitations en cada guardado
      (solo dispara red si la lista de referencias realmente cambio).
    - ReferencesPanel.tsx: ya no escribe la tabla `citations` a mano; solo
      inserta el nodo en el editor.
    - ExportPanel.tsx y supabase/functions/generate-docx/index.ts: se
      agrego el caso 'citation' en ambos conversores (HTML para PDF, runs
      para DOCX) -- sin este fix las citas habrian desaparecido de ambas
      exportaciones al cambiar el esquema del documento.
    Nota de migracion: documentos guardados ANTES de este cambio tienen las
    citas antiguas como texto plano sin data-ref-id recuperable (el HTML
    viejo no era un nodo real, asi que ese dato nunca se guardo
    estructuralmente). El fix es hacia adelante: las citas nuevas quedan
    correctamente enlazadas; las citas viejas siguen visibles pero no se
    reconocen como nodo hasta que se borran y se vuelven a insertar.

12. [GRAVE] create_project_with_sections() sin validacion server-side
    (item 9) -- supabase/migrations/0002_input_validation.sql agrega
    limites de longitud, tipo/norma validos, y maximo de secciones (200)
    directamente en la funcion SQL, ya que la validacion de frontend puede
    saltarse llamando al RPC directo con un JWT valido.

13. [GRAVE] Rate limit de check-grammar no era real entre instancias
    (item 10) -- supabase/migrations/0003_grammar_throttle.sql crea una
    tabla compartida (grammar_check_throttle) con RLS; check-grammar/index.ts
    ahora consulta y actualiza esa tabla en vez de un Map en memoria que
    solo servia dentro de una misma instancia.

## Pendiente tras este pase (confirmado por la auditoria como fuera de alcance seguro)

- Paginacion 100% real (pixel-exacta) -- sigue siendo estimacion por
  densidad de palabras. La auditoria explicitamente recomienda decidir
  entre editor paginado real vs. editor continuo + paginacion solo en
  export antes de tocar esto, para no arriesgar el editor en vivo.
- PDF generado por el navegador (window.print()), no por un motor PDF
  server-side -- requeriria una arquitectura nueva (Tiptap JSON -> HTML
  controlado -> motor PDF), fuera de alcance de un parche.
- Suite de pruebas automatizadas (unit/integration/E2E) -- el CI solo
  corre tsc + build, no hay Vitest/Playwright todavia.
- TypeScript sigue en "strict": false.
- Deteccion de conflictos entre dispositivos (misma seccion abierta en dos
  lugares a la vez) -- ultima escritura gana, sin optimistic locking.
- Limpieza de referencias historicas (PocketBase/Railway/Render, /api
  localhost, componentes "ai" inexistentes) en README y config.

## Cuarto pase -- Auditoria "Graduate-main-CORREGIDO" (8.4/10)

14. [CRITICO, prioridad MUY ALTA] is_roman nunca se guardaba en la base de
    datos -- create_project_with_sections() insertaba las secciones sin
    ese campo, asi que TODA seccion quedaba con el valor por defecto de la
    columna (false), incluidas las preliminares (portada, dedicatoria,
    indice...) que deberian numerarse en romanos.
    - hooks/useProject.ts ahora envia is_roman (desde fase.isRoman de
      TIPOS_TESIS) por cada seccion en el payload de la RPC.
    - supabase/migrations/0004_is_roman_fix.sql redefine la funcion SQL
      para leer y guardar is_roman (validando que sea booleano), y agrega
      un backfill que corrige los proyectos ya creados antes de este fix,
      identificando las secciones preliminares por nombre.

15. [ALTA] Exportacion DOCX no decodificaba entidades HTML -- las
    referencias bibliograficas pasan por escapeHtml() en el frontend
    (correcto para el PDF, que es HTML real), pero generate-docx tomaba
    ese HTML ya escapado y lo metia literal en el TextRun de Word, asi que
    "Garcia & Lopez" terminaba como "Garcia &amp; Lopez" en el documento
    final. Se agrego decodeHtmlEntities() en
    supabase/functions/generate-docx/index.ts, aplicada antes de crear
    cada TextRun en htmlRefToRuns().

16. [ALTA] Desajuste "Indice" vs "Índice" -- AUTO_IDX en ExportPanel.tsx
    buscaba los nombres de indice CON tilde, pero TIPOS_TESIS
    (types/index.ts) los escribe SIN tilde a proposito (para poder
    pegarse en Notepad sin corromperse). El indice automatico nunca se
    insertaba en el PDF para esas secciones. Corregido quitando las tildes
    del array AUTO_IDX (dos ocurrencias) para que coincida exactamente con
    los nombres reales.

17. [Confirmado, no bloqueante] Condicion de carrera en el throttle de
    LanguageTool -- el SELECT-then-UPSERT anterior dejaba una ventana
    donde dos solicitudes casi simultaneas podian pasar el chequeo antes
    de que cualquiera escribiera. Se reemplazo por
    try_acquire_grammar_throttle() (nueva funcion SQL,
    0005_grammar_throttle_atomic.sql): un solo UPSERT atomico cuya rama de
    UPDATE solo se ejecuta si ya paso suficiente tiempo, sin hueco posible
    entre chequeo y escritura. check-grammar/index.ts ahora llama a esta
    RPC en vez de hacer el select+upsert manual.

18. [MEDIA-ALTA] generate-docx sin limite de payload -- se agregaron
    limites: 25MB de body (chequeado por Content-Length antes de leer el
    request), maximo 300 secciones, y maximo 8MB por imagen embebida en
    base64 (las que excedan ese limite se omiten del documento en vez de
    hacer fallar toda la exportacion).

19. [Documentacion] README y vite.config.ts todavia mencionaban IA/Claude,
    components/ai/ y VITE_ANTHROPIC_KEY (nada de eso existe en esta
    version), y vite.config.ts conservaba el proxy /api hacia
    127.0.0.1:8090 heredado de PocketBase. Se limpiaron ambos archivos y
    se documentaron las migraciones 0002-0005 y la funcion check-grammar,
    que no aparecian en el README.

Build verificado de nuevo: npm ci + tsc --noEmit + npm run build, limpio.

## Pendiente tras este pase (fuera de alcance de un parche, requieren decision de arquitectura)

- Motor bibliografico completo (multiples autores, DOI, URLs, autores
  corporativos, capitulos -- APA 7 real en vez de una aproximacion).
- Paginacion 100% real (pixel-exacta).
- PDF por motor server-side en vez de window.print().
- Suite de pruebas automatizadas (unit/integration/E2E).
- TypeScript en modo strict.
- Lock de creacion en la ruta fallback de SectionEditor (cuando pbIdRef
  todavia no existe) para evitar un doble INSERT si llegan varias
  actualizaciones muy rapido antes de que termine el primer guardado.
- Deteccion de conflictos entre dispositivos (misma seccion abierta en dos
  lugares a la vez).

## Quinto pase -- Auditoria Exhaustiva (9.0/10) -- P0 y P1

### P0

20. [P0 4.2, integridad relacional] citations no garantizaba que
    section/reference pertenecieran al mismo project que la fila de
    citations -- las FK individuales eran validas cada una por separado,
    pero nada impedia mezclar IDs de dos proyectos distintos del mismo
    usuario. supabase/migrations/0006_citations_integrity.sql agrega
    constraints unique en sections(id, project) y bibliography(id,
    project), y luego FKs COMPUESTAS en citations(section, project) ->
    sections(id, project) y citations(reference, project) ->
    bibliography(id, project). Incluye backfill que elimina (si existieran)
    filas previas inconsistentes antes de poder agregar las constraints.

21. [P0 4.4, cobertura bibliografica] Solo libre/APA/Vancouver estaban
    conectados -- IEEE y Chicago ya existian como funciones muertas en
    lib/utils.ts (formatRefIEEE/formatRefChicago) sin que nada las llamara.
    - types/index.ts: NormaType ahora incluye tambien ieee, chicago, mla,
      harvard (7 estilos en total). ISO 690 queda deliberadamente fuera de
      este pase (es una familia de variantes, no un estilo fijo -- merece
      su propia sesion).
    - lib/utils.ts: formatRef() e IEEE/Chicago ahora se usan de verdad;
      se agregaron formatRefMLA y formatRefHarvard. buildCiteText() y el
      resto del codigo que comparaba directo contra 'vancouver'
      (ExportPanel.tsx, useRevision.ts) ahora usan
      NORMAS[norma].citationFormat ('numbered' vs 'author-year'), asi que
      IEEE tambien numera correctamente como Vancouver.
    - Sidebar.tsx y DashboardPage.tsx: el selector de norma paso de pill
      buttons (no escalaban a 7 opciones) a un <select>.
    - Toolbar.tsx: el indicador de norma en la barra de herramientas
      tambien mostraba vacio para cualquier estilo que no fuera apa o
      vancouver; ahora se arma desde NORMAS directamente.
    - supabase/migrations/0007_norma_expansion.sql: redefine
      create_project_with_sections() para aceptar los 7 valores nuevos, y
      agrega un CHECK constraint en projects.norma que antes no existia --
      cambiar la norma de un proyecto YA CREADO (store/index.ts setNorma)
      escribe directo con un UPDATE que nunca pasaba por la RPC ni por
      ninguna validacion.

### P1

22. [P1 item 7] Deteccion de referencias duplicadas usaba autor+año como
    unica clave -- dos articulos distintos del mismo autor en el mismo año
    (algo normal) se marcaban como duplicados. La clave ahora incluye el
    titulo normalizado.

23. [P1 items 4 y 5] TABLE_NO_SOURCE (tabla sin nota de fuente) estaba en
    level:'error' pese a ser una heuristica de texto (busca la palabra
    "nota" en el paragrafo siguiente) vulnerable a falsos positivos y
    negativos. Bajado a 'warning', con mensaje que dice explicitamente que
    puede ser un falso positivo.

24. [P1 item 9] Lookup de DOI llamaba directo a api.crossref.org desde el
    navegador. Nueva Edge Function supabase/functions/lookup-doi/index.ts
    (mismo patron que check-grammar): requiere usuario autenticado, valida
    longitud del DOI, y hace la llamada a CrossRef del lado servidor.
    lib/utils.ts (lookupDOI) ahora llama a esa funcion en vez de a
    CrossRef directo.

25. [P1 item 13] Los borradores locales (localDraftBackup.ts) pueden
    contener contenido inedito de tesis, y nada los limpiaba salvo el
    guardado exitoso de esa seccion puntual -- en un equipo compartido,
    cerrar sesion dejaba todos los borradores en localStorage disponibles
    para el siguiente usuario del navegador.
    - store/index.ts: flushSection/flushPendingSaves ahora devuelven una
      Promise (antes era fire-and-forget) para poder esperar a que
      terminen.
    - hooks/useAuth.ts (signOut): espera flushPendingSaves() (le da a los
      cambios pendientes una oportunidad real de guardarse antes de
      cerrar sesion), limpia TODOS los borradores locales restantes
      (clearAllLocalDrafts, incluye los que hayan fallado por falta de
      conexion -- cerrar sesion es una decision explicita, y el riesgo de
      privacidad de dejar contenido en un equipo compartido pesa mas que
      conservar una copia local a la que el usuario ya no puede acceder
      una vez fuera de sesion), y recien despues llama a
      supabase.auth.signOut().

Build verificado de nuevo: npm ci + tsc --noEmit + npm run build, limpio.

## Pendiente tras este pase

De la lista P0/P1 de esta auditoria, quedaron sin tocar (requieren
arquitectura dedicada, no un parche seguro en esta sesion):

- P0 4.1: certificacion de build en CI real (verificado aqui en el
  sandbox de esta sesion en cada pase, pero la auditoria pide
  especificamente que el propio pipeline de GitHub Actions falle si
  tsc/vite no compilan -- repasar que el workflow existente realmente
  bloquee merges).
- P0 4.3: matriz de trazabilidad academica (Objetivo -> Pregunta/Hipotesis
  -> Variable -> Dimension -> Indicador -> Tecnica -> Instrumento ->
  Resultado -> Conclusion) -- el validador academico actual sigue siendo
  heuristico por busqueda de texto, no una verificacion estructural real.
- P1: reduccion de "any" en zonas sensibles (export DOCX, nodos Tiptap).
- P1: reemplazar alert/confirm por componentes de UI propios (toca muchos
  archivos, riesgo de regresion visual si se apura).
- P1: interfaz completa de versiones (restaurar/comparar/eliminar) --
  saveVersion() existe pero no hay UI para usarlo.
- P1: retry/backoff y estados de sincronizacion mas explicitos en el
  autosave (mas alla de local/enviando/guardado).
- P2 (todos): importacion BibTeX/RIS/CSL, comparacion de versiones,
  onboarding, telemetria, E2E completo -- evolucion de producto, no
  correcciones.

## Sexto pase -- Auditoria "Graduate-main-CORREGIDO" (8.6/10, Auditoria
Exhaustiva 25/08/2026)

Esta auditoria evaluo la version del quinto pase (7 normas + integridad
relacional de citations) y encontro que la propia expansion de normas del
pase anterior quedo incompleta en dos capas que nunca se sincronizaron
contra el frontend: el CSS del editor y el exportador DOCX. Se corrigieron
los 3 hallazgos P0 que son seguros de resolver sin tocar arquitectura, mas
2 hallazgos P1 con impacto real y acotado.

### P0

26. [P0 4.1, CRITICO] generate-docx solo tenia definidas 3 de las 7 normas
    (libre/apa/vancouver) -- resolveNorma() caia en silencio a
    NORMAS.libre para ieee/chicago/mla/harvard, asi que elegir cualquiera
    de esos 4 estilos en la UI exportaba un DOCX con la tipografia,
    tamano, interlineado y alineacion de Libre en vez del estilo
    realmente seleccionado. supabase/functions/generate-docx/index.ts:
    NORMAS ahora define los 7 estilos, con los mismos valores que
    frontend/src/types/index.ts (convertidos a las unidades que usa
    docx.js: pt -> medios puntos, 'justify'/'left' ->
    AlignmentType.JUSTIFIED/LEFT).

27. [P0 4.2, GRAVE] index.css no tenia reglas para .norma-mla ni
    .norma-harvard (NORMAS si declara esos cssClass) -- elegir MLA o
    Harvard en el editor no cambiaba nada visualmente. Ademas
    .norma-ieee tenia line-height:1.15 en el CSS mientras
    NORMAS.ieee.lineHeight declara 1.5 -- la misma norma con dos valores
    distintos segun que archivo se leyera. Se agregaron .norma-mla /
    .norma-harvard y se corrigio .norma-ieee a 1.5 para que cada clase
    sea un espejo exacto de su NormaConfig.

    Nota sobre el item 4 de esta seccion de la auditoria (arquitectura de
    paginacion real vs. estimada): se revisa y se mantiene la misma
    decision que las cinco auditorias anteriores -- pasar de estimacion
    por palabras a paginacion pixel-exacta requiere medir el DOM en vivo
    o migrar a un motor PDF server-side, ninguno de los dos es seguro de
    intentar como parche ciego en una sesion sin poder probarlo
    interactivamente. Sigue pendiente, ver lista de pendientes.

### P1

28. [P1 5.1, GRAVE] El backfill de is_roman (0004_is_roman_fix.sql)
    buscaba nombres de seccion como 'Portada', 'Resumen', 'Abstract' que
    ya no existen tal cual en TIPOS_TESIS (ahora son 'Portada oficial',
    'Resumen / Abstract', etc.), y nunca cubrio los nombres de tipo 1
    ('Proyecto factible / tecnico') ni tipo 2 ('Revision sistematica /
    documental'), solo los de tipo 0. supabase/migrations/0008_audit_
    followup.sql agrega un backfill nuevo, consciente del tipo de tesis
    de cada proyecto (join sections -> projects por p.tipo), que compara
    contra la lista real de items preliminares de cada uno de los 3
    tipos; conserva ademas la lista original de 0004 como union por si
    quedara alguna seccion con un nombre aun mas antiguo.

29. [P1 5.6, GRAVE] syncSectionCitations() (store/index.ts) decidia
    INSERT vs UPDATE mirando el array `citations` en memoria del store,
    no la base de datos -- si dos guardados caian muy seguidos antes de
    que la respuesta del primer INSERT actualizara ese estado local,
    ambos podian creer que no existia fila para esa referencia e
    insertar dos veces la misma (section, reference). 0008_audit_
    followup.sql agrega constraint UNIQUE(section, reference) en
    citations (con dedup previo de filas ya duplicadas, conservando la
    mas antigua por seccion+referencia). store/index.ts ahora usa
    .upsert(..., { onConflict: 'section,reference' }) en vez de
    .insert(), asi que aunque el estado local este desactualizado, la
    segunda escritura de una carrera se resuelve como UPDATE atomico en
    la base de datos en lugar de duplicar la fila.

30. [Documentacion] README.md (tep/README.md) no listaba las migraciones
    0006, 0007, 0008 ni la Edge Function lookup-doi (existente desde el
    quinto pase pero nunca documentada). Se actualizo el arbol de
    supabase/ y el paso a paso de deploy manual via dashboard.

Build verificado de nuevo: npm ci + tsc --noEmit + npm run build, limpio.

## Pendiente tras este pase (confirmado, requiere sesion dedicada o
arquitectura)

De la lista P0/P1 de la auditoria "Exhaustiva" (25/08/2026), quedan sin
tocar en este pase:

- P0 4.3 (arquitectura de paginacion real): ver nota en el item 27 de
  arriba -- decision recurrente en todas las auditorias, todavia
  pendiente de una sesion dedicada a medicion de DOM o motor PDF
  server-side.
- P1 7.2/9 (exportacion DOCX reconstruida server-side desde la DB en vez
  de confiar en el payload del cliente): el generate-docx actual valida
  ownership del projectId pero arma el documento con el contenido que
  envia el cliente, no releyendo sections/bibliography/citations desde
  Supabase. Resolverlo bien implica portar el motor completo de
  formatRef() (7 normas x 5 tipos de referencia, ~150 lineas en
  lib/utils.ts) al Edge Function -- una funcion sin build/test loop
  local en este entorno (se pega directo en el dashboard de Supabase) --
  lo que la vuelve una funcion sensible para tocar a ciegas sin poder
  desplegarla y probarla de verdad. Queda para una sesion dedicada solo a
  esto.
- P1 5.4 (Vitest/Playwright), P1 5.5 (strict=true progresivo), P1 5.3
  (validador academico estructural real), P1 6.6 (optimistic
  locking/control de conflictos), P1 6.5 (retry/backoff robusto): mismos
  motivos que en pases anteriores -- requieren diseno propio, no un
  parche de una sesion.
- Menores: alert()/confirm() nativos (6.2), reduccion de any en
  generate-docx (6.3), estados de sincronizacion mas granulares (6.4),
  interfaz completa de versiones (6.7), projectId/ownership explicito en
  check-grammar (7.3).

## Septimo pase -- Auditoria "Graduate-main-CORREGIDO" (files1, 26/08/2026)

Esta auditoria evaluo el sexto pase y encontro que la sincronizacion de
normas (P0 4.1/4.2 del pase anterior) habia quedado bien resuelta, pero
detecto que la propia expansion a 7 normas del quinto pase nunca conecto
`isRoman` -- ya presente en la base de datos y en `TIPOS_TESIS` desde
siempre -- con el payload que llega a `generate-docx`, y que el lock de
creacion de secciones virtuales seguia pendiente desde el cuarto pase
(estaba en la lista de "Pendiente", nunca llego a implementarse). Al
verificar la correccion del primer hallazgo generando un DOCX real de
prueba (ver metodo abajo) aparecio ademas un tercer bug que ninguna
auditoria anterior habia senalado: un encabezado "Referencias
bibliograficas" duplicado en ambos exportadores.

### P0

31. [P0 4.1, CRITICO] `generate-docx` nunca supo que una seccion era
    preliminar: el payload que arma `ExportPanel.tsx` (`buildDocxPayload`)
    no incluia el campo `isRoman`, asi que TODAS las secciones -- portada
    oficial, aprobacion del jurado, dedicatoria, resumen/abstract,
    palabras clave incluidas -- caian en el unico Word Section arabigo
    junto con los capitulos reales, mezcladas y mal numeradas, aunque
    `sections.is_roman` ya estuviera correcto en la base de datos desde el
    backfill del sexto pase. Se agrego `isRoman: fase.isRoman` al payload
    (`ExportPanel.tsx`) y `buildDocx()` (`generate-docx/index.ts`) ahora
    separa las secciones en dos grupos reales: las preliminares (roman,
    excluyendo los indices automaticos que ya cubre el campo TOC de Word)
    se agregan al mismo Word Section romano que ya existia para el indice;
    el resto sigue fluyendo al Word Section arabigo. Payloads viejos sin
    el campo (`isRoman` ausente) siguen degradando al comportamiento
    anterior en vez de romper -- no es un cambio disruptivo.

    Verificacion real (no solo lectura de codigo): se armo un arnes fuera
    de Deno (`docx@9.7.1` instalado via npm, TypeScript compilado con
    `tsc` en modo suelto) para poder ejecutar `buildDocx()` de verdad con
    un payload sintetico de una tesis tipo 0 completa (7 preliminares + 4
    capitulos + anexos), generar el .docx, convertirlo a PDF con
    LibreOffice headless y rasterizar cada pagina para inspeccion visual.
    Confirmado: portada sin numero visible -> preliminares con numeros
    romanos reales (i, ii... vi) incluyendo el contenido real que el
    usuario escribio en "Portada oficial" (antes se hubiera perdido/
    duplicado) -> cuerpo con numeros arabigos empezando en 1.

32. [Hallazgo propio, no listado por la auditoria] Al verificar el punto
    31 generando el DOCX de prueba goteo un tercer bug real: `TIPOS_TESIS`
    siempre incluye "Referencias bibliograficas" como una seccion
    editable normal, pero la bibliografia real (formateada por norma, en
    orden de cita) siempre se agrega aparte via `referencesHtml`/
    `citedRefs` -- el contenido propio de esa seccion nunca se usa. Si el
    usuario alguna vez escribia algo ahi (o el placeholder "Sin
    contenido." simplemente se imprimia), el DOCX y el PDF mostraban DOS
    encabezados "Referencias bibliograficas" seguidos: uno con lo que
    fuera que tuviera esa seccion, y otro con la lista real generada.
    Se excluyo ese item por nombre (`AUTO_BIBLIO`) tanto en
    `buildHTMLDoc` como en `buildDocxPayload` (`ExportPanel.tsx`), del
    mismo modo que ya se excluian los indices automaticos (`AUTO_IDX`).
    Confirmado visualmente en el mismo render de prueba: un solo
    encabezado, con la lista real.

### P1

33. [P1 5.1, GRAVE] `SectionEditor.tsx` seguia sin el lock de creacion
    que la lista de pendientes del cuarto pase ya habia identificado:
    `handleSave` disparaba un INSERT cada vez que `pbIdRef.current` era
    null, y como Tiptap dispara `onUpdate` en cada tecla, varias llamadas
    concurrentes podian ver `pbIdRef.current` en null a la vez (ninguna
    habia recibido aun la respuesta de la primera) e insertar filas
    duplicadas para lo que el usuario percibe como una sola seccion
    virtual. Se agrego `creatingRef` (una promesa compartida de creacion
    en curso): toda llamada concurrente espera la MISMA peticion en vez
    de iniciar una nueva, y `pbIdRef.current` se fija una sola vez cuando
    esa unica peticion resuelve.

34. [Documentacion] `tep/README.md` no documentaba las variables de
    entorno que realmente usan las Edge Functions (se inyectan solas via
    Supabase, no requieren `.env` propio ni configuracion de CORS manual
    -- `withSupabase()` resuelve ambas cosas), ni el orden obligatorio de
    aplicacion de las migraciones (estan numeradas y varias redefinen
    `create_project_with_sections()` sobre la version anterior via
    `create or replace function`, asi que aplicarlas fuera de orden deja
    el RPC con una validacion vieja), ni que no existen migraciones
    `down` (el camino seguro para revertir algo en produccion es una
    migracion nueva que deshaga el cambio puntual, nunca editar un
    archivo ya aplicado). Se agrego todo eso mas una checklist corta
    antes de pasar a produccion.

Build verificado de nuevo: npm ci + tsc --noEmit + npm run build, limpio.
Ademas, a diferencia de los pases anteriores, el cambio central (P0 4.1)
se verifico generando y renderizando un DOCX real, no solo revisando que
compile -- ver metodo en el item 31.

## Pendiente tras este pase (confirmado, requiere sesion dedicada o
arquitectura)

De la lista P0/P1 de la auditoria "files1" (26/08/2026), quedan sin tocar
en este pase, por los mismos motivos que en el sexto pase (ver arriba):

- Paginacion 100% real pixel-exacta (arquitectura de medicion de DOM o
  motor PDF server-side).
- Exportacion DOCX/PDF reconstruida server-side desde la base de datos en
  vez de confiar en el payload del cliente -- requiere portar el motor
  completo de `formatRef()` a la Edge Function, sin loop de build/test
  local en este entorno.
- Suite de pruebas automatizadas, `strict: true` progresivo, validador
  academico estructural real, optimistic locking/control de conflictos
  entre dispositivos, retry/backoff robusto en el autosave.
- Menores: alert()/confirm() nativos, reduccion de `any` en
  `generate-docx`, interfaz completa de versiones, projectId/ownership
  explicito en `check-grammar`.

## Octavo pase -- Auditoria "Graduate-main-CORREGIDO" (files2, 27/08/2026)

Esta auditoria confirmo las tres mejoras del septimo pase (lock de
creacion, separacion romano/arabigo, dedup de referencias) y encontro dos
hallazgos P0 nuevos en la interaccion entre `TIPOS_TESIS`, `ExportPanel` y
`generate-docx` que ninguna auditoria anterior habia detectado: doble
portada, e indices de tablas/figuras/cuadros mostrando el indice general
en vez del indice especifico.

### P0

35. [P0 4.1, CRITICO -- doble portada] Arreglar `isRoman` en el septimo
    pase tuvo un efecto secundario no previsto: al volverse preliminar de
    verdad, "Portada oficial" (o "Portada, aprobacion, dedicatoria" en
    tipo 1/2) empezo a renderizarse como una pagina romana normal, ADEMAS
    de `coverSection()`, que siempre genera su propia portada automatica
    desde `project.title/author/institution`. Resultado: dos portadas --
    la automatica y la editable, ambas presentes -- o, si el usuario nunca
    escribio nada ahi, una pagina vacia extra con "Portada oficial" y "Sin
    contenido." en medio del documento. Mismo problema en el PDF
    (`buildHTMLDoc`).

    Corregido siguiendo la Opcion A recomendada por la auditoria: la
    seccion "Portada oficial" ES la portada real cuando tiene contenido
    real (`hasRealTiptapContent()`/`hasRealContent()`, nuevo helper
    espejado en frontend y en `generate-docx` -- ver comentario ahi sobre
    por que este espejo puntual no arrastra el mismo riesgo de
    desincronizacion que `NORMAS`); la portada automatica por metadata
    queda solo como respaldo para un proyecto todavia vacio. En cualquiera
    de los dos casos, esa seccion nunca se vuelve a renderizar una segunda
    vez como pagina preliminar ordinaria. `coverSectionFromContent()`
    nuevo en `generate-docx/index.ts`; misma logica en `buildHTMLDoc`
    (PDF) via `coverHTML`.

36. [P0 4.2, CRITICO -- indices especificos incorrectos] `AUTO_IDX`
    trataba "Indice de tablas", "Indice de figuras", "Indice de tablas y
    figuras" y "Indice de cuadros comparativos" igual que "Indice
    general": los cuatro llamaban al mismo generador de indice de
    capitulos (`buildTOCHTML` en PDF; simplemente se omitian sin
    reemplazo en DOCX). Un usuario buscando la lista de tablas de su tesis
    recibia la lista de capitulos, o nada.

    El editor no tiene un sistema de captions/numeracion de tablas y
    figuras (eso es una funcionalidad real y separada, ver pendientes),
    pero sin inventar ese subsistema completo se puede igual recorrer el
    documento real y reportar las tablas/imagenes que existen de verdad,
    en el orden en que aparecen, en vez de sustituir silenciosamente la
    lista equivocada. Se agregaron `hasRealTiptapContent`,
    `collectCaptionedItems` y `collectCaptionedItemsMixed` en
    `lib/utils.ts` (frontend, unica fuente de verdad para PDF Y DOCX --
    ver nota abajo sobre por que se centralizo ahi) que recorren el JSON
    de Tiptap real y devuelven "Tabla 1", "Figura 1", etc. en orden de
    documento, con la etiqueta de pagina estimada de la seccion donde
    aparecen. "Indice de cuadros comparativos" (tipo 2) reusa la deteccion
    de tablas, etiquetado como "Cuadro". "Indice general" sigue siendo el
    unico caso especial: usa el campo TOC real de Word (heading-based) en
    vez de una lista de captions.

    Refactor de paso: `buildHTMLDoc` y `buildDocxPayload` (ambos en
    `ExportPanel.tsx`) tenian cada uno su propia copia de `AUTO_IDX` /
    `AUTO_BIBLIO` y su propio calculo de paginas -- exactamente el patron
    de duplicacion que causo los bugs de `isRoman` y CSS de MLA/Harvard en
    auditorias anteriores. Se extrajo `buildSectionIndexModel()` (modulo,
    no componente) como el UNICO lugar que decide cual seccion es la
    portada, las etiquetas de pagina y el inventario de tablas/figuras;
    ambos exportadores lo llaman y ninguno vuelve a calcularlo por su
    cuenta.

    Hallazgo adicional durante esta correccion (P1 5.3 de la auditoria,
    "el TOC de Word puede incluir preliminares"): confirmado en el
    codigo -- `preliminaryChildren` usaba `heading: HeadingLevel.HEADING_1`
    para "Aprobacion del jurado", "Dedicatoria...", etc., y
    `TableOfContents` tiene `headingStyleRange: '1-3'`, asi que esos
    titulos preliminares se listaban dentro de "Indice general" junto a
    los capitulos reales. Se agrego un estilo de parrafo propio,
    `PreliminaryTitle` (visualmente identico a Heading 1: misma
    tipografia, tamano, color y espaciado, ver `buildStyles()`), que el
    campo TOC de Word no recorre por no ser uno de sus estilos
    integrados -- el titulo preliminar se ve igual, pero ya no aparece
    dentro del indice general.

Verificacion real, no solo lectura de codigo ni compilacion: se re-uso el
arnes del septimo pase (docx@9.7.1 fuera de Deno) con un payload sintetico
que incluye portada con contenido real, una tabla y una imagen reales en
el cuerpo, e indices de tablas/figuras con `captionIndex` precalculado
como lo haria el frontend. Render a PDF vía LibreOffice headless,
inspeccionado pagina por pagina: una sola portada (la del usuario, sin
numero visible) -> preliminares en romano sin duplicar la portada ->
"Indice de tablas" mostrando "Tabla 1 -- 1" (no el indice de capitulos) ->
"Indice de figuras" mostrando "Figura 1 -- 2" -> cuerpo arabigo desde 1
con la tabla y la imagen reales -> una sola "Referencias bibliograficas".

Build verificado de nuevo: npm ci + tsc --noEmit + npm run build, limpio.

## Pendiente tras este pase (confirmado, requiere sesion dedicada o
arquitectura)

De la lista P0/P1 de la auditoria "files2" (27/08/2026), quedan sin tocar
en este pase:

- P1 5.2 / P2 14 (sistema real de captions y numeracion de tablas/figuras
  -- nodos `TableCaption`/`FigureCaption` en Tiptap, numeracion automatica,
  referencias cruzadas): la correccion de este pase (items 35-36) resuelve
  el bug concreto -- ya no se muestra la lista equivocada -- pero sigue
  sin ser un indice academico completo con captions reales escritas por el
  usuario ("Tabla 1: Distribucion de la muestra"), solo una enumeracion
  posicional. Construir el subsistema de captions es una funcionalidad
  nueva de por si, no un parche.
- P0 4.3/P1 6 (exportacion DOCX/PDF reconstruida server-side desde la base
  de datos en vez de confiar en el payload del cliente): mismo motivo que
  en el septimo pase -- requiere portar el motor completo de `formatRef()`
  a la Edge Function, sin loop de build/test local en este entorno.
- P0 4.4/P1 (paginacion 100% real pixel-exacta): mismo motivo que en todos
  los pases anteriores -- arquitectura de medicion de DOM o motor PDF
  server-side.
- P1 5.6 (PDF server-side, Chromium en vez de `window.print()`), suite de
  pruebas automatizadas, `strict: true` progresivo, optimistic
  locking/control de conflictos entre dispositivos, retry/backoff robusto.
- Menores: alert()/confirm() nativos, ESLint, control de tamano/
  compresion de imagenes en el frontend, reduccion de `any` en
  `generate-docx`, interfaz completa de versiones.

## Noveno pase -- Auditoria "Graduate-main-CORREGIDO" (files4, 31/08/2026)

Esta auditoria confirmo las nueve correcciones del octavo pase (doble
portada, separacion romano/arabigo, PreliminaryTitle fuera del TOC,
referencias sin duplicar, indices especificos correctos, lock de
creacion, siete normas, integridad de citas, throttle atomico) sin
regresiones, y aporto una calificacion global de 8.9/10 con veredicto
"apta para preproduccion/beta, no todavia version final". Encontro dos
hallazgos P0 nuevos y confirmables en el codigo (no arquitectonicos) mas
dos P1 tambien confirmables; el resto de su lista P0 (exportacion
reconstruida desde la DB, paginacion pixel-exacta) y P1 (captions reales,
referencias cruzadas, tests, optimistic locking, retry/backoff, strict
mode) repite exactamente lo que ya viene quedando pendiente y documentado
desde el septimo/octavo pase por los mismos motivos de arquitectura --
ver la lista de pendientes debajo, no se repiten aqui.

### P0

37. [P0 4.1, CRITICO] El indice general del PDF (entonces `buildTOCHTML`,
    ahora `buildGeneralTOC`) listaba TODOS los items de TODAS las fases
    sin ninguna exclusion -- portada, el propio "Indice general" listado
    dentro de si mismo, "Indice de tablas", "Indice de figuras", etc.,
    todos aparecian como si fueran capitulos normales. El DOCX no tenia
    este problema (su campo TOC real de Word es heading-based, y desde el
    octavo pase los titulos preliminares usan el estilo `PreliminaryTitle`
    en vez de Heading 1-3, asi que Word ya los excluye estructuralmente).
    `buildGeneralTOC()` ahora excluye explicitamente `AUTO_PORTADA` y
    `AUTO_IDX` (que incluye al propio "Indice general") de la lista que
    construye, dejando solo los items preliminares editables reales
    (aprobacion, dedicatoria, resumen, palabras clave) y los items de
    cuerpo/fase final (capitulos, conclusiones, referencias, anexos) -- lo
    que corresponde a un indice academico real.

### P1

38. [P1 5.1, GRAVE] `syncSectionCitations()` calculaba
    `sectionOrderIndex` con `sections.find(s => s.id === sectionId)?.
    order_index ?? 9999`. Una seccion creada por el fallback de
    `SectionEditor` (`ensureSectionId`) actualiza `pbIdRef.current`
    localmente pero nunca se agrega al array `sections` del store, asi
    que esa busqueda podia fallar y caer al `9999` de respaldo --
    `order_of_appearance` terminaba en ~9999*10000+posicion, muy lejos de
    su posicion real de lectura, descolocando la numeracion Vancouver/IEEE
    de las citas de esa seccion. `SectionEditor` ya recibe `orderIndex`
    como prop (viene de `EditorPage`, siempre correcto incluso antes de
    que la seccion exista en el store); ahora lo pasa directo a
    `syncSectionCitations(id, refIds, orderIndex)` como
    `orderIndexHint`, que tiene prioridad sobre la busqueda en
    `sections`, la cual queda solo como respaldo para otros llamadores
    futuros.

39. [P1 5.10, GRAVE] `setNorma()` disparaba un UPDATE a Supabase de
    inmediato en cada llamada, sin ningun tipo de secuenciacion. Si el
    usuario cambiaba de norma rapido (APA -> IEEE -> MLA), cada llamada
    iniciaba su propia peticion de red independiente, y nada garantizaba
    que las respuestas llegaran en el mismo orden en que se enviaron -- si
    la respuesta de una seleccion vieja llegaba despues que la de la
    final, la base de datos quedaba con una norma desactualizada
    respecto a lo que el usuario realmente eligio, sin ningun error
    visible. Se agrego un debounce de 400ms a la escritura de red (mismo
    patron que el autoguardado por seccion): una rafaga de clics rapidos
    ahora solo envia UNA peticion, la de la norma en la que el usuario se
    quedo -- no queda nada que competir en orden de llegada.

40. [P1 5.5, GRAVE] `collectCaptionedItems`/`collectCaptionedItemsMixed`
    asociaban cada tabla/figura encontrada con el label de pagina
    COMPLETO de su seccion -- si una seccion de varias paginas tenia
    Tabla 1, Tabla 2 y Tabla 3, las tres mostraban el mismo rango
    ("10-13"), en vez de una pagina mas especifica cada una. Sin
    arquitectura de medicion de DOM (fuera de alcance, ver pendientes),
    se agrego una interpolacion honesta: cada item ahora sabe cuantas
    palabras de la seccion lo preceden (`wordsBefore`) y el total de
    palabras de esa seccion (`sectionWordCount`); `interpolatedPageLabel()`
    nuevo en `lib/utils.ts` ubica el item proporcionalmente dentro del
    rango ya estimado de su seccion (ej. una tabla a mitad del texto de
    una seccion 10-13 ahora marca "12", no "10-13" para las tres). Sigue
    siendo una estimacion (no una pagina fisica real), pero ya no repite
    ciegamente el mismo numero para varios elementos distintos. Verificado
    con una prueba aislada de la formula (valores de entrada/salida
    esperados coinciden) ademas de la verificacion de build completa.

Build verificado de nuevo: npm ci + tsc --noEmit + npm run build, limpio.

## Pendiente tras este pase (confirmado, requiere sesion dedicada o
arquitectura)

De la lista P0/P1 de la auditoria "files4" (31/08/2026), quedan sin tocar
en este pase, por los mismos motivos que en los pases anteriores (ver
arriba):

- P0 4.2 (exportacion DOCX/PDF reconstruida server-side desde la base de
  datos en vez de confiar en el payload del cliente): requiere portar el
  motor completo de `formatRef()` a la Edge Function, sin loop de
  build/test local en este entorno.
- P0 4.3 (paginacion 100% real, fisica): arquitectura de medicion de DOM
  o motor PDF server-side (Chromium/Playwright, como sugiere la propia
  auditoria en su Fase 4). La auditoria misma recomienda NO invertir en
  falsa precision en el editor y concentrar el esfuerzo en el motor de
  exportacion -- el item 40 de este pase (interpolacion por item) ya va
  en esa direccion sin requerir la arquitectura completa.
- P1 (captions reales -- `TableCaption`/`FigureCaption` con numero,
  titulo, nota y fuente; referencias cruzadas tipo "ver Tabla 4"; nodo o
  atributo especifico para diferenciar cuadro comparativo de tabla
  estadistica): funcionalidad nueva, no un parche.
- P1 (optimistic locking/revision entre pestanas o dispositivos,
  retry/backoff con cola robusta y estado offline, validador academico
  estructural con matriz de trazabilidad, suite de tests unitarios/E2E,
  `strict: true` progresivo, PDF server-side).
- P2: alert()/confirm() nativos, ESLint en CI, auditoria de dependencias
  (npm audit/Dependabot), historial de versiones completo (listar/
  comparar/restaurar), BibTeX/RIS/CSL/ISO 690, compresion de imagenes,
  limpieza de drafts locales huerfanos al eliminar un proyecto,
  projectId explicito en check-grammar.

## Decimo pase -- Auditoria "Exhaustiva" (Graduate-main, 31/08/2026)

Esta auditoria fue mas amplia que las anteriores: 5 hallazgos CRITICO (C-01
a C-05) y 14 GRAVE (G-01 a G-14), calificacion 82/100 ("apta para
preproduccion/beta"). Antes de tocar codigo se verifico contra el arbol de
archivos real de este proyecto (el que se ha venido corrigiendo desde el
sexto pase) cuales hallazgos correspondian a codigo que existe aqui, y
cuales correspondian a archivos que -- igual que `pb.ts` (ver conversacion
del 31/08) -- viven en el repo de GitHub del usuario pero nunca fueron
parte de ningun zip subido para su correccion:

- **No existen en este arbol** (por lo tanto no se pudieron corregir aqui,
  se le indico al usuario tratarlos igual que `pb.ts`): C-02 (arquitectura
  PocketBase / `render.yaml` / `tep/backend/`), G-11 (`.env.example` --
  de hecho SI existe y esta correcto en este arbol), G-12 (`useAI.ts`,
  `AIPanel.tsx`, `VITE_ANTHROPIC_KEY`), M-04/M-05 (`TIPOS_TESIS_EXTENDED`
  y otro codigo muerto senalado). Confirmado con `grep -rl` sobre todo el
  arbol: cero coincidencias.

De los hallazgos que SI aplican a este codigo, se corrigieron los que son
parches acotados y verificables sin inventar arquitectura nueva:

### Verificacion con PostgreSQL real

Por primera vez en estos pases se instalo PostgreSQL 16 localmente para
probar las migraciones SQL contra una base de datos de verdad en vez de
solo revisar la sintaxis a ojo -- lo cual encontro un bug real en mi
propio primer intento de esta migracion (ver item G-04 abajo: el operador
jsonpath `$.**` de Postgres duplica coincidencias). Las 9 migraciones
anteriores tambien se corrieron en secuencia completa contra Postgres
limpio para confirmar que ninguna quedo rota por los pases anteriores.

### Criticos (parcial, ver justificacion de alcance en cada uno)

41. [C-01, CRITICO -- parcial] generate-docx confiaba completamente en
    `payload.project` (title/author/institution/year/norma) para el
    contenido de la portada y el encabezado del DOCX exportado -- un
    llamador autenticado podia exportar un documento cuya portada dijera
    cualquier cosa, sin relacion con lo guardado realmente en su
    proyecto. Ahora el handler HTTP hace `select('id, title, author,
    institution, year, norma')` sobre `projects` (ya filtrado por RLS a
    traves de `ctx.supabase`) y usa esos valores para sobreescribir
    `payload.project`, sin importar que haya mandado el cliente.
    Reconstruir tambien el CONTENIDO (secciones, citas, bibliografia)
    100% desde la base de datos -- en vez del payload del cliente --
    sigue fuera de alcance: implica portar el motor completo de
    `formatRef()` (~150 lineas) a esta funcion, y este entorno no tiene
    acceso de red a un proyecto Supabase real para probar esas consultas
    en vivo antes de desplegarlas -- ver item 9 del septimo pase, mismo
    motivo, todavia vigente.

42. [C-03/G-02, CRITICO/GRAVE] `ProgressPanel.tsx` tenia una sola lista
    `ACADEMIC_CHECKLIST` codificada con los nombres de capitulo del tipo 0
    unicamente ('Cap. I -- El problema', 'Cap. II -- Marco teorico', ...).
    TIPOS_TESIS (types/index.ts) le da al tipo 1 ('Proyecto factible /
    tecnico') y al tipo 2 ('Revision sistematica / documental') sus
    propios capitulos con nombres distintos ('Cap. I -- Diagnostico de la
    necesidad', 'Cap. I -- Justificacion y alcance critico', etc.) -- para
    esos dos tipos NINGUN item de la checklist podia encontrar su seccion
    real, asi que el progreso quedaba trabado mostrando todo incompleto
    sin importar cuanto escribiera el usuario. Se agrego
    `ACADEMIC_CHECKLIST_BY_TIPO`, una checklist propia por tipo con los
    nombres de capitulo reales de cada uno. De paso, el consejo de texto
    al final del panel (tambien codificado con vocabulario del tipo 0,
    "completa la metodologia y el marco teorico") ahora senala
    dinamicamente el proximo item real de la checklist en vez de un texto
    fijo.

### Graves

43. [G-04, GRAVE] `sections.word_count` era lo que el cliente mandara
    junto al contenido en el mismo UPDATE, sin nada que lo recalculara
    server-side -- y `projects.word_count` (usado para el progreso y las
    paginas estimadas) es solo la SUMA de esos valores, asi que un valor
    mentiroso se propagaba directo a las estimaciones de pagina y
    progreso. Nueva migracion `0009_word_count_and_checks.sql`:
    `count_tiptap_words()` recorre el JSON de Tiptap recursivamente
    (mismo algoritmo que `countWords()` del frontend) y un trigger
    `before insert or update of content` en `sections` recalcula
    `word_count` siempre, ignorando lo que mande el cliente. Verificado
    de punta a punta contra Postgres real: se creo un proyecto via el RPC
    real, se guardo una seccion con `word_count: 99999` (mentira) junto a
    contenido real de 5 palabras, y el trigger la corrigio a 5; tambien se
    probo con listas anidadas, blockquotes, texto con negrita/cursiva,
    contenido vacio y null.

    Nota tecnica: el primer intento de esta funcion uso el operador
    recursivo de jsonpath de Postgres (`$.**.text`), que resulto duplicar
    cada coincidencia (una seccion de 12 palabras se contaba como 24) --
    un problema real de ese operador, no hipotetico, que solo goteo al
    probar contra Postgres de verdad. Se reemplazo por una funcion
    PL/pgSQL recursiva explicita que visita cada nodo una sola vez.

44. [G-03, GRAVE] `create_project_with_sections()` valida que `p_tipo` sea
    0, 1 o 2, pero esa validacion solo cubre el RPC -- la politica RLS
    "projects_all_own" permite que el dueño escriba la fila `projects`
    directamente (necesario para renombrar el proyecto o cambiar de
    norma), y nada a nivel de columna impedia mandar cualquier otro
    smallint ahi. `TIPOS_TESIS[tipo]` es un arreglo de longitud fija; un
    valor fuera de rango resuelve a `undefined` y rompe el editor, la
    exportacion y el panel de progreso en cualquier lugar que lea
    `TIPOS_TESIS[project.tipo]`. Se agrego `projects_tipo_check CHECK
    (tipo in (0,1,2))` en la misma migracion 0009. Probado contra
    Postgres real: `UPDATE projects SET tipo = 7` se rechaza con el error
    de constraint esperado.

45. [G-06, GRAVE] `check-grammar` verificaba que el llamador estuviera
    autenticado, pero nunca a que proyecto pertenecia el texto que
    mandaba -- cualquier usuario logueado podia usarlo como proxy general
    hacia LanguageTool con texto arbitrario, sin relacion con sus propios
    proyectos. `projectId` ahora es requerido en el payload y se verifica
    contra `projects` a traves de `ctx.supabase` (que ya trae el JWT del
    llamador, asi que la politica RLS "projects_all_own" filtra sola --
    si la fila no vuelve, el proyecto no existe o no es del llamador, y
    se rechaza antes de tocar LanguageTool). `useLanguageTool.ts` y los
    dos call-sites en `SectionEditor.tsx` (autoguardado + "Revisar ahora")
    ahora mandan `projectId`.

46. [G-13, GRAVE] `dataUriToImageRun()` forzaba TODA imagen insertada a
    `{ width: 420, height: 280 }` sin mirar sus dimensiones reales --
    cualquier imagen que no fuera cercana a esa proporcion 1.5:1 salia
    visiblemente deformada en el DOCX exportado (una captura ancha
    aplastada, una foto vertical estirada). Se agregaron parsers manuales
    de encabezado para los 4 formatos que ya acepta esta funcion (PNG,
    JPEG, GIF, WEBP -- sin libreria externa, este archivo es
    autocontenido a proposito) que leen el ancho/alto real de los bytes
    de la imagen, y la imagen se escala para caber en una caja maxima de
    420x420 preservando su proporcion real, sin agrandar nunca mas alla
    de su tamano original. Verificado generando 5 imagenes reales con
    Pillow (ancha 800x200, alta 200x600, cuadrada 300x300, pequena
    150x100, grande cuadrada 1000x1000), confirmando que
    `getImageDimensions()` lee las dimensiones exactas de cada formato, y
    renderizando el DOCX resultante a PDF: la ancha se ve ancha, la alta
    se ve alta, la pequena no se agranda, la grande se reduce mantenimiento
    su forma cuadrada -- ninguna sale deformada.

### Honestidad de etiquetado (C-04/C-05, parcial)

47. Reescribir el motor de citas completo (C-04/G-09 -- soporte real de
    multiples autores, DOI, autores corporativos, capitulos por norma) y
    lograr paginacion fisica exacta (C-05 -- requiere medir el DOM
    renderizado o un motor PDF server-side) siguen fuera de alcance de un
    parche, con la misma justificacion que en los pases septimo/octavo/
    noveno. Lo que si se hizo: la propia auditoria senala que aunque el
    sistema esta bien disenado como "aproximacion", en ningun lugar de la
    interfaz se le dice asi al usuario. Se agregaron tooltips explicitos:
    el indicador "Norma activa" del Toolbar ahora aclara que controla
    tipografia/tamano/interlineado/alineacion como aproximacion visual, no
    una validacion certificada del formato exacto de cada institucion; el
    numero de pagina de cada seccion en el editor (ya prefijado con "~"
    desde un pase anterior) ahora tiene un tooltip aclarando que es una
    estimacion por conteo de palabras, no la paginacion real del
    documento exportado.

Build verificado de nuevo: npm ci + tsc --noEmit + npm run build, limpio.
Ademas de la verificacion con Postgres real (items 43-44) y con imagenes
reales via Pillow + LibreOffice (item 46) descritas arriba.

## Pendiente tras este pase (confirmado, requiere sesion dedicada,
arquitectura, o archivos que no viven en este arbol)

De la lista C/G de la auditoria "Exhaustiva" (31/08/2026), quedan sin
tocar en este pase:

- **Archivos que no existen en este arbol** (ver nota al inicio de este
  pase): C-02 (PocketBase/render.yaml/backend legacy), G-12 (useAI.ts/
  AIPanel.tsx), M-04/M-05. El usuario debe verificarlos y eliminarlos
  directamente en su repo de GitHub, igual que se le indico con `pb.ts`.
- C-01 (reconstruccion COMPLETA del contenido del DOCX/PDF desde la base
  de datos, no solo los campos escalares del proyecto): requiere portar
  el motor de `formatRef()` a la Edge Function sin poder probar las
  consultas en vivo contra Supabase desde este entorno.
- C-05 (paginacion fisica 100% exacta): arquitectura de medicion de DOM o
  motor PDF server-side (Chromium/Playwright).
- G-09 (motor bibliografico completo por norma -- multiples autores, DOI,
  autores corporativos, capitulos), G-08 (sistema real de captions con
  numeracion y referencias cruzadas "ver Tabla 4").
- G-05 (retry/backoff con cola + optimistic locking real entre pestanas o
  dispositivos), G-07 (RPC transaccional para sincronizar citas
  atomicamente en vez de INSERT/UPDATE + upsert desde el cliente), G-14
  (suite de tests unitarios/E2E).
- P2 (ya reducido en este pase -- projectId en check-grammar resuelto,
  ver item 45): alert()/confirm() nativos, ESLint en CI, auditoria de
  dependencias, historial de versiones completo, BibTeX/RIS/CSL/ISO 690,
  compresion de imagenes en el frontend, limpieza de drafts locales
  huerfanos.
