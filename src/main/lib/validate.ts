import type { ZodType } from 'zod'
import { AppError, AppErrorCode } from '@shared/errors'

/**
 * Applique un schéma Zod et convertit un échec en AppError.
 *
 * Le message renvoyé est la CLÉ d'erreur du schéma (`USERNAME_TOO_SHORT`…), pas
 * une phrase : le renderer la traduit dans la langue de l'utilisateur. C'est ce
 * qui permet d'avoir FR et EN sans dupliquer les règles de validation.
 */
export function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new AppError(AppErrorCode.VALIDATION_FAILED, first?.message ?? 'VALIDATION_FAILED')
  }
  return result.data
}
