import type { Db } from '../db/connection'
import type { TaskComment } from '@shared/types/views'

/**
 * Fil de discussion d'une tâche.
 *
 * Pas de `user_id` : la propriété se déduit de la tâche parente, comme pour les
 * sous-tâches. Chaque méthode suppose donc que l'appelant a déjà vérifié cette
 * propriété — c'est le rôle du service. `ownerOf` rend la vérification possible
 * en une requête.
 */
interface CommentRow {
  id: string
  task_id: string
  body: string
  edited: number
  created_at: string
  updated_at: string
}

function toComment(row: CommentRow): TaskComment {
  return {
    id: row.id,
    taskId: row.task_id,
    body: row.body,
    edited: row.edited === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const taskCommentsRepo = {
  insert(db: Db, data: { id: string; taskId: string; body: string; now: string }): void {
    db.prepare(
      `INSERT INTO task_comments (id, task_id, body, edited, created_at, updated_at)
       VALUES (@id, @taskId, @body, 0, @now, @now)`
    ).run(data)
  },

  /** Le fil d'une tâche, du plus ancien au plus récent : ordre de lecture. */
  listForTask(db: Db, taskId: string): TaskComment[] {
    const rows = db
      .prepare(
        `SELECT id, task_id, body, edited, created_at, updated_at
           FROM task_comments WHERE task_id = ? ORDER BY created_at ASC`
      )
      .all(taskId) as CommentRow[]
    return rows.map(toComment)
  },

  /** Utilisateur propriétaire de la tâche parente, ou `null` si le message n'existe pas. */
  ownerOf(db: Db, commentId: string): string | null {
    const row = db
      .prepare(
        `SELECT t.user_id FROM task_comments c JOIN tasks t ON t.id = c.task_id WHERE c.id = ?`
      )
      .get(commentId) as { user_id: string } | undefined
    return row?.user_id ?? null
  },

  /** Tâche parente d'un message. */
  taskIdOf(db: Db, commentId: string): string | null {
    const row = db.prepare('SELECT task_id FROM task_comments WHERE id = ?').get(commentId) as
      { task_id: string } | undefined
    return row?.task_id ?? null
  },

  update(db: Db, id: string, body: string, now: string): boolean {
    // `edited = 1` définitivement : un message retouché reste marqué comme tel.
    return (
      db
        .prepare(
          `UPDATE task_comments SET body = @body, edited = 1, updated_at = @now WHERE id = @id`
        )
        .run({ body, now, id }).changes > 0
    )
  },

  delete(db: Db, id: string): boolean {
    return db.prepare('DELETE FROM task_comments WHERE id = ?').run(id).changes > 0
  }
}
