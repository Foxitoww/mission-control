import type { Db } from '../db/connection'
import { usersRepo } from '../repositories/users.repo'
import { session } from '../services/session.service'
import { parseOrThrow } from '../lib/validate'
import { AppError, AppErrorCode } from '@shared/errors'
import type { PublicUser } from '@shared/types/domain'
import { updateProfileInputSchema } from '@shared/schemas/profile.schema'

export const profileService = {
  /**
   * Met à jour le profil de l'utilisateur CONNECTÉ.
   *
   * L'identifiant vient de la session, jamais de l'entrée (ADR-003) : il n'existe
   * aucun chemin par lequel cet appel pourrait modifier le profil d'un autre
   * compte, même si le renderer était compromis.
   */
  update(db: Db, input: unknown): PublicUser {
    const userId = session.requireUserId()
    const data = parseOrThrow(updateProfileInputSchema, input)

    if (usersRepo.usernameTakenByOther(db, data.username, userId)) {
      throw new AppError(AppErrorCode.AUTH_USERNAME_TAKEN, 'AUTH_USERNAME_TAKEN')
    }

    usersRepo.updateProfile(db, userId, { ...data, now: new Date().toISOString() })

    // On relit plutôt que de renvoyer l'entrée : ce qui remonte à l'interface est
    // ce que la base contient réellement, y compris les normalisations du schéma.
    const updated = usersRepo.findById(db, userId)
    if (!updated) throw new AppError(AppErrorCode.NOT_FOUND, 'NOT_FOUND')
    return updated
  }
}
