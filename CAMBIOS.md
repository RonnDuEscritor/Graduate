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
