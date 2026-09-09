import { z } from 'zod'
import { ACCENT_COLORS } from '../types/domain'
import { usernameSchema, displayNameSchema } from './auth.schema'

/**
 * Un avatar est soit un emoji court, soit une image encodée en data URI.
 *
 * SÉCURITÉ — le motif n'accepte QUE `data:image/…;base64,`. Autoriser une URL
 * `http(s)` ferait émettre une requête réseau au premier rendu de `<img src>` :
 * l'application cesserait d'être hors ligne, et l'hôte distant apprendrait quand
 * l'utilisateur ouvre son application. Interdire le schéma à la validation est
 * plus sûr que d'espérer que personne n'en enregistre une.
 */
const AVATAR_DATA_URI = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/

/** ~200 ko de base64, largement au-dessus d'un PNG 128×128 réellement produit. */
const MAX_AVATAR_CHARS = 200_000

/** Les emoji composés (drapeaux, familles) dépassent 8 unités UTF-16. */
const MAX_EMOJI_CHARS = 16

export const avatarSchema = z
  .string()
  .max(MAX_AVATAR_CHARS, 'AVATAR_TOO_LARGE')
  .refine((value) => value.length <= MAX_EMOJI_CHARS || AVATAR_DATA_URI.test(value), 'AVATAR_INVALID')
  .nullable()

export const accentColorSchema = z.enum(ACCENT_COLORS, {
  errorMap: () => ({ message: 'ACCENT_INVALID' })
})

export const updateProfileInputSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  avatar: avatarSchema,
  accentColor: accentColorSchema
})

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>
