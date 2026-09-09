import type { IpcResult } from '@shared/errors'

/**
 * Erreur métier remontée par le processus main.
 *
 * `key` est la clé de traduction la plus précise disponible (par exemple
 * `USERNAME_TOO_SHORT`), `code` la catégorie large (`VALIDATION_FAILED`).
 * L'interface affiche la première et retombe sur la seconde.
 */
export class IpcError extends Error {
  constructor(
    readonly code: string,
    readonly key: string
  ) {
    super(key)
    this.name = 'IpcError'
  }
}

/**
 * Déballe un IpcResult : renvoie la donnée, ou lève une IpcError.
 *
 * Chaque appel IPC renvoie un résultat discriminé plutôt que de rejeter, pour
 * que rien de technique ne traverse la frontière. Ce helper reconvertit cela en
 * exception côté renderer, là où un try/catch est la forme naturelle — sans
 * jamais réintroduire d'objet Error venu du main.
 */
export async function unwrap<T>(call: Promise<IpcResult<T>>): Promise<T> {
  const result = await call
  if (result.ok) return result.data
  throw new IpcError(result.code, result.message || result.code)
}
