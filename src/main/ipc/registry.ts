import { ipcMain } from 'electron'
import { AppError, AppErrorCode, type IpcResult } from '@shared/errors'

/**
 * Enregistre un handler IPC et normalise sa sortie en IpcResult.
 *
 * Une AppError est une erreur métier attendue : son code traverse l'IPC et le
 * renderer le traduit. Tout le reste est un bug — on le journalise en entier
 * côté main et on ne renvoie que UNKNOWN. Une exception non prévue peut contenir
 * un chemin disque, un fragment de requête SQL ou une valeur en clair ; rien de
 * tout cela ne doit atteindre le renderer, encore moins l'écran (§31).
 */
export function handle<TArgs extends unknown[], TResult>(
  channel: string,
  fn: (...args: TArgs) => TResult | Promise<TResult>
): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<TResult>> => {
    try {
      return { ok: true, data: await fn(...(args as TArgs)) }
    } catch (error) {
      if (error instanceof AppError) {
        return { ok: false, code: error.code, message: error.message }
      }
      console.error(`[ipc] ${channel} —`, error)
      return { ok: false, code: AppErrorCode.UNKNOWN, message: 'UNKNOWN' }
    }
  })
}
