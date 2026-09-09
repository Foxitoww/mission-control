import { dialog, BrowserWindow, app } from 'electron'
import { join } from 'node:path'
import { IpcChannel } from '@shared/ipc-contract'
import { handle } from './registry'
import { getAccountsDb } from '../db/connection'
import { session } from '../services/session.service'
import { backupService } from '../services/backup.service'
import { AppError, AppErrorCode } from '@shared/errors'
import type { ExportReport, ImportReport } from '@shared/schemas/backup.schema'

/**
 * Les boîtes de dialogue de fichier vivent dans le MAIN, jamais dans le
 * renderer. C'est ce qui permet à l'interface de sauvegarder et de restaurer
 * sans qu'on lui ouvre le moindre accès au système de fichiers (ADR-003).
 */
function parentWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

function defaultFileName(): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `mission-control-${stamp}.json`
}

export function registerBackupHandlers(): void {
  handle(IpcChannel.BACKUP_EXPORT, async (): Promise<ExportReport | null> => {
    const vault = session.requireVault()
    const window = parentWindow()

    const result = await dialog.showSaveDialog(window as BrowserWindow, {
      title: 'Exporter les données',
      defaultPath: join(app.getPath('documents'), defaultFileName()),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    // Annulation : ce n'est pas une erreur, l'interface ne doit rien signaler.
    if (result.canceled || !result.filePath) return null

    return backupService.exportToFile(vault, getAccountsDb(), result.filePath)
  })

  handle(IpcChannel.BACKUP_IMPORT, async (options: unknown): Promise<ImportReport | null> => {
    const vault = session.requireVault()
    const window = parentWindow()

    const result = await dialog.showOpenDialog(window as BrowserWindow, {
      title: 'Importer une sauvegarde',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    const path = result.filePaths[0]
    if (result.canceled || !path) return null

    const report = backupService.importFromFile(vault, path, options)

    // Le coffre est réécrit chiffré immédiatement : sans cela, une restauration
    // suivie d'une coupure serait perdue.
    session.persist()
    return report
  })

  handle(IpcChannel.BACKUP_PREVIEW, (): { tasks: number; projects: number } => {
    const document = backupService.build(session.requireVault(), getAccountsDb())
    if (!document) throw new AppError(AppErrorCode.UNKNOWN, 'UNKNOWN')
    return { tasks: document.tasks.length, projects: document.projects.length }
  })
}
