import { z } from 'zod'
import type { Db } from '../db/connection'
import { projectsRepo } from '../repositories/projects.repo'
import { goalsRepo } from '../repositories/goals.repo'
import { tasksRepo } from '../repositories/tasks.repo'
import { session } from './session.service'
import { parseOrThrow } from '../lib/validate'
import { TASK_PRIORITIES, type TaskPriority } from '@shared/types/domain'
import type { StatsData, DailyActivity } from '@shared/types/views'

const statsInputSchema = z.object({
  /** Fenêtre d'observation. 30 jours par défaut, 365 au maximum. */
  days: z.number().int().min(7).max(365).default(30)
})

/**
 * Regroupement par jour LOCAL.
 *
 * Les dates sont stockées en ISO UTC. `date(x)` de SQLite donnerait donc le jour
 * UTC : une tâche terminée à 1 h du matin à Paris compterait pour la veille. Le
 * modificateur `'localtime'` convertit avant de découper — et comme le processus
 * main tourne sur la machine de l'utilisateur, ce fuseau est bien le sien.
 */
const LOCAL_DAY = "date(%s, 'localtime')"

function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Série continue de jours, trous compris.
 *
 * SQL ne renvoie que les jours où quelque chose s'est passé. Un histogramme qui
 * saute les jours vides ment sur le rythme : trois barres côte à côte laissent
 * croire à trois jours consécutifs alors qu'ils sont espacés d'une semaine.
 */
function buildDailySeries(
  days: number,
  created: Map<string, number>,
  completed: Map<string, number>
): DailyActivity[] {
  const series: DailyActivity[] = []
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  cursor.setDate(cursor.getDate() - (days - 1))

  for (let index = 0; index < days; index += 1) {
    const key = localDayKey(cursor)
    series.push({
      date: key,
      created: created.get(key) ?? 0,
      completed: completed.get(key) ?? 0
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  return series
}

/**
 * Jours consécutifs avec au moins une complétion.
 *
 * On part de la fin et on remonte. Le jour EN COURS ne casse pas la série s'il
 * est encore vide : à 9 h du matin, personne n'a « perdu » sa série — elle
 * n'aurait pas de sens si elle repartait de zéro chaque matin.
 */
function computeStreak(series: DailyActivity[]): number {
  let streak = 0

  for (let index = series.length - 1; index >= 0; index -= 1) {
    const day = series[index] as DailyActivity
    if (day.completed > 0) {
      streak += 1
      continue
    }
    // Tolérance pour le jour en cours uniquement.
    if (index === series.length - 1) continue
    break
  }

  return streak
}

function countByDay(db: Db, userId: string, column: string, since: string): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT ${LOCAL_DAY.replace('%s', column)} AS day, COUNT(*) AS n
         FROM tasks
        WHERE user_id = ? AND ${column} IS NOT NULL AND ${column} >= ?
        GROUP BY day`
    )
    .all(userId, since) as { day: string; n: number }[]

  return new Map(rows.map((row) => [row.day, row.n]))
}

export const statsService = {
  load(db: Db, input: unknown): StatsData {
    const userId = session.requireUserId()
    const { days } = parseOrThrow(statsInputSchema, input ?? {})

    const from = new Date()
    from.setHours(0, 0, 0, 0)
    from.setDate(from.getDate() - (days - 1))
    const since = from.toISOString()

    const daily = buildDailySeries(
      days,
      // `column` ne vient jamais d'une entrée utilisateur : ce sont deux
      // littéraux du code, ce qui rend l'interpolation SQL sûre ici.
      countByDay(db, userId, 'created_at', since),
      countByDay(db, userId, 'completed_at', since)
    )

    const priorityRows = db
      .prepare(
        `SELECT priority,
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
           FROM tasks
          WHERE user_id = ? AND status <> 'ARCHIVED'
          GROUP BY priority`
      )
      .all(userId) as { priority: TaskPriority; total: number; completed: number }[]

    const byPriorityMap = new Map(priorityRows.map((row) => [row.priority, row]))

    const estimated = db
      .prepare(
        `SELECT COALESCE(SUM(estimated_minutes), 0) AS minutes
           FROM tasks
          WHERE user_id = ? AND status = 'COMPLETED' AND completed_at >= ?`
      )
      .get(userId, since) as { minutes: number }

    const counts = tasksRepo.countsByStatus(db, userId)
    const completed = counts['COMPLETED'] ?? 0
    const active = (counts['TODO'] ?? 0) + (counts['IN_PROGRESS'] ?? 0) + (counts['BLOCKED'] ?? 0)
    const total = completed + active

    const overdue = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM tasks
            WHERE user_id = ? AND due_date IS NOT NULL AND due_date < ?
              AND status IN ('TODO','IN_PROGRESS','BLOCKED')`
        )
        .get(userId, new Date().toISOString()) as { n: number }
    ).n

    return {
      totals: {
        total,
        completed,
        active,
        overdue,
        completionRate: total === 0 ? 0 : completed / total
      },
      daily,
      // Toutes les priorités sont présentes, même à zéro : un histogramme dont
      // les colonnes apparaissent et disparaissent est illisible d'une semaine
      // sur l'autre.
      byPriority: TASK_PRIORITIES.map((priority) => ({
        priority,
        total: byPriorityMap.get(priority)?.total ?? 0,
        completed: byPriorityMap.get(priority)?.completed ?? 0
      })),
      byProject: projectsRepo.list(db, userId),
      goals: goalsRepo.counts(db, userId),
      streak: computeStreak(daily),
      estimatedMinutesCompleted: estimated.minutes
    }
  }
}
