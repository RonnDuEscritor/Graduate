import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

export interface AuthUser {
  id: string; email: string; name?: string
}

function toAuthUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    name: (session.user.user_metadata?.name as string) ?? undefined,
  }
}

export function useAuth() {
  const [user, setUser]       = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  // Audit 11.1: true for the brief window between clicking the emailed
  // recovery link and choosing a new password. While true, App.tsx shows
  // NewPasswordPage instead of the normal app, even though `user` is
  // already set (Supabase signs the user in via the recovery token itself).
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(toAuthUser(session))
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(toAuthUser(session))
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  return { user, loading, isPasswordRecovery, clearPasswordRecovery: () => setIsPasswordRecovery(false) }
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { name } }, // the DB trigger (see supabase/migrations/0001_init.sql) copies this into profiles.name
  })
  if (error) throw error
  return data
}

export async function signOut() {
  await supabase.auth.signOut()
}

// Audit 11.1 fix (IMPORTANTE): there was previously no "forgot password"
// flow at all -- login, register and logout existed, but a user locked out
// of their account with a real thesis in progress had no way back in.
// Supabase emails a recovery link that redirects back to this app with a
// one-time token; onAuthStateChange fires 'PASSWORD_RECOVERY' when that
// token is present, which App.tsx listens for to show the "choose a new
// password" screen (see NewPasswordPage.tsx).
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  })
  if (error) throw error
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}
