import type {
  Task,
  Project,
  Tag,
  Subtask,
  GoalStatus,
  TaskPriority,
  TaskStatus,
  ProjectStatus
} from './domain'
import type { RecurrenceRule } from '../schemas/recurrence.schema'
import type { ChatReaction } from '../schemas/chat.schema'

/**
 * Formes de LECTURE, distinctes des entités écrites.
 *
 * L'interface a besoin, pour une seule tâche, de ses tags et de l'avancement de
 * ses sous-tâches. Les exposer ici évite que chaque écran ne refasse ses propres
 * requêtes — et évite surtout le N+1 : le repository charge les tags de toutes
 * les tâches renvoyées en une requête, pas une par tâche.
 */
export interface TaskListItem extends Task {
  tags: Tag[]
  /** Règle de récurrence décodée, ou `null` pour une tâche ponctuelle. */
  recurrence: RecurrenceRule | null
  /** Première tâche de la série, pour retrouver l'historique d'une récurrence. */
  recurrenceParentId: string | null
  subtaskTotal: number
  subtaskDone: number
  /** Nombre de messages dans le fil de discussion — sert au badge de liste. */
  commentCount: number
  projectName: string | null
  projectColor: string | null
}

/**
 * Un message du fil d'une tâche.
 *
 * `edited` distingue « écrit une fois » de « corrigé après coup » : dans une
 * discussion, savoir qu'un message a été retouché change sa lecture.
 */
export interface TaskComment {
  id: string
  taskId: string
  body: string
  edited: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Un message du chat GÉNÉRAL d'une app — séparé des commentaires de tâche
 * ci-dessus : une discussion sur l'app entière, pas sur une tâche précise.
 *
 * `reaction` est la seule réaction active, ou `null` : la règle (une seule à
 * la fois, parmi une palette de trois) est portée par le type lui-même, pas
 * vérifiée à côté.
 */
export interface ChatMessage {
  id: string
  projectId: string
  body: string
  reaction: ChatReaction | null
  edited: boolean
  createdAt: string
  updatedAt: string
}

export interface TaskDetail extends TaskListItem {
  subtasks: Subtask[]
}

/**
 * `progress` est CALCULÉ à la lecture, jamais stocké (voir DATA-MODEL.md) :
 * une valeur dérivée que l'on persiste finit toujours par diverger de sa source.
 */
export interface ProjectSummary extends Project {
  taskTotal: number
  taskCompleted: number
  /** 0 à 1. Vaut 0 pour un projet sans tâche, jamais NaN. */
  progress: number
  /** Pastille « nouveau » façon Discord : une tâche est apparue depuis la
   *  dernière visite du tableau de cette app (voir markTasksSeen). */
  hasNewTasks: boolean
  /** Même principe pour le chat général (voir markChatSeen). */
  hasUnreadChat: boolean
}

export interface MissionStats {
  total: number
  completed: number
  active: number
  overdue: number
  /** 0 à 1. */
  completionRate: number
}

export interface DashboardData {
  /** Échéance aujourd'hui, non terminées. */
  today: TaskListItem[]
  /** Échéance dépassée, non terminées. Le premier bloc qui compte. */
  overdue: TaskListItem[]
  /** HIGH et CRITICAL en cours, hors de celles déjà listées ci-dessus. */
  priority: TaskListItem[]
  /** Prochaines échéances, au-delà d'aujourd'hui. */
  upcoming: TaskListItem[]
  activeProjects: ProjectSummary[]
  recent: TaskListItem[]
  stats: MissionStats
}

export interface SearchResults {
  tasks: TaskListItem[]
  projects: ProjectSummary[]
  tags: Tag[]
}

/**
 * Objectif, avec sa progression CALCULÉE.
 *
 * `progress` n'est pas stocké : c'est `currentValue / targetValue`, plafonné à 1.
 * Un pourcentage persisté finirait toujours par diverger de ses deux sources.
 */
export interface GoalSummary {
  id: string
  projectId: string | null
  title: string
  description: string | null
  targetValue: number
  currentValue: number
  deadline: string | null
  status: GoalStatus
  createdAt: string
  updatedAt: string
  projectName: string | null
  projectColor: string | null
  /** 0 à 1. */
  progress: number
}

/** Un point de l'histogramme d'activité. */
export interface DailyActivity {
  /** Jour local, au format `YYYY-MM-DD`. */
  date: string
  created: number
  completed: number
}

export interface StatsData {
  totals: MissionStats
  /** Activité des N derniers jours, jours vides inclus. */
  daily: DailyActivity[]
  byPriority: { priority: TaskPriority; total: number; completed: number }[]
  byProject: ProjectSummary[]
  goals: { total: number; completed: number }
  /** Jours consécutifs, jusqu'à aujourd'hui, avec au moins une complétion. */
  streak: number
  /** Minutes estimées sur les opérations terminées de la période. */
  estimatedMinutesCompleted: number
}

/** Jalon posé sur une barre de mission : une échéance de tâche. */
export interface TimelineMilestone {
  id: string
  title: string
  dueDate: string
  status: TaskStatus
  priority: TaskPriority
}

/**
 * Une mission sur l'axe du temps (§10).
 *
 * `start` et `end` sont DÉDUITS, jamais inventés :
 *   · début — la première échéance de ses tâches, à défaut sa date de création ;
 *   · fin   — sa date limite si elle en a une, sinon la dernière échéance.
 *
 * `end` vaut `null` quand rien ne permet de la situer. L'interface affiche
 * alors un repère ponctuel et non une barre : une mission sans horizon n'a pas
 * de durée, et lui en dessiner une serait un mensonge graphique.
 */
export interface TimelineEntry {
  id: string
  name: string
  color: string
  icon: string | null
  status: ProjectStatus
  start: string
  end: string | null
  /** Vrai quand `end` vient de la date limite déclarée, pas d'une déduction. */
  hasDeadline: boolean
  taskTotal: number
  taskCompleted: number
  progress: number
  milestones: TimelineMilestone[]
}

export interface TimelineData {
  entries: TimelineEntry[]
  /** Opérations sans mission, mais datées : elles méritent aussi leur ligne. */
  unassigned: TimelineMilestone[]
  /** Bornes réelles des données, pour cadrer l'axe sans tronquer. */
  range: { from: string; to: string } | null
}
