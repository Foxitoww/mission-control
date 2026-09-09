import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { createTestAccountsDb } from '@main/db/init'
import type { Db } from '@main/db/connection'
import { authService } from '@main/services/auth.service'
import { session, vaultPath } from '@main/services/session.service'
import { tasksService } from '@main/services/tasks.service'
import {
  seal,
  open,
  deriveKey,
  randomKey,
  randomSalt,
  generateRecoveryPhrase,
  normalizeRecoveryPhrase,
  DecryptionError
} from '@main/security/crypto'
import { AppErrorCode } from '@shared/errors'
import { memoryStore, useTempVaults } from './helpers'

let cleanupVaults: () => void
let db: Db
let store: ReturnType<typeof memoryStore>

const ALICE = { username: 'alice', displayName: 'Alice', password: 'correct-horse', avatar: null }

beforeAll(() => {
  cleanupVaults = useTempVaults()
})

afterAll(() => cleanupVaults())

beforeEach(() => {
  db = createTestAccountsDb()
  store = memoryStore()
  session.discard()
})

afterEach(() => {
  session.discard()
  db.close()
})

describe('primitives', () => {
  it('chiffre et déchiffre', () => {
    const key = randomKey()
    const secret = Buffer.from('trajectoire de rentrée')

    expect(open(key, seal(key, secret)).toString()).toBe('trajectoire de rentrée')
  })

  it('refuse une mauvaise clé', () => {
    const sealed = seal(randomKey(), Buffer.from('secret'))
    expect(() => open(randomKey(), sealed)).toThrow(DecryptionError)
  })

  it('DÉTECTE toute altération du contenu', () => {
    const key = randomKey()
    const sealed = seal(key, Buffer.from('secret'))

    // Un seul octet retourné au milieu du message.
    const tampered = Buffer.from(sealed)
    const middle = Math.floor(tampered.length / 2)
    tampered[middle] = (tampered[middle] as number) ^ 0xff

    // C'est l'apport de GCM sur CBC : on obtient une erreur, pas des données
    // silencieusement fausses.
    expect(() => open(key, tampered)).toThrow(DecryptionError)
  })

  it('produit un chiffré différent à chaque appel, pour le même message', () => {
    const key = randomKey()
    const a = seal(key, Buffer.from('identique'))
    const b = seal(key, Buffer.from('identique'))

    // L'IV est tiré au hasard : deux coffres au contenu identique ne se
    // ressemblent pas sur disque, et comparer deux fichiers n'apprend rien.
    expect(a.equals(b)).toBe(false)
  })

  it('dérive la même clé pour le même secret et le même sel', () => {
    const salt = randomSalt()
    expect(deriveKey('secret', salt).equals(deriveKey('secret', salt))).toBe(true)
  })

  it('dérive des clés différentes pour des sels différents', () => {
    expect(deriveKey('secret', randomSalt()).equals(deriveKey('secret', randomSalt()))).toBe(false)
  })
})

describe('phrase de récupération', () => {
  it('évite les caractères ambigus I, L, O et U', () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(generateRecoveryPhrase()).not.toMatch(/[ILOU]/)
    }
  })

  it('tolère les confusions de recopie', () => {
    // Recopiée à la main des mois plus tard, une phrase perd ses tirets et
    // gagne des O pour des zéros. Refuser cette saisie serait absurde.
    const canonical = normalizeRecoveryPhrase('ABCDE-FGH01-23456-789AB-CDEFG-HJKMN')
    expect(normalizeRecoveryPhrase('abcde fghoi 23456 789ab cdefg hjkmn')).toBe(canonical)
  })
})

describe('coffre sur disque', () => {
  it("n'est PAS un fichier SQLite lisible", async () => {
    const { user } = await authService.register(db, ALICE)
    tasksService.create(session.requireVault(), { title: 'Trajectoire confidentielle' })
    session.persist()

    const raw = readFileSync(vaultPath(user.id))

    // Un fichier SQLite commence par « SQLite format 3 ». Le nôtre commence par
    // notre en-tête de format, suivi d'octets indistinguables du hasard.
    expect(raw.subarray(0, 4).toString()).toBe('MCV1')
    expect(raw.includes(Buffer.from('SQLite format 3'))).toBe(false)
  })

  it('ne contient AUCUN texte des tâches en clair', async () => {
    const { user } = await authService.register(db, ALICE)
    tasksService.create(session.requireVault(), {
      title: 'Trajectoire confidentielle',
      description: 'coordonnées du site de récupération'
    })
    session.persist()

    const raw = readFileSync(vaultPath(user.id))

    expect(raw.includes(Buffer.from('Trajectoire confidentielle'))).toBe(false)
    expect(raw.includes(Buffer.from('coordonnées du site'))).toBe(false)
  })

  it('conserve les données entre deux sessions', async () => {
    await authService.register(db, ALICE)
    tasksService.create(session.requireVault(), { title: 'Persistante' })
    session.persist()
    authService.logout(db, store)

    await authService.login(db, { username: 'alice', password: 'correct-horse' }, store)
    const tasks = tasksService.list(session.requireVault(), {})

    expect(tasks.map((task) => task.title)).toEqual(['Persistante'])
  })

  it('devient illisible si le fichier est altéré', async () => {
    const { user } = await authService.register(db, ALICE)
    session.persist()
    authService.logout(db, store)

    // Un octet modifié suffit : le tag d'authentification ne correspond plus.
    const path = vaultPath(user.id)
    const raw = readFileSync(path)
    raw[raw.length - 20] = (raw[raw.length - 20] as number) ^ 0xff
    writeFileSync(path, raw)

    await expect(
      authService.login(db, { username: 'alice', password: 'correct-horse' }, store)
    ).rejects.toThrow(DecryptionError)
  })

  it('disparaît à la suppression du compte', async () => {
    const { user } = await authService.register(db, ALICE)
    const path = vaultPath(user.id)
    expect(existsSync(path)).toBe(true)

    await authService.deleteAccount(db, { password: 'correct-horse' }, store)

    // Il ne reste plus rien à déchiffrer, même pour qui aurait le mot de passe.
    expect(existsSync(path)).toBe(false)
  })

  it('donne un coffre distinct à chaque compte', async () => {
    const alice = (await authService.register(db, ALICE)).user
    session.clear()
    const bob = (
      await authService.register(db, {
        username: 'bob',
        displayName: 'Bob',
        password: 'bob-password',
        avatar: null
      })
    ).user

    // Isolation PHYSIQUE : les données de l'un ne sont même pas déchiffrables
    // avec la clé de l'autre, puisqu'elles vivent dans un autre fichier.
    expect(vaultPath(alice.id)).not.toBe(vaultPath(bob.id))
    expect(existsSync(vaultPath(alice.id))).toBe(true)
    expect(existsSync(vaultPath(bob.id))).toBe(true)
  })
})

describe('récupération par phrase', () => {
  it('redonne accès aux données avec un nouveau mot de passe', async () => {
    const { recoveryPhrase } = await authService.register(db, ALICE)
    tasksService.create(session.requireVault(), { title: 'Récupérable' })
    session.persist()
    authService.logout(db, store)

    await authService.recover(db, {
      username: 'alice',
      recoveryPhrase,
      newPassword: 'un-nouveau-mot-de-passe'
    })

    // Les données sont intactes : seule l'enveloppe de la clé a changé, le
    // coffre lui-même n'a jamais été rechiffré.
    expect(tasksService.list(session.requireVault(), {}).map((t) => t.title)).toEqual([
      'Récupérable'
    ])
  })

  it('tolère une phrase recopiée sans tirets ni majuscules', async () => {
    const { recoveryPhrase } = await authService.register(db, ALICE)
    authService.logout(db, store)

    await expect(
      authService.recover(db, {
        username: 'alice',
        recoveryPhrase: recoveryPhrase.toLowerCase().replace(/-/g, ' '),
        newPassword: 'un-nouveau-mot-de-passe'
      })
    ).resolves.toBeDefined()
  })

  it('refuse une phrase erronée', async () => {
    await authService.register(db, ALICE)
    authService.logout(db, store)

    await expect(
      authService.recover(db, {
        username: 'alice',
        recoveryPhrase: 'ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ',
        newPassword: 'un-nouveau-mot-de-passe'
      })
    ).rejects.toThrow(expect.objectContaining({ code: AppErrorCode.AUTH_INVALID_CREDENTIALS }))
  })

  it('invalide l’ancien mot de passe', async () => {
    const { recoveryPhrase } = await authService.register(db, ALICE)
    authService.logout(db, store)

    await authService.recover(db, {
      username: 'alice',
      recoveryPhrase,
      newPassword: 'un-nouveau-mot-de-passe'
    })
    authService.logout(db, store)

    await expect(
      authService.login(db, { username: 'alice', password: 'correct-horse' }, store)
    ).rejects.toThrow(expect.objectContaining({ code: AppErrorCode.AUTH_INVALID_CREDENTIALS }))
  })
})
