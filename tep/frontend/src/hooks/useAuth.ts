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

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(toAuthUser(session))
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAuthUser(session))
    })
    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
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
