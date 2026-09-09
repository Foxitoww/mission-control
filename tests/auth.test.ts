import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { createTestAccountsDb } from '@main/db/init'
import type { Db } from '@main/db/connection'
import { authService } from '@main/services/auth.service'
import { session } from '@main/services/session.service'
import { settingsRepo } from '@main/repositories/settings.repo'
import { AppError, AppErrorCode } from '@shared/errors'
import { memoryStore, useTempVaults } from './helpers'

/**
 * Ces tests exercent l'inscription et la connexion RÉELLES : trois dérivations
 * scrypt et un vrai coffre chiffré sur disque. Ils sont donc lents, et c'est
 * assumé — c'est ici que se vérifie ce qui protège réellement les données.
 */
let cleanupVaults: () => void
let db: Db
let store: ReturnType<typeof memoryStore>

beforeAll(() => {
  cleanupVaults = useTempVaults()
})

afterAll(() => cleanupVaults())

beforeEach(() => {
  db = createTestAccountsDb()
  store = memoryStore()
  // La session est un singleton de module : sans remise à zéro, un test hérite
  // de l'utilisateur connecté par le précédent.
  session.discard()
})

afterEach(() => {
  session.discard()
  db.close()
})

const ALICE = { username: 'alice', displayName: 'Alice', password: 'correct-horse', avatar: null }

describe('inscription', () => {
  it('crée le compte, ouvre la session et ne renvoie jamais le hash', async () => {
    const { user } = await authService.register(db, ALICE)

    expect(user.username).toBe('alice')
    expect(user.displayName).toBe('Alice')
    expect(session.userId).toBe(user.id)
    expect(user).not.toHaveProperty('passwordHash')
  })

  it('renvoie une phrase de récupération lisible, une seule fois', async () => {
    const { recoveryPhrase } = await authService.register(db, ALICE)

    // Six groupes de cinq caractères, alphabet Crockford sans I, L, O ni U.
    expect(recoveryPhrase).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){5}$/)
  })

  it('stocke le mot de passe haché, jamais en clair', async () => {
    await authService.register(db, ALICE)

    const stored = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('alice') as {
      password_hash: string
    }

    expect(stored.password_hash).not.toContain('correct-horse')
    expect(stored.password_hash.startsWith('scrypt$')).toBe(true)
  })

  it('ne stocke JAMAIS la clé de données en clair', async () => {
    await authService.register(db, ALICE)

    const row = db.prepare('SELECT dek_password, dek_recovery, dek_os FROM users').get() as {
      dek_password: Buffer
      dek_recovery: Buffer
      dek_os: Buffer | null
    }

    // Scellées : 12 octets d'IV + 32 de clé + 16 de tag d'authentification.
    expect(row.dek_password).toHaveLength(60)
    expect(row.dek_recovery).toHaveLength(60)
    expect(row.dek_password.equals(row.dek_recovery)).toBe(false)
    // Aucune clé système tant que « se souvenir de moi » n'a pas été demandé.
    expect(row.dek_os).toBeNull()
  })

  it('crée la ligne de paramètres DANS le coffre', async () => {
    const { user } = await authService.register(db, ALICE, 'en')
    expect(settingsRepo.get(session.requireVault(), user.id)?.language).toBe('en')
  })

  it('refuse un nom déjà pris', async () => {
    await authService.register(db, ALICE)
    session.discard()

    await expect(authService.register(db, { ...ALICE, displayName: 'Autre' })).rejects.toThrow(
      expect.objectContaining({ code: AppErrorCode.AUTH_USERNAME_TAKEN })
    )
  })

  it('normalise le nom en minuscules', async () => {
    const { user } = await authService.register(db, { ...ALICE, username: 'ALICE' })
    expect(user.username).toBe('alice')
  })

  it('rejette un mot de passe trop court avant toute écriture', async () => {
    await expect(authService.register(db, { ...ALICE, password: 'court' })).rejects.toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )

    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 0 })
  })
})

describe('connexion', () => {
  beforeEach(async () => {
    await authService.register(db, ALICE)
    session.clear()
  })

  it('accepte le bon mot de passe, ouvre la session et déchiffre le coffre', async () => {
    const user = await authService.login(db, { username: 'alice', password: 'correct-horse' }, store)

    expect(session.userId).toBe(user.id)
    expect(() => session.requireVault()).not.toThrow()
  })

  it('refuse un mauvais mot de passe sans ouvrir de session', async () => {
    await expect(
      authService.login(db, { username: 'alice', password: 'mauvais-mdp' }, store)
    ).rejects.toThrow(expect.objectContaining({ code: AppErrorCode.AUTH_INVALID_CREDENTIALS }))

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

  it('déconnecte et referme le coffre', async () => {
    await authService.login(db, { username: 'alice', password: 'correct-horse' }, store)
    authService.logout(db, store)

    expect(session.userId).toBeNull()
    expect(authService.currentUser(db)).toBeNull()
    expect(() => session.requireVault()).toThrow()
  })
})

describe('changement de mot de passe', () => {
  beforeEach(async () => {
    await authService.register(db, ALICE)
  })

  it('permet de se reconnecter avec le nouveau mot de passe', async () => {
    await authService.changePassword(db, {
      currentPassword: 'correct-horse',
      newPassword: 'nouveau-mot-de-passe'
    })
    authService.logout(db, store)

    await expect(
      authService.login(db, { username: 'alice', password: 'nouveau-mot-de-passe' }, store)
    ).resolves.toBeDefined()
  })

  it('exige le mot de passe actuel', async () => {
    await expect(
      authService.changePassword(db, { currentPassword: 'faux', newPassword: 'autre-mot-de-passe' })
    ).rejects.toThrow(expect.objectContaining({ code: AppErrorCode.AUTH_INVALID_CREDENTIALS }))
  })
})

describe('suppression de compte', () => {
  it('exige une session active', async () => {
    await expect(
      authService.deleteAccount(db, { password: 'correct-horse' }, store)
    ).rejects.toThrow(expect.objectContaining({ code: AppErrorCode.AUTH_REQUIRED }))
  })

  it('exige le mot de passe et laisse le compte intact en cas d’échec', async () => {
    const { user } = await authService.register(db, ALICE)

    await expect(authService.deleteAccount(db, { password: 'mauvais-mdp' }, store)).rejects.toThrow(
      expect.objectContaining({ code: AppErrorCode.AUTH_INVALID_CREDENTIALS })
    )

    expect(authService.currentUser(db)?.id).toBe(user.id)
  })

  it('supprime le compte et ferme la session', async () => {
    await authService.register(db, ALICE)
    await authService.deleteAccount(db, { password: 'correct-horse' }, store)

    expect(session.userId).toBeNull()
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 0 })
  })
})
