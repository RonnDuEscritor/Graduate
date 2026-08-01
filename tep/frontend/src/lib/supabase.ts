import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env -- copia .env.example a .env y completa los valores de tu proyecto de Supabase.'
  )
}

// Singleton -- una sola instancia en toda la app.
// Supabase guarda la sesion en localStorage automaticamente.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default supabase
