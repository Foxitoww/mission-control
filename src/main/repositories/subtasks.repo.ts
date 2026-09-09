import type { Db } from '../db/connection'

/**
 * Les sous-tâches ne portent PAS de `user_id` : leur propriété se déduit de la
 * tâche parente. Chaque méthode ci-dessous exige donc que l'appelant ait déjà
 * vérifié que la tâche appartient à l'utilisateur — c'est le rôle du service.
 *
 * `ownerOf` existe précisément pour rendre cette vérification possible en une
 * requête, plutôt que de dupliquer une jointure partout.
 */
export const subtasksRepo = {
  insert(db: Db, data: { id: string; taskId: string; title: string; position: number }): void {
    db.prepare(
      'INSERT INTO subtasks (id, task_id, title, position) VALUES (@id, @taskId, @title, @position)'
    ).run(data)
  },

  nextPosition(db: Db, taskId: string): number {
    const row = db
      .prepare('SELECT COALESCE(MAX(position), 0) AS max FROM subtasks WHERE task_id = ?')
      .get(taskId) as { max: number }
    return row.max + 1000
  },

  /** Utilisateur propriétaire de la tâche parente, ou null si la sous-tâche n'existe pas. */
  ownerOf(db: Db, subtaskId: string): string | null {
    const row = db
      .prepare(
        `SELECT t.user_id FROM subtasks s JOIN tasks t ON t.id = s.task_id WHERE s.id = ?`
      )
      .get(subtaskId) as { user_id: string } | undefined
    return row?.user_id ?? null
  },

  update(db: Db, id: string, fields: Record<string, unknown>): boolean {
    const columns = Object.keys(fields)
    if (columns.length === 0) return true

    const assignments = columns.map((column) => `${column} = @${column}`).join(', ')
    return db.prepare(`UPDATE subtasks SET ${assignments} WHERE id = @id`).run({ ...fields, id }).changes > 0
  },

  delete(db: Db, id: string): boolean {
    return db.prepare('DELETE FROM subtasks WHERE id = ?').run(id).changes > 0
  },

  /** Réordonne en écrivant les positions dans l'ordre fourni, en une transaction. */
  reorder(db: Db, taskId: string, orderedIds: string[]): void {
    const update = db.prepare('UPDATE subtasks SET position = ? WHERE id = ? AND task_id = ?')
    db.transaction(() => {
      orderedIds.forEach((id, index) => update.run((index + 1) * 1000, id, taskId))
    })()
  }
}
