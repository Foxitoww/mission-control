import type { Db } from '../db/connection'
import { tasksRepo } from '../repositories/tasks.repo'
import { projectsRepo } from '../repositories/projects.repo'
import { session } from './session.service'
import type { DashboardData, MissionStats } from '@shared/types/views'

/**
 * Bornes de la journée LOCALE, converties en ISO UTC pour la comparaison.
 *
 * `setHours` travaille dans le fuseau de la machine — et comme le processus
 * main tourne sur la machine de l'utilisateur, ce fuseau EST le sien. C'est un
 * des avantages discrets du local-first : « aujourd'hui » n'a aucune ambiguïté,
 * là où une application serveur devrait transporter un fuseau à chaque requête.
 */
function dayBounds(reference = new Date()): { start: string; end: string; now: string } {
  const start = new Date(reference)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  return { start: start.toISOString(), end: end.toISOString(), now: reference.toISOString() }
}

const ACTIVE_STATUSES = "('TODO','IN_PROGRESS','BLOCKED')"

function computeStats(db: Db, userId: string, now: string): MissionStats {
  const counts = tasksRepo.countsByStatus(db, userId)

  const completed = counts['COMPLETED'] ?? 0
  const active = (counts['TODO'] ?? 0) + (counts['IN_PROGRESS'] ?? 0) + (counts['BLOCKED'] ?? 0)
  // Les archivées sortent du total : elles ne sont plus en jeu, et les compter
  // ferait chuter le taux de complétion sans raison.
  const total = completed + active

  const overdue = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM tasks
          WHERE user_id = ? AND due_date IS NOT NULL AND due_date < ?
            AND status IN ${ACTIVE_STATUSES}`
      )
      .get(userId, now) as { n: number }
  ).n

  return {
    total,
    completed,
    active,
    overdue,
    completionRate: total === 0 ? 0 : completed / total
  }
}

export const dashboardService = {
  load(db: Db): DashboardData {
    const userId = session.requireUserId()
    const { start, end, now } = dayBounds()

    const overdue = tasksRepo.query(
      db,
      userId,
      `t.due_date IS NOT NULL AND t.due_date < ? AND t.status IN ${ACTIVE_STATUSES}`,
      [start],
      't.due_date ASC',
      20
    )

    const today = tasksRepo.query(
      db,
      userId,
      `t.due_date >= ? AND t.due_date < ? AND t.status IN ${ACTIVE_STATUSES}`,
      [start, end],
      "CASE t.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, t.due_date ASC",
      20
    )

    // Prioritaires SANS échéance proche : celles du jour et les retards ont déjà
    // leur bloc, les répéter ici diluerait le signal.
    const priority = tasksRepo.query(
      db,
      userId,
      `t.priority IN ('HIGH','CRITICAL') AND t.status IN ${ACTIVE_STATUSES}
       AND (t.due_date IS NULL OR t.due_date >= ?)`,
      [end],
      "CASE t.priority WHEN 'CRITICAL' THEN 0 ELSE 1 END, t.position ASC",
      10
    )

    const upcoming = tasksRepo.query(
      db,
      userId,
      `t.due_date >= ? AND t.status IN ${ACTIVE_STATUSES}`,
      [end],
      't.due_date ASC',
      10
    )

    const recent = tasksRepo.query(db, userId, "t.status <> 'ARCHIVED'", [], 't.updated_at DESC', 8)

    return {
      overdue,
      today,
      priority,
      upcoming,
      recent,
      activeProjects: projectsRepo.list(db, userId, ['ACTIVE']),
      stats: computeStats(db, userId, now)
    }
  }
}
