import type { Db } from '../db/connection'
import type { Task, Tag, TaskStatus, TaskPriority } from '@shared/types/domain'
import type { TaskListItem, TaskDetail } from '@shared/types/views'
import type { TaskFilter } from '@shared/schemas/task.schema'
import { parseRule } from '@shared/schemas/recurrence.schema'

interface TaskRow {
  id: string
  project_id: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  completed_at: string | null
  estimated_minutes: number | null
  position: number
  recurrence_rule: string | null
  recurrence_parent_id: string | null
  created_at: string
  updated_at: string
  project_name: string | null
  project_color: string | null
  subtask_total: number
  subtask_done: number
}

/**
 * Les compteurs de sous-tâches sont des sous-requêtes corrélées plutôt qu'un
 * GROUP BY : la jointure ne duplique donc pas les lignes de tâche, et l'index
 * idx_subtasks_task rend chaque compte immédiat.
 */
const SELECT_TASK = `
  SELECT t.id, t.project_id, t.title, t.description, t.status, t.priority,
         t.due_date, t.completed_at, t.estimated_minutes, t.position,
         t.recurrence_rule, t.recurrence_parent_id, t.created_at, t.updated_at,
         p.name AS project_name, p.color AS project_color,
         (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_total,
         (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.completed = 1) AS subtask_done
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id`

function toItem(row: TaskRow, tags: Tag[]): TaskListItem {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    estimatedMinutes: row.estimated_minutes,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recurrence: parseRule(row.recurrence_rule),
    recurrenceParentId: row.recurrence_parent_id,
    projectName: row.project_name,
    projectColor: row.project_color,
    subtaskTotal: row.subtask_total,
    subtaskDone: row.subtask_done,
    tags
  }
}

/**
 * Charge les tags de TOUTES les tâches renvoyées en une seule requête.
 *
 * La version naïve — une requête de tags par tâche — coûte 200 allers-retours
 * pour une liste de 200 tâches. Ici, c'en est un.
 */
function tagsByTask(db: Db, userId: string, taskIds: string[]): Map<string, Tag[]> {
  const map = new Map<string, Tag[]>()
  if (taskIds.length === 0) return map

  const placeholders = taskIds.map(() => '?').join(', ')
  const rows = db
    .prepare(
      // `g.user_id` est REDONDANT : les identifiants de tâches proviennent déjà
      // d'une requête filtrée par utilisateur. Il est présent quand même, pour
      // que la sûreté de CETTE requête ne dépende pas de son appelant. C'est
      // exactement ce qu'a relevé l'audit structurel : une requête sûre par
      // contexte cesse de l'être au premier appelant distrait.
      `SELECT tt.task_id, g.id, g.name, g.color
         FROM task_tags tt
         JOIN tags g ON g.id = tt.tag_id
        WHERE g.user_id = ? AND tt.task_id IN (${placeholders})
        ORDER BY g.name`
    )
    .all(userId, ...taskIds) as { task_id: string; id: string; name: string; color: string }[]

  for (const row of rows) {
    const list = map.get(row.task_id) ?? []
    list.push({ id: row.id, name: row.name, color: row.color })
    map.set(row.task_id, list)
  }
  return map
}

function hydrate(db: Db, userId: string, rows: TaskRow[]): TaskListItem[] {
  const tags = tagsByTask(
    db,
    userId,
    rows.map((row) => row.id)
  )
  return rows.map((row) => toItem(row, tags.get(row.id) ?? []))
}

/**
 * Construit la clause WHERE d'un filtre.
 *
 * Chaque fragment est paramétré : aucune valeur utilisateur n'est concaténée
 * dans le SQL. Les seuls morceaux interpolés sont des séries de `?`, dont la
 * longueur vient de tableaux déjà validés par Zod.
 */
function buildFilter(filter: TaskFilter): { sql: string; params: unknown[] } {
  // Le filtre par utilisateur n'est PLUS ajouté ici : il est écrit en toutes
  // lettres dans chaque requête appelante. Enfoui dans cette fonction, il était
  // certes toujours présent, mais invisible dans le texte SQL — donc invérifiable
  // par relecture comme par l'audit structurel. Une garantie qu'on ne peut pas
  // voir est une garantie qu'on finira par retirer sans s'en apercevoir.
  const clauses: string[] = []
  const params: unknown[] = []

  if (!filter.includeArchived) clauses.push("t.status <> 'ARCHIVED'")

  if (filter.search) {
    // ESCAPE explicite : sans lui, un titre contenant % ou _ ferait correspondre
    // n'importe quoi, ce qui est déroutant plutôt que dangereux.
    clauses.push("(t.title LIKE ? ESCAPE '\\' OR IFNULL(t.description, '') LIKE ? ESCAPE '\\')")
    const pattern = `%${filter.search.replace(/[\\%_]/g, '\\$&')}%`
    params.push(pattern, pattern)
  }

  if (filter.statuses.length > 0) {
    clauses.push(`t.status IN (${filter.statuses.map(() => '?').join(', ')})`)
    params.push(...filter.statuses)
  }

  if (filter.priorities.length > 0) {
    clauses.push(`t.priority IN (${filter.priorities.map(() => '?').join(', ')})`)
    params.push(...filter.priorities)
  }

  if (filter.projectId) {
    clauses.push('t.project_id = ?')
    params.push(filter.projectId)
  }

  if (filter.overdue) {
    clauses.push("t.due_date IS NOT NULL AND t.due_date < ? AND t.status <> 'COMPLETED'")
    params.push(new Date().toISOString())
  }

  if (filter.dueBefore) {
    clauses.push('t.due_date IS NOT NULL AND t.due_date <= ?')
    params.push(filter.dueBefore)
  }

  if (filter.dueAfter) {
    clauses.push('t.due_date IS NOT NULL AND t.due_date >= ?')
    params.push(filter.dueAfter)
  }

  if (filter.tagIds.length > 0) {
    // Sémantique ET : la tâche doit porter TOUS les tags demandés. Filtrer par
    // deux tags pour obtenir l'union serait contre-intuitif — on affine.
    clauses.push(
      `(SELECT COUNT(DISTINCT tag_id) FROM task_tags
         WHERE task_id = t.id AND tag_id IN (${filter.tagIds.map(() => '?').join(', ')})) = ?`
    )
    params.push(...filter.tagIds, filter.tagIds.length)
  }

  // `1 = 1` quand aucun filtre n'est actif : l'appelant peut alors toujours
  // écrire « WHERE t.user_id = ? AND <filtre> » sans cas particulier.
  return { sql: clauses.length > 0 ? clauses.join(' AND ') : '1 = 1', params }
}

const POSITION_STEP = 1000

export const tasksRepo = {
  insert(
    db: Db,
    data: {
      id: string
      userId: string
      projectId: string | null
      title: string
      description: string | null
      status: TaskStatus
      priority: TaskPriority
      dueDate: string | null
      completedAt: string | null
      estimatedMinutes: number | null
      position: number
      recurrenceRule: string | null
      recurrenceParentId: string | null
      now: string
    }
  ): void {
    db.prepare(
      `INSERT INTO tasks (id, user_id, project_id, title, description, status, priority,
                          due_date, completed_at, estimated_minutes, position,
                          recurrence_rule, recurrence_parent_id, created_at, updated_at)
       VALUES (@id, @userId, @projectId, @title, @description, @status, @priority,
               @dueDate, @completedAt, @estimatedMinutes, @position,
               @recurrenceRule, @recurrenceParentId, @now, @now)`
    ).run(data)
  },

  /** Position d'ajout en fin de liste. */
  nextPosition(db: Db, userId: string): number {
    const row = db
      .prepare('SELECT COALESCE(MAX(position), 0) AS max FROM tasks WHERE user_id = ?')
      .get(userId) as { max: number }
    return row.max + POSITION_STEP
  },

  findById(db: Db, userId: string, id: string): TaskDetail | null {
    const row = db
      .prepare(`${SELECT_TASK} WHERE t.user_id = ? AND t.id = ?`)
      .get(userId, id) as TaskRow | undefined
    if (!row) return null

    const [item] = hydrate(db, userId, [row])
    if (!item) return null

    const subtasks = db
      .prepare(
        'SELECT id, task_id, title, completed, position FROM subtasks WHERE task_id = ? ORDER BY position'
      )
      .all(id) as { id: string; task_id: string; title: string; completed: number; position: number }[]

    return {
      ...item,
      subtasks: subtasks.map((s) => ({
        id: s.id,
        taskId: s.task_id,
        title: s.title,
        completed: s.completed === 1,
        position: s.position
      }))
    }
  },

  list(db: Db, userId: string, filter: TaskFilter, limit = 500): TaskListItem[] {
    const { sql, params } = buildFilter(filter)
    const rows = db
      .prepare(`${SELECT_TASK} WHERE t.user_id = ? AND ${sql} ORDER BY t.position ASC LIMIT ?`)
      .all(userId, ...params, limit) as TaskRow[]
    return hydrate(db, userId, rows)
  },

  /** Requête libre pour le tableau de bord : clause et ordre fournis par le service. */
  query(db: Db, userId: string, where: string, params: unknown[], order: string, limit: number): TaskListItem[] {
    const rows = db
      .prepare(`${SELECT_TASK} WHERE t.user_id = ? AND ${where} ORDER BY ${order} LIMIT ?`)
      .all(userId, ...params, limit) as TaskRow[]
    return hydrate(db, userId, rows)
  },

  update(db: Db, userId: string, id: string, fields: Partial<Record<string, unknown>>, now: string): boolean {
    const columns = Object.keys(fields)
    if (columns.length === 0) return true

    const assignments = columns.map((column) => `${column} = @${column}`).join(', ')
    const result = db
      .prepare(`UPDATE tasks SET ${assignments}, updated_at = @now WHERE id = @id AND user_id = @userId`)
      .run({ ...fields, now, id, userId })

    return result.changes > 0
  },

  delete(db: Db, userId: string, id: string): boolean {
    return db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
  },

  positionOf(db: Db, userId: string, id: string): number | null {
    const row = db
      .prepare('SELECT position FROM tasks WHERE id = ? AND user_id = ?')
      .get(id, userId) as { position: number } | undefined
    return row?.position ?? null
  },

  bounds(db: Db, userId: string): { min: number; max: number } {
    return db
      .prepare('SELECT COALESCE(MIN(position), 0) AS min, COALESCE(MAX(position), 0) AS max FROM tasks WHERE user_id = ?')
      .get(userId) as { min: number; max: number }
  },

  /** Remplace l'ensemble des tags d'une tâche. */
  setTags(db: Db, taskId: string, tagIds: string[]): void {
    db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId)
    if (tagIds.length === 0) return

    const insert = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)')
    for (const tagId of tagIds) insert.run(taskId, tagId)
  },

  /** Les tags fournis appartiennent-ils TOUS à cet utilisateur ? */
  tagsBelongToUser(db: Db, userId: string, tagIds: string[]): boolean {
    if (tagIds.length === 0) return true
    const placeholders = tagIds.map(() => '?').join(', ')
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM tags WHERE user_id = ? AND id IN (${placeholders})`)
      .get(userId, ...tagIds) as { n: number }
    return row.n === tagIds.length
  },

  countsByStatus(db: Db, userId: string): Record<string, number> {
    const rows = db
      .prepare('SELECT status, COUNT(*) AS n FROM tasks WHERE user_id = ? GROUP BY status')
      .all(userId) as { status: string; n: number }[]
    return Object.fromEntries(rows.map((row) => [row.status, row.n]))
  }
}

export type { Task }
export { POSITION_STEP }
