import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // lib/utils.ts importa el cliente de Supabase, que exige estas variables
    // al cargarse; en pruebas basta con valores ficticios (no hay red).
    env: { VITE_SUPABASE_URL: 'https://test.supabase.co', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
  },
  server: {
    port: 5173,
  },
})
