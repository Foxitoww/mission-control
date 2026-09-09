import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'

export type Db = Database.Database

let accounts: Db | null = null

/**
 * Applique les PRAGMAs. Appelé pour CHAQUE connexion, y compris pour un coffre
 * en mémoire et en test.
 *
 * `foreign_keys` est une propriété de la CONNEXION, pas du fichier : SQLite le
 * laisse désactivé par défaut pour compatibilité historique. L'oublier rendrait
 * tous les ON DELETE CASCADE silencieusement inopérants.
 */
export function applyPragmas(db: Db): void {
  db.pragma('journal_mode = WAL') // sans effet en mémoire, indispensable sur fichier
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')
}

/**
 * Base des COMPTES, en clair. Voir accounts/001_accounts.sql : elle ne contient
 * que l'identité visible et des clés enveloppées, jamais de données métier.
 *
 * `MC_DB_PATH` permet de pointer une base jetable pour une session de test
 * manuelle. La bascule est refusée dans une application empaquetée.
 */
export function accountsPath(): string {
  const override = process.env['MC_DB_PATH']
  if (override && !app.isPackaged) return override
  return join(app.getPath('userData'), 'accounts.db')
}

export function openDatabase(path: string): Db {
  const db = new Database(path)
  applyPragmas(db)
  return db
}

export function getAccountsDb(): Db {
  if (!accounts) throw new Error('Accounts database not initialised — call initAccounts() first')
  return accounts
}

export function setAccountsDb(db: Db): void {
  accounts = db
}

export function closeAccountsDb(): void {
  accounts?.close()
  accounts = null
}
