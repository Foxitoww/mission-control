import { z } from 'zod'
import { ACCENT_COLORS } from '../types/domain'

const id = z.string().uuid()

/**
 * Carnet d'adresses local (V1 hors-ligne). Les couleurs réutilisent la palette
 * curatée des projets — même raison : cohérence visuelle plutôt qu'un choix
 * libre (voir project.schema.ts).
 */
const color = z.enum(ACCENT_COLORS, { errorMap: () => ({ message: 'COLOR_INVALID' }) })

/**
 * `.nullable()` sans `.optional()` sur le format : un appelant qui n'a pas
 * d'adresse envoie `null` (jamais `''`), qui contourne `.email()` sans
 * l'affaiblir pour une vraie valeur mal formée — la « validation stricte »
 * porte sur ce qui est fourni, pas sur son absence.
 */
const email = z.string().trim().toLowerCase().email('EMAIL_INVALID').max(254).nullable()
const phone = z.string().trim().max(32, 'PHONE_TOO_LONG').nullable()
const company = z.string().trim().max(120, 'COMPANY_TOO_LONG').nullable()
const notes = z.string().trim().max(2000, 'NOTES_TOO_LONG').nullable()

/** Un contact peut être lié à plusieurs projets dès sa création. */
const projectIds = z.array(id).max(50, 'TOO_MANY_PROJECTS')

export const createContactInputSchema = z.object({
  name: z.string().trim().min(1, 'NAME_REQUIRED').max(120, 'NAME_TOO_LONG'),
  email: email.default(null),
  phone: phone.default(null),
  company: company.default(null),
  notes: notes.default(null),
  color: color.default(ACCENT_COLORS[0]),
  projectIds: projectIds.default([])
})

export const updateContactInputSchema = z.object({
  id,
  name: z.string().trim().min(1, 'NAME_REQUIRED').max(120, 'NAME_TOO_LONG').optional(),
  email: email.optional(),
  phone: phone.optional(),
  company: company.optional(),
  notes: notes.optional(),
  color: color.optional(),
  projectIds: projectIds.optional()
})

export type CreateContactInput = z.infer<typeof createContactInputSchema>
export type UpdateContactInput = z.infer<typeof updateContactInputSchema>
