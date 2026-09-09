import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'

export type Db = Database.Database

let instance: Db | null = null

/**
 * Applique les PRAGMAs. Appelé pour CHAQUE connexion, y compris en test.
 *
 * `foreign_keys` est une propriété de la CONNEXION, pas du fichier : SQLite le
 * laisse désactivé par défaut pour compatibilité historique. L'oublier rendrait
 * tous les ON DELETE CASCADE silencieusement inopérants — la suppression d'un
 * compte laisserait des données orphelines sans lever la moindre erreur.
 */
export function applyPragmas(db: Db): void {
  db.pragma('journal_mode = WAL') // lectures concurrentes, robustesse au crash
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL') // bon compromis avec WAL
  db.pragma('busy_timeout = 5000')
}

/**
 * Chemin du fichier de base, dans le dossier de données utilisateur de l'OS.
 *
 * `MC_DB_PATH` permet de pointer une base jetable pour une session de test
 * manuelle, sans toucher aux vraies données. La bascule est refusée dans une
 * application empaquetée : en production, il ne doit exister qu'un seul endroit
 * possible pour les données de l'utilisateur.
 */
export function databasePath(): string {
  const override = process.env['MC_DB_PATH']
  if (override && !app.isPackaged) return override
  return join(app.getPath('userData'), 'mission-control.db')
}

export function openDatabase(path: string): Db {
  const db = new Database(path)
  applyPragmas(db)
  return db
}

export function getDb(): Db {
  if (!instance) throw new Error('Database not initialised — call initDatabase() first')
  return instance
}

export function setDb(db: Db): void {
  instance = db
}

export function closeDatabase(): void {
  instance?.close()
  instance = null
}
