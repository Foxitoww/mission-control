import { openDatabase, setDb, databasePath, type Db } from './connection'
import { migrate, currentVersion } from './migrator'
import { migrations } from './migrations'

/** Ouvre la base de l'application et la met à niveau. Appelé une fois au démarrage. */
export function initDatabase(): Db {
  const db = openDatabase(databasePath())
  const applied = migrate(db, migrations)
  if (applied > 0) {
    console.info(`[db] ${applied} migration(s) appliquée(s) — version ${currentVersion(db)}`)
  }
  setDb(db)
  return db
}

/** Base en mémoire, migrée. Utilisée par les tests — même chemin de code. */
export function createTestDatabase(): Db {
  const db = openDatabase(':memory:')
  migrate(db, migrations)
  return db
}
