import type { Db } from '../db/connection'
import type { GoalStatus } from '@shared/types/domain'
import type { GoalSummary } from '@shared/types/views'

interface GoalRow {
  id: string
  project_id: string | null
  title: string
  description: string | null
  target_value: number
  current_value: number
  deadline: string | null
  status: GoalStatus
  created_at: string
  updated_at: string
  project_name: string | null
  project_color: string | null
}

const SELECT_GOAL = `
  SELECT g.id, g.project_id, g.title, g.description, g.target_value, g.current_value,
         g.deadline, g.status, g.created_at, g.updated_at,
         p.name AS project_name, p.color AS project_color
    FROM goals g
    LEFT JOIN projects p ON p.id = g.project_id`

function toSummary(row: GoalRow): GoalSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    targetValue: row.target_value,
    currentValue: row.current_value,
    deadline: row.deadline,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectName: row.project_name,
    projectColor: row.project_color,
    // Plafonné à 1 : dépasser sa cible est une bonne nouvelle, pas une barre de
    // progression qui déborde de sa boîte.
    progress: Math.min(1, row.current_value / row.target_value)
  }
}

export const goalsRepo = {
  insert(
    db: Db,
    data: {
      id: string
      userId: string
      projectId: string | null
      title: string
      description: string | null
      targetValue: number
      currentValue: number
      deadline: string | null
      status: GoalStatus
      now: string
    }
  ): void {
    db.prepare(
      `INSERT INTO goals (id, user_id, project_id, title, description, target_value,
                          current_value, deadline, status, created_at, updated_at)
       VALUES (@id, @userId, @projectId, @title, @description, @targetValue,
               @currentValue, @deadline, @status, @now, @now)`
    ).run(data)
  },

  findById(db: Db, userId: string, id: string): GoalSummary | null {
    const row = db.prepare(`${SELECT_GOAL} WHERE g.user_id = ? AND g.id = ?`).get(userId, id) as
      GoalRow | undefined
    return row ? toSummary(row) : null
  },

  list(db: Db, userId: string): GoalSummary[] {
    const rows = db
      .prepare(
        // Les actifs d'abord, puis les échéances les plus proches : l'ordre dans
        // lequel on veut les voir, pas l'ordre de création.
        `${SELECT_GOAL} WHERE g.user_id = ?
          ORDER BY CASE g.status WHEN 'ACTIVE' THEN 0 WHEN 'COMPLETED' THEN 1 ELSE 2 END,
                   g.deadline IS NULL, g.deadline ASC, g.created_at DESC`
      )
      .all(userId) as GoalRow[]
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
          `UPDATE goals SET ${assignments}, updated_at = @now WHERE id = @id AND user_id = @userId`
        )
        .run({ ...fields, now, id, userId }).changes > 0
    )
  },

  delete(db: Db, userId: string, id: string): boolean {
    return db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
  },

  counts(db: Db, userId: string): { total: number; completed: number } {
    return db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
           FROM goals WHERE user_id = ? AND status <> 'ABANDONED'`
      )
      .get(userId) as { total: number; completed: number }
  }
}
