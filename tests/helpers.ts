import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Db } from '@main/db/connection'
import { createTestAccountsDb, createTestVaultDb } from '@main/db/init'
import { usersRepo } from '@main/repositories/users.repo'
import { session } from '@main/services/session.service'
import type { RememberStore } from '@main/services/remember.service'

/**
 * Stockage de jeton en mémoire.
 *
 * `RememberStore` a été extrait en interface précisément pour cela : les tests
 * n'ont besoin ni du disque, ni d'un dossier temporaire à nettoyer.
 */
export function memoryStore(): RememberStore & { peek: () => unknown } {
  let value: { id: string; token: string } | null = null

  return {
    read: () => value,
    write: (next) => {
      value = next
    },
    clear: () => {
      value = null
    },
    peek: () => value
  }
}

/**
 * Redirige les coffres vers un dossier temporaire, pour les tests qui exercent
 * le VRAI chiffrement sur de vrais fichiers. Renvoie la fonction de nettoyage.
 */
export function useTempVaults(): () => void {
  const directory = mkdtempSync(join(tmpdir(), 'mc-vault-'))
  process.env['MC_VAULT_DIR'] = directory

  return () => {
    delete process.env['MC_VAULT_DIR']
    rmSync(directory, { recursive: true, force: true })
  }
}

export interface TestEnv {
  accounts: Db
  /**
   * Un coffre PARTAGÉ par tous les utilisateurs de test.
   *
   * En production, chaque compte a son propre fichier chiffré : les données
   * d'autrui ne sont même pas déchiffrables. Ici, on les met délibérément dans
   * la même base pour éprouver la SECONDE couche d'isolation — le filtre
   * `WHERE user_id = ?` de chaque requête. Un test qui passerait uniquement
   * grâce à la séparation des fichiers ne prouverait rien sur les requêtes.
   */
  vault: Db
  close: () => void
}

export function createTestEnv(): TestEnv {
  const accounts = createTestAccountsDb()
  const vault = createTestVaultDb()

  return {
    accounts,
    vault,
    close: () => {
      session.discard()
      accounts.close()
      vault.close()
    }
  }
}

/**
 * Crée un compte de test SANS passer par l'inscription complète.
 *
 * L'inscription réelle exécute trois dérivations scrypt (~300 ms). Multipliée
 * par les dizaines de cas du domaine métier, elle rendrait la suite inutilisable.
 * Le matériel cryptographique est donc factice ici — et vérifié pour de vrai
 * dans `encryption.test.ts`.
 */
export function seedUser(env: TestEnv, username: string): string {
  const id = randomUUID()
  const now = new Date().toISOString()

  usersRepo.insert(env.accounts, {
    id,
    username,
    displayName: username,
    passwordHash: 'scrypt$test',
    avatar: null,
    kdfSalt: Buffer.alloc(32),
    dekPassword: Buffer.alloc(32),
    recoverySalt: Buffer.alloc(32),
    dekRecovery: Buffer.alloc(32),
    now
  })

  env.vault.prepare('INSERT INTO settings (user_id) VALUES (?)').run(id)
  return id
}

/** Ouvre une session sur le coffre éphémère partagé. */
export function signIn(env: TestEnv, userId: string): void {
  session.clear()
  session.start(userId, { db: env.vault, path: '', ephemeral: true }, Buffer.alloc(32))
}
