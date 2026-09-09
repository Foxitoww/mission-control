import type { RecurrenceRule, Frequency } from '@shared/schemas/recurrence.schema'

/**
 * Calcul de la prochaine occurrence d'une tâche récurrente.
 *
 * Module pur : aucune base, aucune session. C'est ce qui le rend testable sur
 * les cas tordus du calendrier — 31 janvier, changement d'heure, années
 * bissextiles — sans monter la moindre infrastructure.
 */

/** Nombre maximal de sauts avant d'abandonner. Garde-fou anti-boucle infinie. */
const MAX_STEPS = 500

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * Avance d'un mois en CONSERVANT le jour, avec repli sur la fin de mois.
 *
 * Le piège classique : `setMonth(+1)` sur le 31 janvier donne le 3 mars, parce
 * que février n'a pas de 31. On teste donc le débordement et on recule sur le
 * dernier jour du mois visé — ce qu'attend quelqu'un qui a choisi « tous les
 * mois » le 31.
 */
function addMonths(date: Date, months: number): Date {
  const day = date.getDate()
  const next = new Date(date)
  next.setDate(1)
  next.setMonth(next.getMonth() + months)

  const lastDayOfTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(day, lastDayOfTargetMonth))
  return next
}

/**
 * Hebdomadaire avec jours choisis : on cherche le prochain jour retenu.
 *
 * S'il en reste un plus tard dans la semaine, on s'y place. Sinon on saute
 * `interval` semaines et on prend le premier jour retenu de cette semaine-là.
 */
function nextWeekly(from: Date, rule: RecurrenceRule): Date {
  if (rule.weekdays.length === 0) return addDays(from, 7 * rule.interval)

  const wanted = [...new Set(rule.weekdays)].sort((a, b) => a - b)
  const current = from.getDay()

  const laterThisWeek = wanted.find((day) => day > current)
  if (laterThisWeek !== undefined) return addDays(from, laterThisWeek - current)

  const first = wanted[0] as number
  // Retour au dimanche de la semaine, saut d'intervalle, puis premier jour retenu.
  return addDays(from, 7 * rule.interval - current + first)
}

/**
 * Registre des fréquences.
 *
 * Ajouter « annuelle » se fait ici, en une ligne, plus une entrée dans
 * `FREQUENCIES`. Aucun autre fichier ne connaît la liste des fréquences (§13).
 */
const ADVANCE: Record<Frequency, (from: Date, rule: RecurrenceRule) => Date> = {
  DAILY: (from, rule) => addDays(from, rule.interval),
  WEEKLY: nextWeekly,
  MONTHLY: (from, rule) => addMonths(from, rule.interval)
}

/**
 * Prochaine échéance après `previousDue`.
 *
 * DEUX RÈGLES, et la seconde est la moins évidente :
 *
 *  1. On part de l'échéance PRÉCÉDENTE, pas de la date de complétion. Sinon une
 *     tâche quotidienne terminée à 23 h puis à 1 h du matin dériverait d'heure
 *     en heure jusqu'à changer de jour.
 *  2. Si le résultat est déjà passé — la tâche a été terminée avec trois
 *     semaines de retard — on continue d'avancer jusqu'à dépasser aujourd'hui.
 *     Créer une occurrence déjà en retard remplirait la liste de retards
 *     fictifs le jour où l'on rattrape son retard.
 */
export function nextOccurrence(
  rule: RecurrenceRule,
  previousDue: Date,
  now = new Date()
): Date | null {
  const advance = ADVANCE[rule.freq]
  if (!advance) return null

  const floor = new Date(now)
  floor.setHours(0, 0, 0, 0)

  let candidate = advance(previousDue, rule)

  for (let step = 0; candidate <= floor && step < MAX_STEPS; step += 1) {
    candidate = advance(candidate, rule)
  }

  return candidate > floor ? candidate : null
}
