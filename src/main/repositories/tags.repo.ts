import type { Db } from '../db/connection'
import type { Tag } from '@shared/types/domain'

export interface TagWithUsage extends Tag {
  taskCount: number
}

export const tagsRepo = {
  insert(db: Db, data: { id: string; userId: string; name: string; color: string }): void {
    db.prepare('INSERT INTO tags (id, user_id, name, color) VALUES (@id, @userId, @name, @color)').run(
      data
    )
  },

  list(db: Db, userId: string): TagWithUsage[] {
    // Le compte d'usage rend le nettoyage possible : sans lui, impossible de
    // repérer les tags créés une fois puis oubliés.
    const rows = db
      .prepare(
        `SELECT g.id, g.name, g.color,
                (SELECT COUNT(*) FROM task_tags tt WHERE tt.tag_id = g.id) AS task_count
           FROM tags g
          WHERE g.user_id = ?
          ORDER BY g.name`
      )
      .all(userId) as { id: string; name: string; color: string; task_count: number }[]

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      taskCount: row.task_count
    }))
  },

  search(db: Db, userId: string, pattern: string, limit: number): Tag[] {
    return db
      .prepare(
        `SELECT id, name, color FROM tags
          WHERE user_id = ? AND name LIKE ? ESCAPE '\\'
          ORDER BY name LIMIT ?`
      )
      .all(userId, pattern, limit) as Tag[]
  },

  findByName(db: Db, userId: string, name: string): Tag | null {
    const row = db
      .prepare('SELECT id, name, color FROM tags WHERE user_id = ? AND name = ?')
      .get(userId, name) as Tag | undefined
    return row ?? null
  },

  /** Un AUTRE tag porte-t-il déjà ce nom ? Exclut la ligne courante au renommage. */
  nameTakenByOther(db: Db, userId: string, name: string, exceptId: string): boolean {
    return (
      db
        .prepare('SELECT 1 FROM tags WHERE user_id = ? AND name = ? AND id <> ?')
        .get(userId, name, exceptId) !== undefined
    )
  },

  update(db: Db, userId: string, id: string, fields: Record<string, unknown>): boolean {
    const columns = Object.keys(fields)
    if (columns.length === 0) return true

    const assignments = columns.map((column) => `${column} = @${column}`).join(', ')
    return (
      db
        .prepare(`UPDATE tags SET ${assignments} WHERE id = @id AND user_id = @userId`)
        .run({ ...fields, id, userId }).changes > 0
    )
  },

  /** La cascade de task_tags retire l'étiquette de toutes les tâches concernées. */
  delete(db: Db, userId: string, id: string): boolean {
    return db.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
  }
}
