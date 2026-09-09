import { Notification } from 'electron'
import type { Db } from '../db/connection'
import { tasksRepo } from '../repositories/tasks.repo'
import { settingsRepo } from '../repositories/settings.repo'
import { session } from './session.service'

/**
 * Notifications LOCALES (§16).
 *
 * Aucun serveur, aucun service de push : l'application interroge sa propre base
 * et demande au système d'afficher une bulle. C'est la seule forme de
 * notification compatible avec le principe local-first — et la seule qui
 * fonctionne hors ligne.
 */

/** Intervalle de vérification. Une échéance n'est jamais à la minute près. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000

/**
 * Tâches déjà signalées, en mémoire.
 *
 * Purgé à la fermeture de session. La conséquence assumée : relancer
 * l'application redonne un rappel pour une tâche toujours en retard. C'est
 * voulu — une tâche en retard depuis trois jours mérite d'être rappelée, et
 * persister cet état ajouterait une table pour éviter un rappel utile.
 */
const notified = new Set<string>()

let timer: NodeJS.Timeout | null = null

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return
  new Notification({ title, body, silent: false }).show()
}

function checkOnce(db: Db): void {
  const userId = session.userId
  if (!userId) return

  if (settingsRepo.get(db, userId)?.notificationsEnabled !== true) return

  const now = new Date()
  const horizon = new Date(now)
  horizon.setDate(horizon.getDate() + 1)

  const due = tasksRepo.query(
    db,
    userId,
    `t.due_date IS NOT NULL AND t.due_date <= ? AND t.status IN ('TODO','IN_PROGRESS','BLOCKED')`,
    [horizon.toISOString()],
    't.due_date ASC',
    20
  )

  const overdue = due.filter((task) => task.dueDate !== null && new Date(task.dueDate) < now)
  const soon = due.filter((task) => !overdue.includes(task))

  // Une seule bulle groupée plutôt qu'une par tâche : dix notifications
  // simultanées se chassent l'une l'autre et n'informent de rien.
  const freshOverdue = overdue.filter((task) => !notified.has(`late:${task.id}`))
  if (freshOverdue.length > 0) {
    const first = freshOverdue[0]
    notify(
      'MISSION CONTROL — Retard',
      freshOverdue.length === 1 && first
        ? first.title
        : `${freshOverdue.length} opérations ont dépassé leur échéance.`
    )
    for (const task of freshOverdue) notified.add(`late:${task.id}`)
  }

  const freshSoon = soon.filter((task) => !notified.has(`soon:${task.id}`))
  if (freshSoon.length > 0) {
    const first = freshSoon[0]
    notify(
      'MISSION CONTROL — Échéance proche',
      freshSoon.length === 1 && first
        ? first.title
        : `${freshSoon.length} opérations arrivent à échéance.`
    )
    for (const task of freshSoon) notified.add(`soon:${task.id}`)
  }
}

export const notificationsService = {
  /**
   * Démarre la surveillance. `db` est résolu à chaque tour plutôt que capturé :
   * le coffre change à chaque connexion, et retenir une référence ferait écrire
   * dans une base fermée.
   */
  start(resolveDb: () => Db | null): void {
    notificationsService.stop()

    const tick = (): void => {
      try {
        const db = resolveDb()
        if (db) checkOnce(db)
      } catch (error) {
        // Un rappel manqué ne doit jamais faire tomber l'application.
        console.error('[notifications]', error)
      }
    }

    // `unref` : ce minuteur ne doit pas à lui seul maintenir le processus en vie.
    timer = setInterval(tick, CHECK_INTERVAL_MS)
    timer.unref()

    // Premier passage différé, pour ne pas concurrencer le premier rendu.
    setTimeout(tick, 20_000).unref()
  },

  stop(): void {
    if (timer) clearInterval(timer)
    timer = null
  },

  /** Purge la mémoire des rappels : appelé à la déconnexion. */
  reset(): void {
    notified.clear()
  }
}
