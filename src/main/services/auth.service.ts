import { randomUUID } from 'node:crypto'
import type { Db } from '../db/connection'
import { usersRepo } from '../repositories/users.repo'
import { settingsRepo } from '../repositories/settings.repo'
import { hashPassword, verifyPassword, burnEquivalentTime } from './password'
import { session } from './session.service'
import { parseOrThrow } from '../lib/validate'
import { AppError, AppErrorCode } from '@shared/errors'
import type { PublicUser, Language } from '@shared/types/domain'
import {
  registerInputSchema,
  loginInputSchema,
  deleteAccountInputSchema
} from '@shared/schemas/auth.schema'

function stripHash(record: { passwordHash: string } & PublicUser): PublicUser {
  const { passwordHash: _ignored, ...publicUser } = record
  return publicUser
}

export const authService = {
  /**
   * Crée un compte et ouvre immédiatement la session.
   *
   * Le hachage a lieu AVANT la transaction : `db.transaction()` de better-sqlite3
   * est synchrone et ne peut pas contenir d'`await`. Hacher dedans bloquerait de
   * toute façon la base pendant ~100 ms — une transaction doit rester courte.
   */
  async register(db: Db, input: unknown, language: Language = 'fr'): Promise<PublicUser> {
    const data = parseOrThrow(registerInputSchema, input)

    if (usersRepo.findByUsername(db, data.username)) {
      throw new AppError(AppErrorCode.AUTH_USERNAME_TAKEN, 'AUTH_USERNAME_TAKEN')
    }

    const passwordHash = await hashPassword(data.password)
    const id = randomUUID()
    const now = new Date().toISOString()

    // Utilisateur et paramètres naissent ensemble : un compte sans ligne de
    // paramètres serait un état incohérent que tout le reste devrait gérer.
    db.transaction(() => {
      usersRepo.insert(db, {
        id,
        username: data.username,
        displayName: data.displayName,
        passwordHash,
        avatar: data.avatar ?? null,
        now
      })
      settingsRepo.insertDefaults(db, id, language)
    })()

    session.start(id)
    return {
      id,
      username: data.username,
      displayName: data.displayName,
      avatar: data.avatar ?? null,
      createdAt: now
    }
  },

  /**
   * Connexion.
   *
   * NOTE DE SÉCURITÉ — énumération de comptes. Vérifier un mot de passe avec
   * scrypt prend délibérément ~100 ms. Si l'on renvoie une erreur immédiatement
   * lorsqu'aucun utilisateur ne correspond, l'écart de temps entre les deux cas
   * révèle quels noms d'utilisateur existent sur la machine.
   */
  async login(db: Db, input: unknown): Promise<PublicUser> {
    const data = parseOrThrow(loginInputSchema, input)
    const record = usersRepo.findByUsername(db, data.username)

    if (!record) {
      // Aucun compte ne correspond. On consomme malgré tout le temps d'un
      // scrypt pour que cet échec soit indiscernable d'un mauvais mot de
      // passe, puis on renvoie le MÊME code d'erreur : sinon le code trahirait
      // ce que le temps de réponse ne trahit plus.
      await burnEquivalentTime()
      throw new AppError(AppErrorCode.AUTH_INVALID_CREDENTIALS, 'AUTH_INVALID_CREDENTIALS')
    }

    const valid = await verifyPassword(data.password, record.passwordHash)
    if (!valid) {
      throw new AppError(AppErrorCode.AUTH_INVALID_CREDENTIALS, 'AUTH_INVALID_CREDENTIALS')
    }

    session.start(record.id)
    return stripHash(record)
  },

  logout(): void {
    session.clear()
  },

  currentUser(db: Db): PublicUser | null {
    const userId = session.userId
    return userId ? usersRepo.findById(db, userId) : null
  },

  listUsers(db: Db): PublicUser[] {
    return usersRepo.listPublic(db)
  },

  /**
   * Supprime le compte courant et TOUTES ses données.
   *
   * Le mot de passe est redemandé : c'est une action irréversible, et la session
   * peut avoir été laissée ouverte sur un poste partagé.
   */
  async deleteAccount(db: Db, input: unknown): Promise<void> {
    const userId = session.requireUserId()
    const data = parseOrThrow(deleteAccountInputSchema, input)

    const record = usersRepo.findById(db, userId)
    if (!record) throw new AppError(AppErrorCode.NOT_FOUND, 'NOT_FOUND')

    const full = usersRepo.findByUsername(db, record.username)
    if (!full || !(await verifyPassword(data.password, full.passwordHash))) {
      throw new AppError(AppErrorCode.AUTH_INVALID_CREDENTIALS, 'AUTH_INVALID_CREDENTIALS')
    }

    usersRepo.deleteById(db, userId)
    session.clear()
  }
}

// Réexporté pour que la solution du TODO ci-dessus reste à portée de main.
export { burnEquivalentTime }
