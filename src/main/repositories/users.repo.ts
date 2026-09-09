import type { Db } from '../db/connection'
import type { PublicUser } from '@shared/types/domain'

/**
 * Enregistrement interne, avec le hash. Ne quitte JAMAIS le processus main.
 * Le type PublicUser (sans passwordHash) est le seul à traverser l'IPC.
 */
export interface UserRecord extends PublicUser {
  passwordHash: string
}

interface UserRow {
  id: string
  username: string
  display_name: string
  password_hash: string
  avatar: string | null
  created_at: string
}

const PUBLIC_COLUMNS = 'id, username, display_name, avatar, created_at'

function toPublic(row: Omit<UserRow, 'password_hash'>): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar,
    createdAt: row.created_at
  }
}

function toRecord(row: UserRow): UserRecord {
  return { ...toPublic(row), passwordHash: row.password_hash }
}

export const usersRepo = {
  insert(
    db: Db,
    user: { id: string; username: string; displayName: string; passwordHash: string; avatar: string | null; now: string }
  ): void {
    db.prepare(
      `INSERT INTO users (id, username, display_name, password_hash, avatar, created_at, updated_at)
       VALUES (@id, @username, @displayName, @passwordHash, @avatar, @now, @now)`
    ).run(user)
  },

  /** Seul point d'accès au hash — réservé à la vérification de mot de passe. */
  findByUsername(db: Db, username: string): UserRecord | null {
    const row = db
      .prepare(`SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE username = ?`)
      .get(username) as UserRow | undefined
    return row ? toRecord(row) : null
  },

  findById(db: Db, id: string): PublicUser | null {
    const row = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id) as
      | Omit<UserRow, 'password_hash'>
      | undefined
    return row ? toPublic(row) : null
  },

  /**
   * Profils affichés sur l'écran de connexion. N'expose que l'identité visible :
   * aucune donnée métier, aucun compteur, aucun hash.
   */
  listPublic(db: Db): PublicUser[] {
    const rows = db
      .prepare(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY created_at ASC`)
      .all() as Omit<UserRow, 'password_hash'>[]
    return rows.map(toPublic)
  },

  /** La cascade du schéma efface projets, tâches, tags, objectifs et paramètres. */
  deleteById(db: Db, id: string): void {
    db.prepare('DELETE FROM users WHERE id = ?').run(id)
  }
}
