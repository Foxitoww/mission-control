import type { Task, Project, Tag, Subtask, GoalStatus, TaskPriority } from './domain'
import type { RecurrenceRule } from '../schemas/recurrence.schema'

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
  projectName: string | null
  projectColor: string | null
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
