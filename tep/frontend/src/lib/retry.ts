// Auditoria integral (Graduate Pro) -- "Guardado y recuperacion robustos":
// reintentos automaticos con backoff. Logica pura (sin React, sin Supabase)
// para poder probarla de forma aislada (ver src/lib/__tests__/retry.test.ts).

// Espera antes del intento numero `attempt` (1 = primer reintento):
// base, 2*base, 4*base ... acotado a `max`. Sin jitter a proposito: es
// determinista y por tanto verificable; la app tiene un unico cliente por
// pestana, asi que no hay "tormenta" de reintentos simultaneos que evitar.
export function backoffDelay(attempt: number, base = 1000, max = 30000): number {
  const n = Math.max(1, Math.floor(attempt))
  return Math.min(max, base * Math.pow(2, n - 1))
}

export interface RetryOptions {
  retries?: number                       // reintentos tras el primer intento
  base?: number
  max?: number
  sleep?: (ms: number) => Promise<void>  // inyectable para pruebas
  shouldRetry?: (error: unknown) => boolean
}

// Ejecuta `fn`; si lanza, espera con backoff y vuelve a intentar hasta
// `retries` veces. Relanza el ultimo error si todos los intentos fallan.
export async function retryWithBackoff<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 3, base = 1000, max = 30000, shouldRetry = () => true } = opts
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt)
    } catch (e) {
      lastError = e
      if (attempt === retries || !shouldRetry(e)) break
      await sleep(backoffDelay(attempt + 1, base, max))
    }
  }
  throw lastError
}
