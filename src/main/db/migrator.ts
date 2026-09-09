import type { Db } from './connection'

/**
 * Migrateur fondé sur `PRAGMA user_version`.
 *
 * SQLite réserve cet entier 32 bits à l'application : il vit dans l'en-tête du
 * fichier, ne coûte aucune table de suivi, et voyage avec la base lors d'une
 * copie ou d'une restauration de sauvegarde. Exactement ce qu'il faut pour une
 * application local-first.
 */
export interface Migration {
  version: number
  name: string
  sql: string
}

export function currentVersion(db: Db): number {
  return db.pragma('user_version', { simple: true }) as number
}

/**
 * Applique les migrations en attente et renvoie le nombre appliqué.
 *
 * Chaque migration s'exécute dans SA PROPRE transaction, avec le changement de
 * version à l'intérieur. Si une migration échoue à mi-parcours, elle est
 * intégralement annulée et `user_version` reste sur la dernière version saine :
 * la base n'est jamais laissée dans un état intermédiaire.
 */
export function migrate(db: Db, migrations: Migration[]): number {
  const from = currentVersion(db)
  let applied = 0

  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (migration.version <= from) continue

    db.transaction(() => {
      db.exec(migration.sql)
      // `pragma` n'accepte pas de paramètre lié. La valeur est un entier issu
      // du registre de migrations, jamais d'une entrée utilisateur.
      db.pragma(`user_version = ${migration.version}`)
    })()

    applied += 1
  }

  return applied
}
