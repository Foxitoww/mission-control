import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/types/update'

/**
 * Mises à jour via les releases GitHub (electron-updater).
 *
 * Le flux réel : publier un tag → electron-builder pousse le `setup.exe` et un
 * `latest.yml` dans la release → l'application compare sa version à celle du
 * fichier et télécharge le nouvel installeur. « Lié à git » veut donc dire
 * « lié aux tags », pas à un `git pull » : une application empaquetée n'a ni
 * dépôt ni git sous la main.
 */

let status: UpdateStatus = { state: 'idle', currentVersion: app.getVersion() }

function publish(next: Partial<UpdateStatus>): void {
  status = { ...status, ...next, currentVersion: app.getVersion() }
  // Le renderer est notifié en poussée : un téléchargement dure, et l'interface
  // doit pouvoir afficher sa progression sans interroger en boucle.
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('update:changed', status)
  }
}

/**
 * En développement, il n'y a ni installeur ni `app-update.yml` : electron-updater
 * lèverait une erreur peu parlante. On répond franchement « indisponible ici »
 * plutôt que d'afficher un échec qui ressemblerait à un vrai problème.
 */
function unsupportedReason(): 'dev' | null {
  return app.isPackaged ? null : 'dev'
}

export function initUpdater(): void {
  if (unsupportedReason()) {
    status = { state: 'unsupported', currentVersion: app.getVersion(), reason: 'dev' }
    return
  }

  autoUpdater.autoDownload = true
  // L'installation reste un choix de l'utilisateur : rien ne s'installe pendant
  // qu'il travaille. Le paquet est prêt, il redémarre quand il le souhaite.
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    publish({ state: 'available', latestVersion: info.version })
  )
  autoUpdater.on('update-not-available', () => publish({ state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    publish({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    publish({ state: 'ready', latestVersion: info.version })
  )
  autoUpdater.on('error', (error) => {
    // Message technique journalisé côté main ; l'interface ne reçoit qu'un code.
    console.error('[update]', error)
    publish({ state: 'error' })
  })
}

export const updateService = {
  current(): UpdateStatus {
    return status
  },

  async check(): Promise<UpdateStatus> {
    if (unsupportedReason()) {
      status = { state: 'unsupported', currentVersion: app.getVersion(), reason: 'dev' }
      return status
    }

    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      console.error('[update] check failed', error)
      publish({ state: 'error' })
    }
    return status
  },

  /** Redémarre sur la nouvelle version. Sans effet tant qu'elle n'est pas prête. */
  installNow(): void {
    if (status.state !== 'ready') return
    autoUpdater.quitAndInstall()
  },

  /**
   * Vérification silencieuse au démarrage, différée.
   *
   * Retardée pour ne pas disputer la bande passante et le processeur au premier
   * rendu : au lancement, l'utilisateur veut voir ses missions, pas attendre un
   * appel réseau.
   */
  scheduleStartupCheck(delayMs = 8000): void {
    if (unsupportedReason()) return
    setTimeout(() => void updateService.check(), delayMs).unref()
  }
}
