import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type { PublicUser } from '@shared/types/domain'
import type { RegisterInput, LoginInput } from '@shared/schemas/auth.schema'
import { unwrap } from '@renderer/lib/ipc'

type Status = 'checking' | 'signed-out' | 'signed-in'

interface AuthValue {
  status: Status
  user: PublicUser | null
  profiles: PublicUser[]
  refreshProfiles: () => Promise<void>
  signIn: (input: LoginInput) => Promise<void>
  signUp: (input: RegisterInput) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<Status>('checking')
  const [user, setUser] = useState<PublicUser | null>(null)
  const [profiles, setProfiles] = useState<PublicUser[]>([])

  const refreshProfiles = useCallback(async () => {
    setProfiles(await unwrap(window.mc.auth.listUsers()))
  }, [])

  // Au démarrage : la session vit en mémoire du processus main (voir
  // session.service.ts). Après un rechargement à chaud du renderer elle est
  // toujours là, d'où cette interrogation plutôt qu'une supposition.
  useEffect(() => {
    void (async () => {
      try {
        const current = await unwrap(window.mc.auth.currentUser())
        setUser(current)
        setStatus(current ? 'signed-in' : 'signed-out')
        if (!current) await refreshProfiles()
      } catch {
        setStatus('signed-out')
      }
    })()
  }, [refreshProfiles])

  const signIn = useCallback(async (input: LoginInput) => {
    const signedIn = await unwrap(window.mc.auth.login(input))
    setUser(signedIn)
    setStatus('signed-in')
  }, [])

  const signUp = useCallback(async (input: RegisterInput) => {
    const created = await unwrap(window.mc.auth.register(input))
    setUser(created)
    setStatus('signed-in')
  }, [])

  const signOut = useCallback(async () => {
    await unwrap(window.mc.auth.logout())
    setUser(null)
    setStatus('signed-out')
    await refreshProfiles()
  }, [refreshProfiles])

  const value = useMemo<AuthValue>(
    () => ({ status, user, profiles, refreshProfiles, signIn, signUp, signOut }),
    [status, user, profiles, refreshProfiles, signIn, signUp, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
