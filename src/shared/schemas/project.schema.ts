import { z } from 'zod'
import { PROJECT_STATUSES, ACCENT_COLORS } from '../types/domain'

const id = z.string().uuid()

/**
 * Les couleurs de projet réutilisent la palette curatée du profil.
 *
 * Un projet est une mission : sa couleur apparaît partout, dans les listes comme
 * dans le calendrier. Autoriser une couleur libre ferait perdre au tableau de
 * bord sa lisibilité dès le troisième projet (§20).
 */
const color = z.enum(ACCENT_COLORS, { errorMap: () => ({ message: 'COLOR_INVALID' }) })

export const createProjectInputSchema = z.object({
  name: z.string().trim().min(1, 'NAME_REQUIRED').max(120, 'NAME_TOO_LONG'),
  description: z.string().trim().max(2000, 'DESCRIPTION_TOO_LONG').nullable().default(null),
  color: color.default(ACCENT_COLORS[0]),
  icon: z.string().max(16).nullable().default(null),
  status: z.enum(PROJECT_STATUSES).default('ACTIVE'),
  deadline: z.string().datetime({ message: 'DATE_INVALID' }).nullable().default(null)
})

export const updateProjectInputSchema = z.object({
  id,
  name: z.string().trim().min(1, 'NAME_REQUIRED').max(120, 'NAME_TOO_LONG').optional(),
  description: z.string().trim().max(2000, 'DESCRIPTION_TOO_LONG').nullable().optional(),
  color: color.optional(),
  icon: z.string().max(16).nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  deadline: z.string().datetime({ message: 'DATE_INVALID' }).nullable().optional()
})

export const createTagInputSchema = z.object({
  name: z.string().trim().min(1, 'NAME_REQUIRED').max(32, 'NAME_TOO_LONG'),
  color: color.default(ACCENT_COLORS[1])
})

export const updateTagInputSchema = z.object({
  id,
  name: z.string().trim().min(1, 'NAME_REQUIRED').max(32, 'NAME_TOO_LONG').optional(),
  color: color.optional()
})

export const idInputSchema = z.object({ id })

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>
export type CreateTagInput = z.infer<typeof createTagInputSchema>
export type UpdateTagInput = z.infer<typeof updateTagInputSchema>
