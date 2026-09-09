import type { Db } from '../db/connection'
import { session } from './session.service'
import type {
  TimelineData,
  TimelineEntry,
  TimelineMilestone
} from '@shared/types/views'
import type { ProjectStatus, TaskStatus, TaskPriority } from '@shared/types/domain'

/**
 * Vue temporelle des missions (§10).
 *
 * Une mission n'a pas de « date de début » stockée : la question n'a pas de
 * réponse universelle. Elle est donc DÉDUITE de ce qui existe — la première
 * échéance de ses tâches, à défaut sa date de création. Stocker une date de
 * début serait une quatrième source de vérité à maintenir, qui divergerait
 * dès la première tâche déplacée.
 */

interface ProjectRow {
  id: string
  name: string
  color: string
  icon: string | null
  status: ProjectStatus
  deadline: string | null
  created_at: string
  first_due: string | null
  last_due: string | null
  task_total: number
  task_completed: number
}

interface MilestoneRow {
  id: string
  project_id: string | null
  title: string
  due_date: string
  status: TaskStatus
  priority: TaskPriority
}

/** Une seule ligne par mission : agrégat groupé, pas de sous-requête corrélée. */
const SELECT_TIMELINE = `
  SELECT p.id, p.name, p.color, p.icon, p.status, p.deadline, p.created_at,
         MIN(t.due_date)                                       AS first_due,
         MAX(t.due_date)                                       AS last_due,
         COUNT(t.id) FILTER (WHERE t.status <> 'ARCHIVED')     AS task_total,
         COUNT(t.id) FILTER (WHERE t.status = 'COMPLETED')     AS task_completed
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id AND t.user_id = ?
   WHERE p.user_id = ?
   GROUP BY p.id
   ORDER BY p.position ASC`

function toMilestone(row: MilestoneRow): TimelineMilestone {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.due_date,
    status: row.status,
    priority: row.priority
  }
}

function toEntry(row: ProjectRow, milestones: TimelineMilestone[]): TimelineEntry {
  // Début : la première échéance connue, sinon la création. Une mission
  // commence quand son travail commence, pas quand on l'a saisie — mais sans
  // aucune échéance, la création est la seule date qui existe.
  const start = row.first_due ?? row.created_at

  // Fin : la date limite déclarée l'emporte toujours. À défaut, la dernière
  // échéance. Sinon rien : `null` signifie « pas d'horizon », pas « aujourd'hui ».
  const end = row.deadline ?? row.last_due

  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    status: row.status,
    start,
    end,
    hasDeadline: row.deadline !== null,
    taskTotal: row.task_total,
    taskCompleted: row.task_completed,
    progress: row.task_total === 0 ? 0 : row.task_completed / row.task_total,
    milestones
  }
}

/** Bornes réelles des données. `null` quand il n'y a rien à situer. */
function computeRange(entries: TimelineEntry[], unassigned: TimelineMilestone[]): TimelineData['range'] {
  const dates: string[] = []

  for (const entry of entries) {
    dates.push(entry.start)
    if (entry.end) dates.push(entry.end)
    for (const milestone of entry.milestones) dates.push(milestone.dueDate)
  }
  for (const milestone of unassigned) dates.push(milestone.dueDate)

  if (dates.length === 0) return null

  // Les dates sont en ISO UTC : leur ordre lexicographique est leur ordre
  // chronologique, donc un tri de chaînes suffit (voir DATA-MODEL.md).
  const sorted = [...dates].sort()
  return { from: sorted[0] as string, to: sorted[sorted.length - 1] as string }
}

export const timelineService = {
  load(db: Db): TimelineData {
    const userId = session.requireUserId()

    const projectRows = db.prepare(SELECT_TIMELINE).all(userId, userId) as ProjectRow[]

    // Tous les jalons en UNE requête, groupés ensuite : le motif N+1 coûterait
    // une requête par mission (voir tasksRepo.tagsByTask).
    const milestoneRows = db
      .prepare(
        `SELECT id, project_id, title, due_date, status, priority
           FROM tasks
          WHERE user_id = ? AND due_date IS NOT NULL AND status <> 'ARCHIVED'
          ORDER BY due_date ASC`
      )
      .all(userId) as MilestoneRow[]

    const byProject = new Map<string, TimelineMilestone[]>()
    const unassigned: TimelineMilestone[] = []

    for (const row of milestoneRows) {
      const milestone = toMilestone(row)
      if (row.project_id === null) {
        unassigned.push(milestone)
        continue
      }
      const list = byProject.get(row.project_id) ?? []
      list.push(milestone)
      byProject.set(row.project_id, list)
    }

    const entries = projectRows.map((row) => toEntry(row, byProject.get(row.id) ?? []))

    return { entries, unassigned, range: computeRange(entries, unassigned) }
  }
}
