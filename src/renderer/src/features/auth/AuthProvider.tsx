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
import type { UpdateProfileInput } from '@shared/schemas/profile.schema'
import { unwrap } from '@renderer/lib/ipc'

type Status = 'checking' | 'signed-out' | 'signed-in'

interface AuthValue {
  status: Status
  user: PublicUser | null
  profiles: PublicUser[]
  /** Distingue « pas encore chargés » de « aucun profil ». */
  profilesLoaded: boolean
  refreshProfiles: () => Promise<void>
  signIn: (input: LoginInput) => Promise<void>
  signUp: (input: RegisterInput) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (input: UpdateProfileInput) => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<Status>('checking')
  const [user, setUser] = useState<PublicUser | null>(null)
  const [profiles, setProfiles] = useState<PublicUser[]>([])
  const [profilesLoaded, setProfilesLoaded] = useState(false)

  const refreshProfiles = useCallback(async () => {
    setProfiles(await unwrap(window.mc.auth.listUsers()))
    setProfilesLoaded(true)
  }, [])

  // Au démarrage : la session vit en mémoire du processus main (voir
  // session.service.ts). Après un rechargement à chaud du renderer elle est
  // toujours là, d'où cette interrogation plutôt qu'une supposition.
  useEffect(() => {
    void (async () => {
      try {
        const current = await unwrap(window.mc.auth.currentUser())
        // Les profils sont chargés dans TOUS les cas : après une déconnexion,
        // l'écran d'accès s'affiche immédiatement et doit déjà connaître la
        // liste, sinon il croit qu'aucun compte n'existe.
        await refreshProfiles()
        setUser(current)
        setStatus(current ? 'signed-in' : 'signed-out')
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
    // Rafraîchir AVANT de basculer l'état : sinon l'écran d'accès se monte avec
    // une liste vide et se croit au tout premier lancement.
    await refreshProfiles()
    setUser(null)
    setStatus('signed-out')
  }, [refreshProfiles])

  const updateProfile = useCallback(async (input: UpdateProfileInput) => {
    // Le main renvoie la ligne relue, donc l'interface reflète ce qui est
    // réellement stocké plutôt que ce qu'on a cru envoyer.
    setUser(await unwrap(window.mc.profile.update(input)))
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      profiles,
      profilesLoaded,
      refreshProfiles,
      signIn,
      signUp,
      signOut,
      updateProfile
    }),
    [status, user, profiles, profilesLoaded, refreshProfiles, signIn, signUp, signOut, updateProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
