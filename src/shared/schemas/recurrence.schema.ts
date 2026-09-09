import { z } from 'zod'

/**
 * Règles de récurrence (§13).
 *
 * Volontairement réduites à trois fréquences plus un intervalle, plutôt qu'à une
 * implémentation de la RFC 5545 (iCalendar). RRULE couvre « le troisième mardi
 * de chaque mois sauf en août » — de la complexité que personne ne saisit dans
 * une application de tâches, et qui rendrait la logique impossible à relire.
 *
 * L'ajout d'une fréquence (annuelle, trimestrielle) se fait en ajoutant une
 * entrée à ce tuple et une fonction d'avance dans `recurrence.ts` : rien
 * d'autre ne connaît la liste.
 */
export const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const
export type Frequency = (typeof FREQUENCIES)[number]

export const recurrenceRuleSchema = z.object({
  freq: z.enum(FREQUENCIES),
  /** « Tous les N jours / semaines / mois ». C'est cela, le mode personnalisé. */
  interval: z.number().int().min(1, 'INTERVAL_INVALID').max(365).default(1),
  /**
   * Jours retenus (0 = dimanche), pour la fréquence hebdomadaire uniquement.
   * Vide = le même jour que l'échéance d'origine.
   */
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([])
})

export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>

/** Sérialisation en colonne TEXT. `null` = tâche non récurrente. */
export function serializeRule(rule: RecurrenceRule | null): string | null {
  return rule ? JSON.stringify(rule) : null
}

/**
 * Lecture tolérante : une règle illisible désactive la récurrence au lieu de
 * faire échouer la lecture de la tâche. Une donnée corrompue ne doit pas rendre
 * une tâche inaccessible.
 */
export function parseRule(raw: string | null): RecurrenceRule | null {
  if (!raw) return null
  try {
    const parsed = recurrenceRuleSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
