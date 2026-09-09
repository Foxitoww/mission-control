import { z } from 'zod'

/**
 * Schémas de validation partagés.
 *
 * Importés par le RENDERER (retour de formulaire immédiat) et re-appliqués par le
 * MAIN à l'entrée de chaque handler IPC. Le renderer est, par principe, non fiable :
 * valider deux fois n'est pas de la duplication, ce sont deux usages d'une même règle.
 */

/** Minuscules, chiffres, tiret bas et tiret. Sert d'identifiant de connexion. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'USERNAME_TOO_SHORT')
  .max(32, 'USERNAME_TOO_LONG')
  .regex(/^[a-z0-9_-]+$/, 'USERNAME_INVALID_CHARS')

/**
 * Longueur minimale de 8 sans exigence de composition.
 * Les règles de composition (majuscule, chiffre, symbole) poussent en pratique vers
 * des mots de passe courts et prévisibles ; la longueur est le facteur qui compte.
 * Recommandation NIST SP 800-63B.
 */
export const passwordSchema = z
  .string()
  .min(8, 'PASSWORD_TOO_SHORT')
  .max(200, 'PASSWORD_TOO_LONG')

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'DISPLAY_NAME_REQUIRED')
  .max(64, 'DISPLAY_NAME_TOO_LONG')

export const registerInputSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  avatar: z.string().max(16).nullable().default(null)
})

export const loginInputSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, 'PASSWORD_REQUIRED'),
  /**
   * « Se souvenir de moi ». Par défaut FALSE — l'utilisateur doit le demander.
   * Sur un poste partagé, rester connecté est un choix, jamais une surprise.
   */
  remember: z.boolean().default(false)
})

export const deleteAccountInputSchema = z.object({
  password: z.string().min(1, 'PASSWORD_REQUIRED')
})

export type RegisterInput = z.infer<typeof registerInputSchema>
export type LoginInput = z.infer<typeof loginInputSchema>
export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>
