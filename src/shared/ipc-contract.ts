import type { IpcResult } from './errors'
import type { PublicUser, Settings, Tag } from './types/domain'
import type {
  TaskListItem,
  TaskDetail,
  ProjectSummary,
  DashboardData,
  SearchResults
} from './types/views'
import type { UpdateStatus } from './types/update'
import type {
  RegisterInput,
  LoginInput,
  DeleteAccountInput,
  RecoverInput,
  ChangePasswordInput
} from './schemas/auth.schema'

import type { UpdateProfileInput } from './schemas/profile.schema'
import type {
  CreateTaskInput,
  UpdateTaskInput,
  MoveTaskInput,
  TaskFilter,
  CreateSubtaskInput,
  UpdateSubtaskInput
} from './schemas/task.schema'
import type {
  CreateProjectInput,
  UpdateProjectInput,
  CreateTagInput,
  UpdateTagInput
} from './schemas/project.schema'

/**
 * Résultat d'une inscription.
 *
 * La phrase de récupération n'existe qu'à cet instant précis : elle n'est
 * stockée nulle part en clair, et le compte ne peut plus jamais la réafficher.
 */
export interface RegisterResult {
  user: PublicUser
  recoveryPhrase: string
}

/**
 * Contrat IPC — la surface complète que le renderer peut atteindre.
 *
 * REMARQUE DE SÉCURITÉ (ADR-003) : aucune signature ci-dessous n'accepte de `userId`.
 * L'identité vient de la session détenue par le processus main. Le renderer ne peut
 * pas demander les données d'un autre utilisateur parce que le vocabulaire pour le
 * faire n'existe pas.
 */
export const IpcChannel = {
  AUTH_REGISTER: 'auth:register',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_CURRENT_USER: 'auth:current-user',
  AUTH_LIST_USERS: 'auth:list-users',
  AUTH_DELETE_ACCOUNT: 'auth:delete-account',
  AUTH_RECOVER: 'auth:recover',
  AUTH_CHANGE_PASSWORD: 'auth:change-password',

  PROFILE_UPDATE: 'profile:update',

  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  UPDATE_STATUS: 'update:status',
  UPDATE_CHECK: 'update:check',
  UPDATE_INSTALL: 'update:install',

  DASHBOARD_LOAD: 'dashboard:load',

  TASKS_LIST: 'tasks:list',
  TASKS_GET: 'tasks:get',
  TASKS_CREATE: 'tasks:create',
  TASKS_UPDATE: 'tasks:update',
  TASKS_MOVE: 'tasks:move',
  TASKS_TOGGLE: 'tasks:toggle',
  TASKS_DELETE: 'tasks:delete',

  PROJECTS_LIST: 'projects:list',
  PROJECTS_GET: 'projects:get',
  PROJECTS_CREATE: 'projects:create',
  PROJECTS_UPDATE: 'projects:update',
  PROJECTS_DELETE: 'projects:delete',

  TAGS_LIST: 'tags:list',
  TAGS_CREATE: 'tags:create',
  TAGS_UPDATE: 'tags:update',
  TAGS_DELETE: 'tags:delete',

  SUBTASKS_CREATE: 'subtasks:create',
  SUBTASKS_UPDATE: 'subtasks:update',
  SUBTASKS_DELETE: 'subtasks:delete',
  SUBTASKS_REORDER: 'subtasks:reorder',

  SEARCH_RUN: 'search:run'
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Canal poussé par le main, hors requête/réponse : progression d'un téléchargement. */
export const UPDATE_CHANGED_EVENT = 'update:changed'

export interface TagWithUsage extends Tag {
  taskCount: number
}

/** Interface exposée au renderer sous `window.mc`. */
export interface MissionControlApi {
  auth: {
    /** Renvoie le compte ET la phrase de récupération, montrée une seule fois. */
    register(input: RegisterInput): Promise<IpcResult<RegisterResult>>
    login(input: LoginInput): Promise<IpcResult<PublicUser>>
    logout(): Promise<IpcResult<null>>
    /** L'utilisateur de la session courante, ou null si personne n'est connecté. */
    currentUser(): Promise<IpcResult<PublicUser | null>>
    /** Profils affichés sur l'écran de connexion. Ne divulgue aucune donnée métier. */
    listUsers(): Promise<IpcResult<PublicUser[]>>
    /** Supprime le compte courant et TOUTES ses données, en une transaction. */
    deleteAccount(input: DeleteAccountInput): Promise<IpcResult<null>>
    /** Réinitialise le mot de passe avec la phrase de récupération. */
    recover(input: RecoverInput): Promise<IpcResult<PublicUser>>
    changePassword(input: ChangePasswordInput): Promise<IpcResult<null>>
  }
  profile: {
    /** Met à jour le profil de l'utilisateur connecté — jamais celui d'un autre. */
    update(input: UpdateProfileInput): Promise<IpcResult<PublicUser>>
  }
  settings: {
    get(): Promise<IpcResult<Settings>>
    update(patch: Partial<Settings>): Promise<IpcResult<Settings>>
  }
  update: {
    status(): Promise<IpcResult<UpdateStatus>>
    check(): Promise<IpcResult<UpdateStatus>>
    /** Redémarre sur la version téléchargée. Sans effet si aucune n'est prête. */
    install(): Promise<IpcResult<null>>
    /** S'abonne aux changements d'état. Renvoie la fonction de désabonnement. */
    onChanged(listener: (status: UpdateStatus) => void): () => void
  }
  dashboard: {
    load(): Promise<IpcResult<DashboardData>>
  }
  tasks: {
    list(filter?: Partial<TaskFilter>): Promise<IpcResult<TaskListItem[]>>
    get(input: { id: string }): Promise<IpcResult<TaskDetail>>
    create(input: Partial<CreateTaskInput> & { title: string }): Promise<IpcResult<TaskDetail>>
    update(input: UpdateTaskInput): Promise<IpcResult<TaskDetail>>
    /** Réordonne et change éventuellement de colonne. */
    move(input: MoveTaskInput): Promise<IpcResult<TaskDetail>>
    /** Bascule terminé / à faire. */
    toggle(input: { id: string }): Promise<IpcResult<TaskDetail>>
    remove(input: { id: string }): Promise<IpcResult<null>>
  }
  projects: {
    list(): Promise<IpcResult<ProjectSummary[]>>
    get(input: { id: string }): Promise<IpcResult<ProjectSummary>>
    create(input: Partial<CreateProjectInput> & { name: string }): Promise<IpcResult<ProjectSummary>>
    update(input: UpdateProjectInput): Promise<IpcResult<ProjectSummary>>
    /** Supprime le projet ; ses tâches sont détachées, jamais supprimées. */
    remove(input: { id: string }): Promise<IpcResult<null>>
  }
  tags: {
    list(): Promise<IpcResult<TagWithUsage[]>>
    /** Renvoie le tag existant si le nom est déjà pris — la création est idempotente. */
    create(input: Partial<CreateTagInput> & { name: string }): Promise<IpcResult<Tag>>
    update(input: UpdateTagInput): Promise<IpcResult<Tag>>
    remove(input: { id: string }): Promise<IpcResult<null>>
  }
  subtasks: {
    create(input: CreateSubtaskInput): Promise<IpcResult<TaskDetail>>
    update(input: UpdateSubtaskInput): Promise<IpcResult<TaskDetail>>
    remove(input: { id: string }): Promise<IpcResult<null>>
    reorder(input: { taskId: string; orderedIds: string[] }): Promise<IpcResult<TaskDetail>>
  }
  search: {
    run(input: { query: string }): Promise<IpcResult<SearchResults>>
  }
}

declare global {
  interface Window {
    mc: MissionControlApi
  }
}
