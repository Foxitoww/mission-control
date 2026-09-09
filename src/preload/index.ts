import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type MissionControlApi } from '@shared/ipc-contract'

/**
 * La totalité de la surface accessible au renderer.
 *
 * Rien n'est exposé au-delà de cet objet : ni `ipcRenderer` brut, ni `require`,
 * ni un module Node. Le renderer ne peut appeler que ce qui est listé ici, et
 * aucune de ces méthodes n'accepte d'identifiant utilisateur (ADR-003).
 */
const api: MissionControlApi = {
  auth: {
    register: (input) => ipcRenderer.invoke(IpcChannel.AUTH_REGISTER, input),
    login: (input) => ipcRenderer.invoke(IpcChannel.AUTH_LOGIN, input),
    logout: () => ipcRenderer.invoke(IpcChannel.AUTH_LOGOUT),
    currentUser: () => ipcRenderer.invoke(IpcChannel.AUTH_CURRENT_USER),
    listUsers: () => ipcRenderer.invoke(IpcChannel.AUTH_LIST_USERS),
    deleteAccount: (input) => ipcRenderer.invoke(IpcChannel.AUTH_DELETE_ACCOUNT, input)
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannel.SETTINGS_GET),
    update: (patch) => ipcRenderer.invoke(IpcChannel.SETTINGS_UPDATE, patch)
  }
}

contextBridge.exposeInMainWorld('mc', api)
