import { z } from 'zod'
import { GOAL_STATUSES } from '../types/domain'

const id = z.string().uuid()

/**
 * Un objectif est une cible chiffrée : « terminer 20 opérations ce mois-ci »,
 * « lire 12 ouvrages ». La progression est donc `current / target`, et non un
 * pourcentage saisi à la main — un pourcentage que l'on met à jour soi-même
 * cesse d'être vrai dès la deuxième semaine.
 */
export const createGoalInputSchema = z.object({
  title: z.string().trim().min(1, 'TITLE_REQUIRED').max(200, 'TITLE_TOO_LONG'),
  description: z.string().trim().max(2000, 'DESCRIPTION_TOO_LONG').nullable().default(null),
  projectId: id.nullable().default(null),
  targetValue: z.number().positive('TARGET_INVALID').max(1_000_000).default(100),
  currentValue: z.number().min(0, 'CURRENT_INVALID').max(1_000_000).default(0),
  deadline: z.string().datetime({ message: 'DATE_INVALID' }).nullable().default(null),
  status: z.enum(GOAL_STATUSES).default('ACTIVE')
})

export const updateGoalInputSchema = z.object({
  id,
  title: z.string().trim().min(1, 'TITLE_REQUIRED').max(200, 'TITLE_TOO_LONG').optional(),
  description: z.string().trim().max(2000, 'DESCRIPTION_TOO_LONG').nullable().optional(),
  projectId: id.nullable().optional(),
  targetValue: z.number().positive('TARGET_INVALID').max(1_000_000).optional(),
  currentValue: z.number().min(0, 'CURRENT_INVALID').max(1_000_000).optional(),
  deadline: z.string().datetime({ message: 'DATE_INVALID' }).nullable().optional(),
  status: z.enum(GOAL_STATUSES).optional()
})

/** Incrément rapide depuis la carte, sans ouvrir le formulaire. */
export const advanceGoalInputSchema = z.object({
  id,
  by: z.number().min(-1_000_000).max(1_000_000)
})

export type CreateGoalInput = z.infer<typeof createGoalInputSchema>
export type UpdateGoalInput = z.infer<typeof updateGoalInputSchema>
export type AdvanceGoalInput = z.infer<typeof advanceGoalInputSchema>
