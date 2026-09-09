/**
 * Énumérations du domaine.
 *
 * Déclarées comme tuples `as const` pour servir de source unique à trois usages :
 * le type TypeScript, le `z.enum()` de validation, et la contrainte `CHECK` SQL.
 * Ajouter un statut se fait à un seul endroit.
 */
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'ARCHIVED'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const PROJECT_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const GOAL_STATUSES = ['ACTIVE', 'COMPLETED', 'ABANDONED'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const THEMES = ['dark', 'light', 'system'] as const
export type Theme = (typeof THEMES)[number]

export const LANGUAGES = ['fr', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

/**
 * Représentation d'un utilisateur telle qu'elle traverse l'IPC.
 *
 * `passwordHash` en est volontairement ABSENT. Le type rend l'oubli impossible :
 * un repository qui renverrait le hash ne compilerait pas contre cette interface.
 */
export interface PublicUser {
  id: string
  username: string
  displayName: string
  avatar: string | null
  createdAt: string
}

export interface Project {
  id: string
  name: string
  description: string | null
  color: string
  icon: string | null
  status: ProjectStatus
  deadline: string | null
  position: number
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  projectId: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  completedAt: string | null
  estimatedMinutes: number | null
  position: number
  createdAt: string
  updatedAt: string
}

export interface Subtask {
  id: string
  taskId: string
  title: string
  completed: boolean
  position: number
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Goal {
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
}

export interface Settings {
  theme: Theme
  language: Language
  notificationsEnabled: boolean
  preferences: Record<string, unknown>
}
