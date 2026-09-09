import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, UPDATE_CHANGED_EVENT, type MissionControlApi } from '@shared/ipc-contract'
import type { UpdateStatus } from '@shared/types/update'

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
  profile: {
    update: (input) => ipcRenderer.invoke(IpcChannel.PROFILE_UPDATE, input)
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannel.SETTINGS_GET),
    update: (patch) => ipcRenderer.invoke(IpcChannel.SETTINGS_UPDATE, patch)
  },
  update: {
    status: () => ipcRenderer.invoke(IpcChannel.UPDATE_STATUS),
    check: () => ipcRenderer.invoke(IpcChannel.UPDATE_CHECK),
    install: () => ipcRenderer.invoke(IpcChannel.UPDATE_INSTALL),
    onChanged: (listener) => {
      // On n'expose PAS ipcRenderer : seul un rappel typé traverse le pont, et
      // le désabonnement est renvoyé pour qu'un composant démonté ne fuie pas.
      const handler = (_event: unknown, status: UpdateStatus): void => listener(status)
      ipcRenderer.on(UPDATE_CHANGED_EVENT, handler)
      return () => ipcRenderer.removeListener(UPDATE_CHANGED_EVENT, handler)
    }
  }
}

contextBridge.exposeInMainWorld('mc', api)
