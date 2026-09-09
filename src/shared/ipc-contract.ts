import type { IpcResult } from './errors'
import type { PublicUser, Settings } from './types/domain'
import type { RegisterInput, LoginInput, DeleteAccountInput } from './schemas/auth.schema'

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
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update'
} as const

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
  settings: {
    get(): Promise<IpcResult<Settings>>
    update(patch: Partial<Settings>): Promise<IpcResult<Settings>>
  }
}

declare global {
  interface Window {
    mc: MissionControlApi
  }
}
