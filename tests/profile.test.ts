import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Db } from '@main/db/connection'
import { profileService } from '@main/services/profile.service'
import { session } from '@main/services/session.service'
import { usersRepo } from '@main/repositories/users.repo'
import { AppErrorCode } from '@shared/errors'
import { DEFAULT_ACCENT } from '@shared/types/domain'
import { createTestEnv, seedUser, signIn, type TestEnv } from './helpers'

/**
 * Le profil vit dans la base des COMPTES, pas dans le coffre : il doit être
 * lisible avant toute authentification pour peupler l'écran de sélection.
 */
let env: TestEnv
let accounts: Db
let aliceId: string

const BASE = {
  username: 'alice',
  displayName: 'Alice',
  avatar: null,
  accentColor: DEFAULT_ACCENT
}

/** Le plus petit PNG valide, encodé — suffisant pour valider le format accepté. */
const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

beforeEach(() => {
  env = createTestEnv()
  accounts = env.accounts
  aliceId = seedUser(env, 'alice')
  signIn(env, aliceId)
})

afterEach(() => env.close())

describe('valeurs par défaut', () => {
  it('attribue la couleur d’accent par défaut à la création', () => {
    expect(usersRepo.findById(accounts, aliceId)?.accentColor).toBe(DEFAULT_ACCENT)
  })
})

describe('mise à jour du profil', () => {
  it('modifie pseudo, identifiant et couleur', () => {
    const updated = profileService.update(accounts, {
      ...BASE,
      username: 'alice-renamed',
      displayName: 'Alice Renommée',
      accentColor: '#24C38E'
    })

    expect(updated.username).toBe('alice-renamed')
    expect(updated.displayName).toBe('Alice Renommée')
    expect(updated.accentColor).toBe('#24C38E')
  })

  it('accepte de conserver son propre identifiant', () => {
    // Sans l'exclusion de sa propre ligne dans le contrôle d'unicité, ce cas
    // très banal échouerait avec « nom déjà pris ».
    expect(() => profileService.update(accounts, { ...BASE, displayName: 'Alice B.' })).not.toThrow()
  })

  it('exige une session active', () => {
    session.discard()
    expect(() => profileService.update(accounts, BASE)).toThrow(
      expect.objectContaining({ code: AppErrorCode.AUTH_REQUIRED })
    )
  })

  it('ne renvoie jamais le hash du mot de passe', () => {
    expect(profileService.update(accounts, BASE)).not.toHaveProperty('passwordHash')
  })
})

describe('avatar', () => {
  it('accepte un emoji', () => {
    expect(profileService.update(accounts, { ...BASE, avatar: '🛰️' }).avatar).toBe('🛰️')
  })

  it('accepte une image en data URI', () => {
    expect(profileService.update(accounts, { ...BASE, avatar: PNG_DATA_URI }).avatar).toBe(
      PNG_DATA_URI
    )
  })

  it('accepte le retrait de l’avatar', () => {
    profileService.update(accounts, { ...BASE, avatar: '🛰️' })
    expect(profileService.update(accounts, { ...BASE, avatar: null }).avatar).toBeNull()
  })

  it('REFUSE une URL distante — sinon l’application cesserait d’être hors ligne', () => {
    // Une URL http(s) déclencherait une requête réseau au rendu de <img src>,
    // révélant à un hôte distant quand l'utilisateur ouvre son application.
    expect(() =>
      profileService.update(accounts, { ...BASE, avatar: 'https://exemple.test/avatar.png' })
    ).toThrow(expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED }))
  })

  it('refuse un data URI qui n’est pas une image', () => {
    expect(() =>
      profileService.update(accounts, { ...BASE, avatar: 'data:text/html;base64,PHNjcmlwdD4=' })
    ).toThrow(expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED }))
  })
})

describe('couleur d’accent', () => {
  it('refuse une couleur hors palette', () => {
    expect(() => profileService.update(accounts, { ...BASE, accentColor: '#FF00FF' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )
  })
})

describe('isolation', () => {
  beforeEach(() => {
    const bobId = seedUser(env, 'bob')
    signIn(env, bobId)
  })

  it('refuse un identifiant déjà porté par un autre compte', () => {
    // La session est celle de Bob, qui tente de prendre le pseudo d'Alice.
    expect(() => profileService.update(accounts, { ...BASE, username: 'alice' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.AUTH_USERNAME_TAKEN })
    )
  })

  it('modifier son profil ne touche jamais celui d’un autre', () => {
    profileService.update(accounts, {
      username: 'bob',
      displayName: 'Bob Modifié',
      avatar: '🚀',
      accentColor: '#E8334A'
    })

    const alice = usersRepo.findById(accounts, aliceId)
    expect(alice?.displayName).toBe('alice')
    expect(alice?.avatar).toBeNull()
    expect(alice?.accentColor).toBe(DEFAULT_ACCENT)
  })
})
