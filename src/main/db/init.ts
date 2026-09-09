import { openDatabase, setAccountsDb, accountsPath, applyPragmas, type Db } from './connection'
import { migrate, currentVersion } from './migrator'
import { accountMigrations } from './migrations/accounts'
import { vaultMigrations } from './migrations/vault'
import Database from 'better-sqlite3'

/** Ouvre la base des comptes et la met à niveau. Appelé une fois au démarrage. */
export function initAccounts(): Db {
  const db = openDatabase(accountsPath())
  const applied = migrate(db, accountMigrations)
  if (applied > 0) {
    console.info(`[db] comptes — ${applied} migration(s), version ${currentVersion(db)}`)
  }
  setAccountsDb(db)
  return db
}

/**
 * Base des comptes en mémoire, migrée. Pour les tests.
 *
 * Les coffres de test, eux, restent des bases en mémoire non chiffrées : le
 * chiffrement est vérifié séparément, et l'imposer à chaque test du domaine
 * ajouterait une dérivation scrypt de 100 ms par cas.
 */
export function createTestAccountsDb(): Db {
  const db = new Database(':memory:')
  applyPragmas(db)
  migrate(db, accountMigrations)
  return db
}

export function createTestVaultDb(): Db {
  const db = new Database(':memory:')
  applyPragmas(db)
  migrate(db, vaultMigrations)
  return db
}
