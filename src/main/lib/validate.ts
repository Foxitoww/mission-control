import type { ZodTypeAny, output } from 'zod'
import { AppError, AppErrorCode } from '@shared/errors'

/**
 * Applique un schéma Zod et convertit un échec en AppError.
 *
 * Le type de retour est `output<S>`, PAS un paramètre libre `T`. La nuance est
 * essentielle : un schéma qui utilise `.default()` a un type d'entrée (le champ
 * est facultatif) différent de son type de sortie (le champ est garanti). Typer
 * la fonction `ZodType<T>` force les deux à coïncider, et TypeScript retient
 * alors la forme d'ENTRÉE — donc `string | undefined` là où la validation
 * garantit `string`. `output<S>` prend la forme d'après validation, qui est
 * précisément ce que l'appelant reçoit.
 *
 * Le message renvoyé est la CLÉ d'erreur du schéma (`USERNAME_TOO_SHORT`…), pas
 * une phrase : le renderer la traduit dans la langue de l'utilisateur. C'est ce
 * qui permet d'avoir FR et EN sans dupliquer les règles de validation.
 */
export function parseOrThrow<S extends ZodTypeAny>(schema: S, input: unknown): output<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new AppError(AppErrorCode.VALIDATION_FAILED, first?.message ?? 'VALIDATION_FAILED')
  }
  return result.data
}
