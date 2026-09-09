import { z } from 'zod'
import { TASK_STATUSES, TASK_PRIORITIES } from '../types/domain'

const id = z.string().uuid()

const title = z.string().trim().min(1, 'TITLE_REQUIRED').max(200, 'TITLE_TOO_LONG')

const description = z.string().trim().max(5000, 'DESCRIPTION_TOO_LONG').nullable().default(null)

/**
 * Dates transportées en ISO-8601. On valide le format plutôt que de faire
 * confiance : une chaîne libre en base rendrait tous les tris silencieusement
 * faux, puisque le tri des dates repose sur l'ordre lexicographique (§6).
 */
const isoDate = z
  .string()
  .datetime({ message: 'DATE_INVALID' })
  .nullable()
  .default(null)

export const createTaskInputSchema = z.object({
  title,
  description,
  projectId: id.nullable().default(null),
  status: z.enum(TASK_STATUSES).default('TODO'),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  dueDate: isoDate,
  estimatedMinutes: z.number().int().positive('ESTIMATE_INVALID').max(100_000).nullable().default(null),
  tagIds: z.array(id).max(20).default([])
})

export const updateTaskInputSchema = z.object({
  id,
  title: title.optional(),
  description: z.string().trim().max(5000, 'DESCRIPTION_TOO_LONG').nullable().optional(),
  projectId: id.nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: z.string().datetime({ message: 'DATE_INVALID' }).nullable().optional(),
  estimatedMinutes: z.number().int().positive('ESTIMATE_INVALID').max(100_000).nullable().optional(),
  tagIds: z.array(id).max(20).optional()
})

/**
 * Déplacement par glisser-déposer.
 *
 * Le client envoie les VOISINS visés, pas une position calculée : lui laisser
 * calculer un nombre l'obligerait à connaître le schéma d'ordonnancement, et
 * deux déplacements concurrents pourraient produire la même valeur.
 */
export const moveTaskInputSchema = z.object({
  id,
  status: z.enum(TASK_STATUSES).optional(),
  beforeId: id.nullable().default(null),
  afterId: id.nullable().default(null)
})

export const taskFilterSchema = z.object({
  search: z.string().trim().max(200).default(''),
  statuses: z.array(z.enum(TASK_STATUSES)).default([]),
  priorities: z.array(z.enum(TASK_PRIORITIES)).default([]),
  projectId: id.nullable().default(null),
  tagIds: z.array(id).max(20).default([]),
  /** Uniquement les tâches dont l'échéance est dépassée et non terminées. */
  overdue: z.boolean().default(false),
  dueBefore: z.string().datetime().nullable().default(null),
  dueAfter: z.string().datetime().nullable().default(null),
  /** Les tâches archivées restent hors des listes tant qu'on ne les demande pas. */
  includeArchived: z.boolean().default(false)
})

export const createSubtaskInputSchema = z.object({
  taskId: id,
  title: z.string().trim().min(1, 'TITLE_REQUIRED').max(200, 'TITLE_TOO_LONG')
})

export const updateSubtaskInputSchema = z.object({
  id,
  title: z.string().trim().min(1, 'TITLE_REQUIRED').max(200, 'TITLE_TOO_LONG').optional(),
  completed: z.boolean().optional()
})

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>
export type MoveTaskInput = z.infer<typeof moveTaskInputSchema>
export type TaskFilter = z.infer<typeof taskFilterSchema>
export type CreateSubtaskInput = z.infer<typeof createSubtaskInputSchema>
export type UpdateSubtaskInput = z.infer<typeof updateSubtaskInputSchema>
