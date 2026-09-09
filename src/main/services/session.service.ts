import { AppError, AppErrorCode } from '@shared/errors'

/**
 * Session locale — l'unique détenteur de l'identité de l'utilisateur courant.
 *
 * Volontairement EN MÉMOIRE SEULE : fermer l'application déconnecte. Sur une
 * machine partagée, une session persistée sur disque signifierait qu'un autre
 * utilisateur du poste ouvre l'application sur le compte du précédent.
 *
 * Ce module est le pivot d'ADR-003 : aucun canal IPC n'accepte de userId, tous
 * lisent ici. Le renderer n'a donc aucun moyen d'agir au nom d'un autre compte.
 */
let currentUserId: string | null = null

export const session = {
  start(userId: string): void {
    currentUserId = userId
  },

  clear(): void {
    currentUserId = null
  },

  get userId(): string | null {
    return currentUserId
  },

  /** À utiliser dans tout handler IPC nécessitant une authentification. */
  requireUserId(): string {
    if (!currentUserId) {
      throw new AppError(AppErrorCode.AUTH_REQUIRED, 'Aucune session active')
    }
    return currentUserId
  }
}
