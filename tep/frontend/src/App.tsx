import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useStore } from '@/store'
import LoginPage    from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import EditorPage   from '@/pages/EditorPage'
import NewPasswordPage from '@/pages/NewPasswordPage'

export default function App() {
  const { user, loading, isPasswordRecovery, clearPasswordRecovery } = useAuth()
  const flushPendingSaves = useStore(s => s.flushPendingSaves)

  // Audit 3.4 fix: flush any debounced-but-not-yet-saved section edits
  // whenever the tab is hidden/closed, instead of only on a fixed 1.5s
  // timer that can lose the last keystrokes if the user leaves sooner.
  useEffect(() => {
    const flush = () => flushPendingSaves()
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [flushPendingSaves])

  if (loading) return (
    <div className="h-full flex items-center justify-center bg-brand-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-brand-400 text-sm">Cargando TesisEditor Pro…</span>
      </div>
    </div>
  )

  // Audit 11.1 fix: clicking the emailed recovery link signs the user in
  // via Supabase's recovery token, so `user` is already set at this point --
  // without this check they'd land straight in the dashboard with their OLD
  // password still active and no prompt to actually change it.
  if (isPasswordRecovery) {
    return <NewPasswordPage onDone={clearPasswordRecovery} />
  }

  return (
    <Routes>
      <Route path="/login"         element={!user ? <LoginPage /> : <Navigate to="/" />} />
      <Route path="/"              element={user ? <DashboardPage /> : <Navigate to="/login" />} />
      <Route path="/editor/:id"    element={user ? <EditorPage />   : <Navigate to="/login" />} />
      <Route path="*"              element={<Navigate to="/" />} />
    </Routes>
  )
}
