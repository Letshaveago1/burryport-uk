import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

type Profile = { user_id: string; username: string | null; avatar_url: string | null; is_moderator?: boolean | null }
type Ctx = {
  ready: boolean
  session: import('@supabase/supabase-js').Session | null
  profile: Profile | null
  isModerator: boolean
}

const AuthCtx = createContext<Ctx>({ ready: false, session: null, profile: null, isModerator: false })
export const useAuth = () => useContext(AuthCtx)

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<import('@supabase/supabase-js').Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isModerator, setIsModerator] = useState(false)

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('user_id,username,avatar_url,is_moderator')
      .eq('user_id', userId)
      .single()
    const p = (data as Profile) || null
    setProfile(p)
    setIsModerator(!!p?.is_moderator)
  }

  useEffect(() => {
    let unsub = () => { }
      ; (async () => {
        const { data } = await supabase.auth.getSession()
        setSession(data.session || null)
        if (data.session?.user?.id) await loadProfile(data.session.user.id)
        setReady(true)

        const sub = supabase.auth.onAuthStateChange((_e, newSession) => {
          setSession(newSession)
          if (newSession?.user?.id) loadProfile(newSession.user.id)
          else { setProfile(null); setIsModerator(false) }
        })
        unsub = () => sub.data.subscription.unsubscribe()
      })()
    return () => unsub()
  }, [])

  return (
    <AuthCtx.Provider value={{ ready, session, profile, isModerator }}>
      {children}
    </AuthCtx.Provider>
  )
}
