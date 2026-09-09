/**
 * Codes d'erreur stables, partagés entre main et renderer.
 *
 * Le renderer ne reçoit JAMAIS d'objet Error : une Error Node perd sa stack à la
 * sérialisation IPC et exposerait des chemins disque. Il reçoit un code, qu'il
 * traduit en message localisé. La stack complète est journalisée côté main.
 */
export const AppErrorCode = {
  UNKNOWN: 'UNKNOWN',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_USERNAME_TAKEN: 'AUTH_USERNAME_TAKEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DB_ERROR: 'DB_ERROR'
} as const

export type AppErrorCode = (typeof AppErrorCode)[keyof typeof AppErrorCode]

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: AppErrorCode; message: string }

/** Erreur métier attendue. Tout ce qui n'en est pas une devient UNKNOWN côté IPC. */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}
