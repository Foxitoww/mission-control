import type { Db } from '../db/connection'

export interface RememberedSession {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
}

interface SessionRow {
  id: string
  user_id: string
  token_hash: string
  expires_at: string
}

export const sessionsRepo = {
  insert(
    db: Db,
    data: { id: string; userId: string; tokenHash: string; createdAt: string; expiresAt: string }
  ): void {
    db.prepare(
      `INSERT INTO remembered_sessions (id, user_id, token_hash, created_at, expires_at)
       VALUES (@id, @userId, @tokenHash, @createdAt, @expiresAt)`
    ).run(data)
  },

  findById(db: Db, id: string): RememberedSession | null {
    const row = db
      .prepare('SELECT id, user_id, token_hash, expires_at FROM remembered_sessions WHERE id = ?')
      .get(id) as SessionRow | undefined

    return row
      ? { id: row.id, userId: row.user_id, tokenHash: row.token_hash, expiresAt: row.expires_at }
      : null
  },

  /** Rotation : nouveau jeton et nouvelle échéance sur la même ligne. */
  rotate(db: Db, id: string, tokenHash: string, expiresAt: string): void {
    db.prepare('UPDATE remembered_sessions SET token_hash = ?, expires_at = ? WHERE id = ?').run(
      tokenHash,
      expiresAt,
      id
    )
  },

  deleteById(db: Db, id: string): void {
    db.prepare('DELETE FROM remembered_sessions WHERE id = ?').run(id)
  },

  deleteForUser(db: Db, userId: string): void {
    db.prepare('DELETE FROM remembered_sessions WHERE user_id = ?').run(userId)
  },

  /** Ménage au démarrage : une ligne périmée n'a plus aucune raison d'exister. */
  purgeExpired(db: Db, now: string): number {
    return db.prepare('DELETE FROM remembered_sessions WHERE expires_at <= ?').run(now).changes
  }
}
