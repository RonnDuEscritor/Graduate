# Graduate Pro
**Editor academico profesional con backend Supabase**
by RonnDu Corp.

## Stack
- **Frontend**: React 18 + Vite + TypeScript + Tiptap + Tailwind
- **Backend**: Supabase (Postgres + Auth + Edge Functions) -- plan gratuito, sin tarjeta
- **Generacion de DOCX**: Supabase Edge Function (Deno) usando la libreria `docx` real via `npm:` specifier
- **Revision gramatical**: Supabase Edge Function que actua de proxy autenticado hacia LanguageTool
- **Deploy**: Vercel (frontend) + Supabase (backend)

## Estructura del proyecto
```
tep/
└── frontend/          <- React + Vite app
    └── src/
        ├── components/
        │   ├── editor/       <- Editor Tiptap A4
        │   ├── sidebar/      <- Estructura + navegacion
        │   ├── references/   <- Gestor bibliografico
        │   ├── revision/     <- Panel de revision academica
        │   ├── export/       <- PDF + Word
        │   └── ui/           <- Componentes base
        ├── extensions/       <- Nodos/marcas Tiptap (citas, marcas de gramatica)
        ├── pages/            <- Login, Dashboard, Editor, Nueva contrasena
        ├── hooks/            <- useAuth, useProject, etc.
        ├── store/            <- Zustand global store
        ├── lib/              <- supabase client, utils, formatters
        └── types/            <- TypeScript interfaces

supabase/
├── migrations/
│   ├── 0001_init.sql                    <- Esquema completo (tablas + RLS + triggers)
│   ├── 0002_input_validation.sql        <- Validacion server-side de create_project_with_sections
│   ├── 0003_grammar_throttle.sql        <- Tabla compartida para el rate-limit de gramatica
│   ├── 0004_is_roman_fix.sql            <- is_roman en create_project_with_sections + backfill
│   ├── 0005_grammar_throttle_atomic.sql <- Throttle de gramatica sin condicion de carrera
│   ├── 0006_citations_integrity.sql     <- FKs compuestas: section/reference deben ser del mismo project
│   ├── 0007_norma_expansion.sql         <- Amplia projects.norma a los 7 estilos (antes solo 3)
│   └── 0008_audit_followup.sql          <- Backfill is_roman por tipo de tesis + UNIQUE(section, reference) en citations
└── functions/
    ├── generate-docx/
    │   └── index.ts           <- Edge Function autocontenida (1 solo archivo)
    ├── check-grammar/
    │   └── index.ts           <- Proxy autenticado hacia LanguageTool
    └── lookup-doi/
        └── index.ts           <- Proxy autenticado hacia CrossRef (busqueda de referencias por DOI)
```

## Por que Supabase y no PocketBase/Railway/Render

El proyecto migro de PocketBase (en Railway) a Supabase porque:
- El plan gratuito de Supabase **no pide tarjeta** y es permanente (no es un trial).
- Incluye una base de datos Postgres real con **disco persistente de verdad**
  (500MB), a diferencia del plan gratuito de Render, que no soporta disco
  persistente para servicios web.
- Unica particularidad: un proyecto sin trafico durante 7 dias se "pausa"
  (los datos NO se borran, solo hay que despertarlo con la primera visita
  o un clic en el dashboard).

## Setup rapido (desarrollo local)

### 1. Backend -- Supabase
```bash
# Instala el CLI de Supabase (una sola vez)
npm install -g supabase

# Crea un proyecto gratuito en https://supabase.com/dashboard (sin tarjeta)

# Enlaza tu proyecto local con el proyecto remoto
supabase link --project-ref TU_PROJECT_REF

# Aplica el esquema (tablas + RLS + triggers) y las migraciones posteriores, en orden
supabase db push

# Despliega las funciones
supabase functions deploy generate-docx
supabase functions deploy check-grammar
```

Tambien puedes hacer todo esto sin instalar nada, desde el dashboard web de
Supabase:
1. **SQL Editor** -> pega el contenido de cada archivo en `supabase/migrations/`,
   en orden (`0001_init.sql`, `0002_input_validation.sql`, etc.) -> Run.
2. **Edge Functions** -> Deploy a new function -> **Via Editor** -> nombrala
   `generate-docx` -> pega el contenido completo de
   `supabase/functions/generate-docx/index.ts` (es un solo archivo
   autocontenido, no necesitas archivos adicionales) -> Deploy. Repite lo
   mismo para `check-grammar` (`supabase/functions/check-grammar/index.ts`)
   y `lookup-doi` (`supabase/functions/lookup-doi/index.ts`).

### 2. Frontend
```bash
cd frontend
npm install
cp .env.example .env
# Edita .env con la URL y anon key de tu proyecto de Supabase
# (Project Settings -> API en el dashboard de Supabase)
npm run dev
# -> http://localhost:5173
```

## Deploy en produccion

### Backend en Supabase
Ya esta "desplegado" en cuanto ejecutas `supabase db push` y
`supabase functions deploy` para cada funcion -- no hay un contenedor que
mantener, Supabase aloja tanto la base de datos como las funciones.

### Frontend en Vercel
```bash
cd frontend
vercel deploy
# Variables de entorno en Vercel:
# VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
# VITE_SUPABASE_ANON_KEY=tu-clave-anonima-publica
```

## Tablas (Postgres)
| Tabla          | Descripcion                                  |
|----------------|-----------------------------------------------|
| `profiles`     | Nombre del usuario (se llena solo al registrarse) |
| `projects`     | Proyectos de tesis por usuario               |
| `sections`     | Secciones del documento (contenido Tiptap)   |
| `bibliography` | Fuentes bibliograficas (antes "references")  |
| `citations`    | Citas en el texto (con orden de aparicion)   |
| `versions`     | Snapshots automaticos de version             |

Todas las tablas tienen Row Level Security activado: cada usuario solo
puede ver y modificar sus propios proyectos y todo lo que cuelga de ellos.

## Variables de entorno
```env
# frontend/.env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anonima-publica
```

Las Edge Functions (`generate-docx`, `check-grammar`, `lookup-doi`) **no
necesitan `.env` propio**: `withSupabase()` (paquete `@supabase/server`)
lee `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` desde
las variables que Supabase inyecta automaticamente en el runtime de cada
funcion desplegada -- no hay que configurar nada manualmente ni en el CLI
ni en el dashboard. `withSupabase()` tambien resuelve CORS (incluido el
preflight `OPTIONS`) para las tres funciones, asi que no requieren
configuracion adicional de CORS.

## Orden de las migraciones y rollback

Las migraciones en `supabase/migrations/` estan numeradas y deben
aplicarse **en orden ascendente** (`0001` -> `0008`); varias redefinen
`create_project_with_sections()` sobre la version anterior
(`create or replace function`), asi que aplicarlas fuera de orden puede
dejar el RPC con una validacion mas vieja que la ultima. `supabase db push`
las aplica en orden automaticamente si nunca se salta un archivo.

No existen scripts de rollback (`down` migrations): son incrementales y
pensadas para no romper datos existentes hacia adelante. Para revertir un
cambio puntual, la via segura es escribir una migracion nueva que deshaga
ese cambio especifico (ej. `drop constraint`), nunca editar o borrar un
archivo de migracion ya aplicado en produccion.

## Antes de pasar a produccion

- Probar exportacion DOCX y PDF con los 3 tipos de tesis y las 7 normas.
- Probar con secciones que incluyan tablas, imagenes, listas y citas.
- Confirmar en el dashboard de Supabase que las 8 migraciones estan
  aplicadas (`supabase migration list`) y que las 3 Edge Functions estan
  desplegadas y responden (`supabase functions list`).
- Revisar que `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` en Vercel
  apunten al proyecto de Supabase correcto (no al de desarrollo).
