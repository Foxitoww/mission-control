import { app, shell, BrowserWindow, session as electronSession } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './db/init'
import { closeDatabase } from './db/connection'
import { registerIpcHandlers } from './ipc'

/**
 * Politique de sécurité du contenu.
 *
 * L'application ne charge aucune ressource distante : les polices sont
 * empaquetées et il n'y a aucun appel réseau. La CSP verrouille cette propriété
 * plutôt que de compter dessus. En développement, Vite a besoin de son websocket
 * de rechargement à chaud, d'où la variante assouplie.
 */
const CSP_PRODUCTION =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self'; connect-src 'self'; " +
  "object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"

function applyContentSecurityPolicy(): void {
  if (is.dev) return
  electronSession.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP_PRODUCTION]
      }
    })
  })
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // Couleur --mc-abyss : évite le flash blanc entre l'ouverture de la
    // fenêtre et le premier rendu React.
    backgroundColor: '#0F1524',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Les trois réglages qui rendent ADR-003 applicable : le renderer n'a
      // ni Node, ni accès direct à l'IPC, et vit dans un contexte JS séparé
      // du preload.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // requis pour que le preload puisse importer @shared
    }
  })

  // Affichage différé : la fenêtre apparaît peinte, jamais vide.
  window.once('ready-to-show', () => window.show())

  // Toute tentative d'ouverture externe part dans le navigateur du système,
  // jamais dans une fenêtre Electron — qui n'aurait pas nos garde-fous.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Verrou de navigation : le renderer ne peut pas quitter l'application.
  window.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env['ELECTRON_RENDERER_URL']
    if (!devServer || !url.startsWith(devServer)) event.preventDefault()
  })

  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (is.dev && devServer) {
    void window.loadURL(devServer)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('fr.missioncontrol.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  applyContentSecurityPolicy()
  initDatabase()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// WAL laisse un fichier -wal en attente ; fermer proprement le replie dans la base.
app.on('will-quit', closeDatabase)
