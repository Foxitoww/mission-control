import type { Db } from '../db/connection'
import type { ProjectStatus } from '@shared/types/domain'
import type { ProjectSummary } from '@shared/types/views'

interface ProjectRow {
  id: string
  name: string
  description: string | null
  color: string
  icon: string | null
  status: ProjectStatus
  deadline: string | null
  position: number
  created_at: string
  updated_at: string
  task_total: number
  task_completed: number
}

/**
 * Les tâches archivées sont exclues du total : un projet dont on a archivé la
 * moitié des tâches ne doit pas paraître à moitié fait pour autant.
 *
 * PERFORMANCE. La version d'origine comptait par sous-requêtes corrélées, donc
 * DEUX balayages par projet : 200 projets sur 5000 tâches coûtaient 400 passes,
 * soit 81 ms — à eux seuls 90 % du temps de chargement du tableau de bord.
 * L'agrégat groupé ci-dessous compte tout en UNE passe, jointe une fois.
 *
 * ORDRE DES PARAMÈTRES : l'agrégat apparaît avant le WHERE extérieur dans le
 * texte SQL, donc `user_id` se lie DEUX fois — d'abord pour le sous-ensemble,
 * ensuite pour les projets. Les deux filtres sont conservés : le coffre est déjà
 * propre à un utilisateur, mais l'isolation reste vérifiable requête par requête.
 */
const SELECT_PROJECT = `
  SELECT p.id, p.name, p.description, p.color, p.icon, p.status, p.deadline,
         p.position, p.created_at, p.updated_at,
         COALESCE(agg.task_total, 0) AS task_total,
         COALESCE(agg.task_completed, 0) AS task_completed
    FROM projects p
    LEFT JOIN (
      SELECT project_id,
             COUNT(*) FILTER (WHERE status <> 'ARCHIVED')  AS task_total,
             COUNT(*) FILTER (WHERE status = 'COMPLETED')  AS task_completed
        FROM tasks
       WHERE user_id = ? AND project_id IS NOT NULL
       GROUP BY project_id
    ) agg ON agg.project_id = p.id`

function toSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    status: row.status,
    deadline: row.deadline,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    taskTotal: row.task_total,
    taskCompleted: row.task_completed,
    // Un projet vide vaut 0, jamais NaN : une division par zéro afficherait
    // « NaN % » dans la barre de progression.
    progress: row.task_total === 0 ? 0 : row.task_completed / row.task_total
  }
}

export const projectsRepo = {
  insert(
    db: Db,
    data: {
      id: string
      userId: string
      name: string
      description: string | null
      color: string
      icon: string | null
      status: ProjectStatus
      deadline: string | null
      position: number
      now: string
    }
  ): void {
    db.prepare(
      `INSERT INTO projects (id, user_id, name, description, color, icon, status, deadline,
                             position, created_at, updated_at)
       VALUES (@id, @userId, @name, @description, @color, @icon, @status, @deadline,
               @position, @now, @now)`
    ).run(data)
  },

  nextPosition(db: Db, userId: string): number {
    const row = db
      .prepare('SELECT COALESCE(MAX(position), 0) AS max FROM projects WHERE user_id = ?')
      .get(userId) as { max: number }
    return row.max + 1000
  },

  findById(db: Db, userId: string, id: string): ProjectSummary | null {
    const row = db
      .prepare(`${SELECT_PROJECT} WHERE p.user_id = ? AND p.id = ?`)
      .get(userId, userId, id) as ProjectRow | undefined
    return row ? toSummary(row) : null
  },

  list(db: Db, userId: string, statuses: ProjectStatus[] = []): ProjectSummary[] {
    const filter =
      statuses.length > 0 ? ` AND p.status IN (${statuses.map(() => '?').join(', ')})` : ''
    const rows = db
      .prepare(`${SELECT_PROJECT} WHERE p.user_id = ?${filter} ORDER BY p.position ASC`)
      .all(userId, userId, ...statuses) as ProjectRow[]
    return rows.map(toSummary)
  },

  search(db: Db, userId: string, pattern: string, limit: number): ProjectSummary[] {
    const rows = db
      .prepare(
        `${SELECT_PROJECT} WHERE p.user_id = ? AND p.name LIKE ? ESCAPE '\\' ORDER BY p.name LIMIT ?`
      )
      .all(userId, userId, pattern, limit) as ProjectRow[]
    return rows.map(toSummary)
  },

  update(
    db: Db,
    userId: string,
    id: string,
    fields: Record<string, unknown>,
    now: string
  ): boolean {
    const columns = Object.keys(fields)
    if (columns.length === 0) return true

    const assignments = columns.map((column) => `${column} = @${column}`).join(', ')
    return (
      db
        .prepare(
          `UPDATE projects SET ${assignments}, updated_at = @now WHERE id = @id AND user_id = @userId`
        )
        .run({ ...fields, now, id, userId }).changes > 0
    )
  },

  /**
   * Les tâches survivent à la suppression du projet : le schéma les détache
   * (ON DELETE SET NULL) au lieu de les effacer. Supprimer un projet ne doit
   * jamais détruire du travail déjà consigné.
   */
  delete(db: Db, userId: string, id: string): boolean {
    return (
      db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
    )
  }
}
