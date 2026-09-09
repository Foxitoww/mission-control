import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDatabase } from '@main/db/init'
import type { Db } from '@main/db/connection'
import { authService } from '@main/services/auth.service'
import { session } from '@main/services/session.service'
import { settingsRepo } from '@main/repositories/settings.repo'
import { AppError, AppErrorCode } from '@shared/errors'
import { memoryStore } from './helpers'

let db: Db
let store: ReturnType<typeof memoryStore>

beforeEach(() => {
  db = createTestDatabase()
  store = memoryStore()
  // La session est un singleton de module : sans remise à zéro, un test hérite
  // de l'utilisateur connecté par le précédent.
  session.clear()
})

afterEach(() => db.close())

const ALICE = { username: 'alice', displayName: 'Alice', password: 'correct-horse', avatar: null }

describe('inscription', () => {
  it('crée le compte, ouvre la session et ne renvoie jamais le hash', async () => {
    const user = await authService.register(db, ALICE)

    expect(user.username).toBe('alice')
    expect(user.displayName).toBe('Alice')
    expect(session.userId).toBe(user.id)
    expect(user).not.toHaveProperty('passwordHash')
  })

  it('stocke le mot de passe haché, jamais en clair', async () => {
    await authService.register(db, ALICE)

    const stored = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('alice') as {
      password_hash: string
    }

    expect(stored.password_hash).not.toContain('correct-horse')
    expect(stored.password_hash.startsWith('scrypt$')).toBe(true)
  })

  it('crée la ligne de paramètres dans la même transaction', async () => {
    const user = await authService.register(db, ALICE, 'en')
    expect(settingsRepo.get(db, user.id)?.language).toBe('en')
  })

  it('refuse un nom déjà pris', async () => {
    await authService.register(db, ALICE)
    session.clear()

    await expect(authService.register(db, { ...ALICE, displayName: 'Autre' })).rejects.toThrow(
      expect.objectContaining({ code: AppErrorCode.AUTH_USERNAME_TAKEN })
    )
  })

  it('normalise le nom en minuscules', async () => {
    const user = await authService.register(db, { ...ALICE, username: 'ALICE' })
    expect(user.username).toBe('alice')
  })

  it('rejette un mot de passe trop court avant toute écriture', async () => {
    await expect(authService.register(db, { ...ALICE, password: 'court' })).rejects.toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )

    const count = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
    expect(count.n).toBe(0)
  })
})

describe('connexion', () => {
  beforeEach(async () => {
    await authService.register(db, ALICE)
    session.clear()
  })

  it('accepte le bon mot de passe et ouvre la session', async () => {
    const user = await authService.login(db, { username: 'alice', password: 'correct-horse' }, store)
    expect(session.userId).toBe(user.id)
  })

  it('refuse un mauvais mot de passe sans ouvrir de session', async () => {
    await expect(authService.login(db, { username: 'alice', password: 'mauvais-mdp' }, store)).rejects.toThrow(
      expect.objectContaining({ code: AppErrorCode.AUTH_INVALID_CREDENTIALS })
    )
    expect(session.userId).toBeNull()
  })

  it('renvoie le MÊME code pour un compte inexistant que pour un mauvais mot de passe', async () => {
    // Défense contre l'énumération de comptes : l'erreur ne doit pas révéler
    // si le nom d'utilisateur existe. Voir auth.service.ts.
    const unknownUser = await authService
      .login(db, { username: 'inconnu', password: 'peu-importe' }, store)
      .catch((error: AppError) => error)

    const wrongPassword = await authService
      .login(db, { username: 'alice', password: 'mauvais-mdp' }, store)
      .catch((error: AppError) => error)

    expect((unknownUser as AppError).code).toBe(AppErrorCode.AUTH_INVALID_CREDENTIALS)
    expect((wrongPassword as AppError).code).toBe((unknownUser as AppError).code)
    expect((wrongPassword as AppError).message).toBe((unknownUser as AppError).message)
  })

  it('déconnecte', async () => {
    await authService.login(db, { username: 'alice', password: 'correct-horse' }, store)
    authService.logout(db, store)

    expect(session.userId).toBeNull()
    expect(authService.currentUser(db)).toBeNull()
  })
})

describe('suppression de compte', () => {
  it('exige une session active', async () => {
    await expect(authService.deleteAccount(db, { password: 'correct-horse' }, store)).rejects.toThrow(
      expect.objectContaining({ code: AppErrorCode.AUTH_REQUIRED })
    )
  })

  it('exige le mot de passe et laisse le compte intact en cas d’échec', async () => {
    const user = await authService.register(db, ALICE)

    await expect(authService.deleteAccount(db, { password: 'mauvais-mdp' }, store)).rejects.toThrow(
      expect.objectContaining({ code: AppErrorCode.AUTH_INVALID_CREDENTIALS })
    )

    expect(authService.currentUser(db)?.id).toBe(user.id)
  })

  it('supprime le compte, ferme la session et efface les paramètres en cascade', async () => {
    const user = await authService.register(db, ALICE)
    await authService.deleteAccount(db, { password: 'correct-horse' }, store)

    expect(session.userId).toBeNull()
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 0 })
    expect(settingsRepo.get(db, user.id)).toBeNull()
  })
})
