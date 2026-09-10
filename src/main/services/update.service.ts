import { app, BrowserWindow, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/types/update'

/**
 * Mises à jour (ADR-006).
 *
 * Un seul bouton, deux chemins :
 *
 *  · application EMPAQUETÉE → electron-updater lit la release GitHub, télécharge
 *    le nouvel installeur et l'applique au redémarrage. C'est le « mettre à jour
 *    via git » au sens propre : la source de vérité est le dépôt, atteint par
 *    ses tags de version.
 *  · en DÉVELOPPEMENT → pas d'installeur à remplacer, mais on interroge quand
 *    même l'API GitHub pour dire si une version plus récente existe, avec un
 *    lien vers la page des versions. Le bouton « Vérifier » n'est jamais inerte.
 *
 * Dans les DEUX cas, `check` interroge l'API GitHub pour attacher au statut la
 * version publiée et son lien : ainsi l'utilisateur peut toujours ouvrir la
 * page des versions, même si le téléchargement automatique échoue.
 */

/** Doit rester aligné sur `build.publish` dans package.json. */
const REPO = { owner: 'Foxitoww', repo: 'mission-control' } as const
const RELEASES_PAGE = `https://github.com/${REPO.owner}/${REPO.repo}/releases`
const LATEST_API = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/releases/latest`

let status: UpdateStatus = { state: 'idle', currentVersion: app.getVersion() }

function push(next: Partial<UpdateStatus>): void {
  status = { ...status, ...next, currentVersion: app.getVersion() }
  // Le renderer est notifié en poussée : un téléchargement dure, et l'interface
  // doit pouvoir afficher sa progression sans interroger en boucle.
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('update:changed', status)
  }
}

function isDev(): boolean {
  return !app.isPackaged
}

/** Compare deux versions `x.y.z`. > 0 si `a` est plus récent que `b`. */
function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

interface GithubRelease {
  tag_name: string
  html_url: string
  published_at: string
}

/**
 * Dernière release publiée sur GitHub, ou `null`.
 *
 * Volontairement tolérant : une coupure réseau, un quota d'API dépassé ou
 * l'absence totale de release (404) ne doivent pas devenir une « erreur ». On
 * renvoie `null` et l'appelant décide du message.
 */
async function fetchLatestPublished(): Promise<GithubRelease | null> {
  try {
    const response = await fetch(LATEST_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        // GitHub refuse les requêtes sans User-Agent.
        'User-Agent': `mission-control/${app.getVersion()}`
      }
    })
    if (!response.ok) return null
    return (await response.json()) as GithubRelease
  } catch (error) {
    console.error('[update] github api', error)
    return null
  }
}

export function initUpdater(): void {
  // electron-updater a besoin d'un installeur et d'un `app-update.yml` : rien de
  // tout cela en dev. Le chemin dev est géré directement dans `check`.
  if (isDev()) return

  autoUpdater.autoDownload = true
  // L'installation reste un choix de l'utilisateur : rien ne s'installe pendant
  // qu'il travaille. Le paquet est prêt, il redémarre quand il le souhaite.
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => push({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    push({ state: 'available', latestVersion: info.version })
  )
  autoUpdater.on('update-not-available', () => push({ state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    push({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    push({ state: 'ready', latestVersion: info.version })
  )
  autoUpdater.on('error', (error) => {
    // Message technique journalisé côté main ; l'interface ne reçoit qu'un état.
    console.error('[update]', error)
    push({ state: 'error' })
  })
}

export const updateService = {
  current(): UpdateStatus {
    return status
  },

  async check(): Promise<UpdateStatus> {
    push({ state: 'checking' })

    const release = await fetchLatestPublished()
    const releaseUrl = release?.html_url ?? RELEASES_PAGE
    const latestVersion = release ? release.tag_name.replace(/^v/, '') : undefined

    // --- Développement : pas de téléchargement, juste l'info ---
    if (isDev()) {
      if (!release) {
        push({ state: 'not-available', reason: 'dev', releaseUrl: RELEASES_PAGE })
        return status
      }
      const newer = compareVersions(release.tag_name, app.getVersion()) > 0
      push({
        state: newer ? 'available' : 'not-available',
        reason: 'dev',
        latestVersion,
        releaseUrl
      })
      return status
    }

    // --- Empaqueté : electron-updater fait le vrai travail ---
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      console.error('[update] check failed', error)
      push({ state: 'error' })
    }

    // On attache TOUJOURS le lien et la version publiée : même quand tout va
    // bien, l'utilisateur peut vouloir lire les notes ou télécharger à la main.
    push({ latestVersion: status.latestVersion ?? latestVersion, releaseUrl })
    return status
  },

  /** Redémarre sur la nouvelle version. Sans effet tant qu'elle n'est pas prête. */
  installNow(): void {
    if (status.state !== 'ready') return
    autoUpdater.quitAndInstall()
  },

  /** Ouvre la page des versions dans le navigateur du système. */
  openReleasesPage(): void {
    void shell.openExternal(status.releaseUrl ?? RELEASES_PAGE)
  },

  /**
   * Vérification silencieuse au démarrage, différée.
   *
   * Réservée à l'application empaquetée : en développement, on ne veut pas
   * d'appel réseau surprise 8 secondes après chaque lancement. Le bouton
   * manuel, lui, fonctionne partout.
   */
  scheduleStartupCheck(delayMs = 8000): void {
    if (isDev()) return
    setTimeout(() => void updateService.check(), delayMs).unref()
  }
}
