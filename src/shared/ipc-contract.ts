import type { IpcResult } from './errors'
import type { PublicUser, Settings, Tag } from './types/domain'
import type {
  TaskListItem,
  TaskDetail,
  TaskComment,
  ChatMessage,
  ProjectSummary,
  DashboardData,
  SearchResults,
  GoalSummary,
  StatsData,
  TimelineData,
  DirectMessage,
  ConversationSummary
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
import type { CreateCommentInput, UpdateCommentInput } from './schemas/comment.schema'
import type {
  CreateChatMessageInput,
  UpdateChatMessageInput,
  ReactToChatMessageInput
} from './schemas/chat.schema'
import type { SendMessageInput } from './schemas/message.schema'
import type {
  CreateProjectInput,
  UpdateProjectInput,
  CreateTagInput,
  UpdateTagInput
} from './schemas/project.schema'
import type { CreateGoalInput, UpdateGoalInput, AdvanceGoalInput } from './schemas/goal.schema'
import type { ExportReport, ImportReport, ImportMode } from './schemas/backup.schema'

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
  UPDATE_OPEN_RELEASES: 'update:open-releases',

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
  PROJECTS_MARK_TASKS_SEEN: 'projects:mark-tasks-seen',
  PROJECTS_MARK_CHAT_SEEN: 'projects:mark-chat-seen',

  TAGS_LIST: 'tags:list',
  TAGS_CREATE: 'tags:create',
  TAGS_UPDATE: 'tags:update',
  TAGS_DELETE: 'tags:delete',

  SUBTASKS_CREATE: 'subtasks:create',
  SUBTASKS_UPDATE: 'subtasks:update',
  SUBTASKS_DELETE: 'subtasks:delete',
  SUBTASKS_REORDER: 'subtasks:reorder',

  COMMENTS_LIST: 'comments:list',
  COMMENTS_CREATE: 'comments:create',
  COMMENTS_UPDATE: 'comments:update',
  COMMENTS_DELETE: 'comments:delete',

  CHAT_LIST: 'chat:list',
  CHAT_CREATE: 'chat:create',
  CHAT_UPDATE: 'chat:update',
  CHAT_REACT: 'chat:react',
  CHAT_DELETE: 'chat:delete',

  MESSAGES_CONVERSATIONS: 'messages:conversations',
  MESSAGES_LIST: 'messages:list',
  MESSAGES_SEND: 'messages:send',
  MESSAGES_MARK_SEEN: 'messages:mark-seen',

  GOALS_LIST: 'goals:list',
  GOALS_CREATE: 'goals:create',
  GOALS_UPDATE: 'goals:update',
  GOALS_ADVANCE: 'goals:advance',
  GOALS_DELETE: 'goals:delete',

  STATS_LOAD: 'stats:load',
  TIMELINE_LOAD: 'timeline:load',

  BACKUP_EXPORT: 'backup:export',
  BACKUP_IMPORT: 'backup:import',
  BACKUP_PREVIEW: 'backup:preview',

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
    /** Ouvre la page GitHub des versions dans le navigateur du système. */
    openReleases(): Promise<IpcResult<null>>
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
    create(
      input: Partial<CreateProjectInput> & { name: string }
    ): Promise<IpcResult<ProjectSummary>>
    update(input: UpdateProjectInput): Promise<IpcResult<ProjectSummary>>
    /** Supprime le projet ; ses tâches sont détachées, jamais supprimées. */
    remove(input: { id: string }): Promise<IpcResult<null>>
    /** Éteint la pastille « nouveau » du tableau — appelé à l'ouverture de l'onglet. */
    markTasksSeen(input: { id: string }): Promise<IpcResult<ProjectSummary>>
    /** Éteint la pastille « nouveau » du chat général. */
    markChatSeen(input: { id: string }): Promise<IpcResult<ProjectSummary>>
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
    /** Renvoie la tâche à jour : son avancement peut changer avec le décompte. */
    remove(input: { id: string }): Promise<IpcResult<TaskDetail>>
    reorder(input: { taskId: string; orderedIds: string[] }): Promise<IpcResult<TaskDetail>>
  }
  comments: {
    list(input: { taskId: string }): Promise<IpcResult<TaskComment[]>>
    /** Renvoie le fil complet à jour, prêt à réafficher. */
    create(input: CreateCommentInput): Promise<IpcResult<TaskComment[]>>
    update(input: UpdateCommentInput): Promise<IpcResult<TaskComment[]>>
    remove(input: { id: string }): Promise<IpcResult<TaskComment[]>>
  }
  /** Chat général d'une app — séparé des commentaires de tâche ci-dessus. */
  chat: {
    list(input: { projectId: string }): Promise<IpcResult<ChatMessage[]>>
    /** Renvoie le fil complet à jour, prêt à réafficher. */
    create(input: CreateChatMessageInput): Promise<IpcResult<ChatMessage[]>>
    update(input: UpdateChatMessageInput): Promise<IpcResult<ChatMessage[]>>
    /** Pose, change ou retire (`reaction: null`) sa réaction sur un message. */
    react(input: ReactToChatMessageInput): Promise<IpcResult<ChatMessage[]>>
    remove(input: { id: string }): Promise<IpcResult<ChatMessage[]>>
  }
  /**
   * Messagerie privée entre comptes — chiffrée de bout en bout (ECDH X25519 +
   * AES-256-GCM, voir messages.service.ts). Le renderer ne voit jamais de
   * texte chiffré : le déchiffrement a lieu côté main, avant que le résultat
   * ne traverse l'IPC.
   */
  messages: {
    /** Un interlocuteur par ligne, le plus récent en tête. */
    conversations(): Promise<IpcResult<ConversationSummary[]>>
    /** Le fil complet avec un interlocuteur, déchiffré. */
    list(input: { otherUserId: string }): Promise<IpcResult<DirectMessage[]>>
    /** Renvoie le fil complet à jour, prêt à réafficher. */
    send(input: SendMessageInput): Promise<IpcResult<DirectMessage[]>>
    /** Éteint la pastille « non lu » d'une conversation. */
    markSeen(input: { otherUserId: string }): Promise<IpcResult<null>>
  }
  goals: {
    list(): Promise<IpcResult<GoalSummary[]>>
    create(input: Partial<CreateGoalInput> & { title: string }): Promise<IpcResult<GoalSummary>>
    update(input: UpdateGoalInput): Promise<IpcResult<GoalSummary>>
    /** Incremente la valeur courante depuis la carte, sans ouvrir le formulaire. */
    advance(input: AdvanceGoalInput): Promise<IpcResult<GoalSummary>>
    remove(input: { id: string }): Promise<IpcResult<null>>
  }
  stats: {
    load(input?: { days?: number }): Promise<IpcResult<StatsData>>
  }
  timeline: {
    load(): Promise<IpcResult<TimelineData>>
  }
  backup: {
    /** Ouvre une boite d'enregistrement. `null` si l'utilisateur annule. */
    export(): Promise<IpcResult<ExportReport | null>>
    /** Ouvre une boite d'ouverture. `null` si l'utilisateur annule. */
    import(options?: { mode?: ImportMode }): Promise<IpcResult<ImportReport | null>>
    /** Compte ce qui serait exporte, sans ecrire de fichier. */
    preview(): Promise<IpcResult<{ tasks: number; projects: number }>>
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
