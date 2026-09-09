import type { IpcResult } from './errors'
import type { PublicUser, Settings } from './types/domain'
import type { RegisterInput, LoginInput, DeleteAccountInput } from './schemas/auth.schema'
import type { UpdateProfileInput } from './schemas/profile.schema'
import type { UpdateStatus } from './types/update'

/**
 * Contrat IPC — la surface complète que le renderer peut atteindre.
 *
 * REMARQUE DE SÉCURITÉ (ADR-003) : aucune signature ci-dessous n'accepte de `userId`.
 * L'identité vient de la session détenue par le processus main. Le renderer ne peut
 * pas demander les données d'un autre utilisateur parce que le vocabulaire pour le
 * faire n'existe pas.
 */
export const IpcChannel = {
  AUTH_REGISTER: 'auth:register',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_CURRENT_USER: 'auth:current-user',
  AUTH_LIST_USERS: 'auth:list-users',
  AUTH_DELETE_ACCOUNT: 'auth:delete-account',
  PROFILE_UPDATE: 'profile:update',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  UPDATE_STATUS: 'update:status',
  UPDATE_CHECK: 'update:check',
  UPDATE_INSTALL: 'update:install'
} as const

/** Canal poussé par le main, hors requête/réponse : progression d'un téléchargement. */
export const UPDATE_CHANGED_EVENT = 'update:changed'

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Interface exposée au renderer sous `window.mc`. */
export interface MissionControlApi {
  auth: {
    register(input: RegisterInput): Promise<IpcResult<PublicUser>>
    login(input: LoginInput): Promise<IpcResult<PublicUser>>
    logout(): Promise<IpcResult<null>>
    /** L'utilisateur de la session courante, ou null si personne n'est connecté. */
    currentUser(): Promise<IpcResult<PublicUser | null>>
    /** Profils affichés sur l'écran de connexion. Ne divulgue aucune donnée métier. */
    listUsers(): Promise<IpcResult<PublicUser[]>>
    /** Supprime le compte courant et TOUTES ses données, en une transaction. */
    deleteAccount(input: DeleteAccountInput): Promise<IpcResult<null>>
  }
  profile: {
    /** Met à jour le profil de l'utilisateur connecté — jamais celui d'un autre. */
    update(input: UpdateProfileInput): Promise<IpcResult<PublicUser>>
  }
  settings: {
    get(): Promise<IpcResult<Settings>>
    update(patch: Partial<Settings>): Promise<IpcResult<Settings>>
  }
  update: {
    status(): Promise<IpcResult<UpdateStatus>>
    check(): Promise<IpcResult<UpdateStatus>>
    /** Redémarre sur la version téléchargée. Sans effet si aucune n'est prête. */
    install(): Promise<IpcResult<null>>
    /** S'abonne aux changements d'état. Renvoie la fonction de désabonnement. */
    onChanged(listener: (status: UpdateStatus) => void): () => void
  }
}

declare global {
  interface Window {
    mc: MissionControlApi
  }
}
