import { useState, FormEvent } from 'react'
import { updatePassword } from '@/hooks/useAuth'
import { friendlyError } from '@/lib/utils'

// Audit 11.1 fix: shown instead of the normal app while
// useAuth().isPasswordRecovery is true (i.e. right after the user clicked
// the "reset password" link emailed by Supabase). Lets them pick a new
// password before continuing into their projects.
export default function NewPasswordPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handle = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contrasenas no coinciden.')
      return
    }
    setLoading(true)
    try {
      await updatePassword(password)
      onDone()
    } catch (err: unknown) {
      setError(friendlyError(err, 'No se pudo actualizar la contrasena. Intenta de nuevo.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-brand-950 p-4">
      <div className="w-full max-w-sm animate-fadeIn">
        <div className="text-center mb-8">
          <h1 className="font-serif text-2xl text-brand-100 font-semibold">Nueva contrasena</h1>
          <p className="text-brand-400 text-xs mt-1">Elige una contrasena nueva para tu cuenta</p>
        </div>

        <div className="bg-brand-800 border border-brand-700 rounded-2xl p-6">
          <form onSubmit={handle} className="space-y-4">
            <div>
              <label className="block text-xs text-brand-400 mb-1">Nueva contrasena</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
                className="w-full bg-brand-900 border border-brand-600 rounded-lg px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-400"
                placeholder="Minimo 8 caracteres" autoFocus />
            </div>
            <div>
              <label className="block text-xs text-brand-400 mb-1">Confirma la contrasena</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8}
                className="w-full bg-brand-900 border border-brand-600 rounded-lg px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-400"
                placeholder="Repite la contrasena" />
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
              {loading ? 'Guardando...' : 'Guardar contrasena'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
