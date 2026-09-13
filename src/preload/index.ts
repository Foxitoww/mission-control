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
    deleteAccount: (input) => ipcRenderer.invoke(IpcChannel.AUTH_DELETE_ACCOUNT, input),
    recover: (input) => ipcRenderer.invoke(IpcChannel.AUTH_RECOVER, input),
    changePassword: (input) => ipcRenderer.invoke(IpcChannel.AUTH_CHANGE_PASSWORD, input)
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
    openReleases: () => ipcRenderer.invoke(IpcChannel.UPDATE_OPEN_RELEASES),
    onChanged: (listener) => {
      // On n'expose PAS ipcRenderer : seul un rappel typé traverse le pont, et
      // le désabonnement est renvoyé pour qu'un composant démonté ne fuie pas.
      const handler = (_event: unknown, status: UpdateStatus): void => listener(status)
      ipcRenderer.on(UPDATE_CHANGED_EVENT, handler)
      return () => ipcRenderer.removeListener(UPDATE_CHANGED_EVENT, handler)
    }
  },
  dashboard: {
    load: () => ipcRenderer.invoke(IpcChannel.DASHBOARD_LOAD)
  },
  tasks: {
    list: (filter) => ipcRenderer.invoke(IpcChannel.TASKS_LIST, filter ?? {}),
    get: (input) => ipcRenderer.invoke(IpcChannel.TASKS_GET, input),
    create: (input) => ipcRenderer.invoke(IpcChannel.TASKS_CREATE, input),
    update: (input) => ipcRenderer.invoke(IpcChannel.TASKS_UPDATE, input),
    move: (input) => ipcRenderer.invoke(IpcChannel.TASKS_MOVE, input),
    toggle: (input) => ipcRenderer.invoke(IpcChannel.TASKS_TOGGLE, input),
    remove: (input) => ipcRenderer.invoke(IpcChannel.TASKS_DELETE, input)
  },
  projects: {
    list: () => ipcRenderer.invoke(IpcChannel.PROJECTS_LIST),
    get: (input) => ipcRenderer.invoke(IpcChannel.PROJECTS_GET, input),
    create: (input) => ipcRenderer.invoke(IpcChannel.PROJECTS_CREATE, input),
    update: (input) => ipcRenderer.invoke(IpcChannel.PROJECTS_UPDATE, input),
    remove: (input) => ipcRenderer.invoke(IpcChannel.PROJECTS_DELETE, input)
  },
  tags: {
    list: () => ipcRenderer.invoke(IpcChannel.TAGS_LIST),
    create: (input) => ipcRenderer.invoke(IpcChannel.TAGS_CREATE, input),
    update: (input) => ipcRenderer.invoke(IpcChannel.TAGS_UPDATE, input),
    remove: (input) => ipcRenderer.invoke(IpcChannel.TAGS_DELETE, input)
  },
  subtasks: {
    create: (input) => ipcRenderer.invoke(IpcChannel.SUBTASKS_CREATE, input),
    update: (input) => ipcRenderer.invoke(IpcChannel.SUBTASKS_UPDATE, input),
    remove: (input) => ipcRenderer.invoke(IpcChannel.SUBTASKS_DELETE, input),
    reorder: (input) => ipcRenderer.invoke(IpcChannel.SUBTASKS_REORDER, input)
  },
  comments: {
    list: (input) => ipcRenderer.invoke(IpcChannel.COMMENTS_LIST, input),
    create: (input) => ipcRenderer.invoke(IpcChannel.COMMENTS_CREATE, input),
    update: (input) => ipcRenderer.invoke(IpcChannel.COMMENTS_UPDATE, input),
    remove: (input) => ipcRenderer.invoke(IpcChannel.COMMENTS_DELETE, input)
  },
  chat: {
    list: (input) => ipcRenderer.invoke(IpcChannel.CHAT_LIST, input),
    create: (input) => ipcRenderer.invoke(IpcChannel.CHAT_CREATE, input),
    update: (input) => ipcRenderer.invoke(IpcChannel.CHAT_UPDATE, input),
    react: (input) => ipcRenderer.invoke(IpcChannel.CHAT_REACT, input),
    remove: (input) => ipcRenderer.invoke(IpcChannel.CHAT_DELETE, input)
  },
  goals: {
    list: () => ipcRenderer.invoke(IpcChannel.GOALS_LIST),
    create: (input) => ipcRenderer.invoke(IpcChannel.GOALS_CREATE, input),
    update: (input) => ipcRenderer.invoke(IpcChannel.GOALS_UPDATE, input),
    advance: (input) => ipcRenderer.invoke(IpcChannel.GOALS_ADVANCE, input),
    remove: (input) => ipcRenderer.invoke(IpcChannel.GOALS_DELETE, input)
  },
  stats: {
    load: (input) => ipcRenderer.invoke(IpcChannel.STATS_LOAD, input ?? {})
  },
  timeline: {
    load: () => ipcRenderer.invoke(IpcChannel.TIMELINE_LOAD)
  },
  backup: {
    export: () => ipcRenderer.invoke(IpcChannel.BACKUP_EXPORT),
    import: (options) => ipcRenderer.invoke(IpcChannel.BACKUP_IMPORT, options ?? {}),
    preview: () => ipcRenderer.invoke(IpcChannel.BACKUP_PREVIEW)
  },
  search: {
    run: (input) => ipcRenderer.invoke(IpcChannel.SEARCH_RUN, input)
  }
}

contextBridge.exposeInMainWorld('mc', api)
