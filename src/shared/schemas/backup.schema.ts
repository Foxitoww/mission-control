import { z } from 'zod'
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  PROJECT_STATUSES,
  GOAL_STATUSES,
  THEMES,
  LANGUAGES
} from '../types/domain'

/**
 * Format de sauvegarde (§18).
 *
 * JSON, lisible et réimportable ailleurs. C'est le SEUL artefact non chiffré du
 * produit, et c'est délibéré : une sauvegarde qu'on ne peut ouvrir qu'avec le
 * mot de passe perdu ne sauvegarde rien. L'interface le dit explicitement au
 * moment de l'export.
 *
 * `formatVersion` existe dès la première version : un fichier de sauvegarde
 * survit à l'application qui l'a produit, et devra un jour être relu par une
 * version qui ne connaît pas ce schéma.
 */
export const BACKUP_FORMAT = 'mission-control-backup'
export const BACKUP_VERSION = 1

const id = z.string().uuid()
const iso = z.string().nullable()

/**
 * Schémas de LECTURE, volontairement plus permissifs que ceux d'écriture.
 *
 * Un fichier de sauvegarde vient de l'extérieur : il peut avoir été édité à la
 * main, tronqué, ou produit par une version antérieure. On accepte donc des
 * champs manquants avec une valeur par défaut plutôt que de rejeter tout le
 * fichier pour une couleur absente — mais jamais une valeur hors énumération,
 * qui violerait une contrainte de la base.
 */
const projectSchema = z.object({
  id,
  name: z.string().max(200),
  description: z.string().nullable().default(null),
  color: z.string().max(32).default('#3D7BFF'),
  icon: z.string().max(16).nullable().default(null),
  status: z.enum(PROJECT_STATUSES).default('ACTIVE'),
  deadline: iso.default(null),
  position: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string()
})

const taskSchema = z.object({
  id,
  projectId: id.nullable().default(null),
  title: z.string().max(500),
  description: z.string().nullable().default(null),
  status: z.enum(TASK_STATUSES).default('TODO'),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  dueDate: iso.default(null),
  completedAt: iso.default(null),
  estimatedMinutes: z.number().int().positive().nullable().default(null),
  position: z.number().default(0),
  recurrenceRule: z.string().nullable().default(null),
  recurrenceParentId: id.nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string()
})

const subtaskSchema = z.object({
  id,
  taskId: id,
  title: z.string().max(500),
  completed: z.boolean().default(false),
  position: z.number().default(0)
})

const tagSchema = z.object({
  id,
  name: z.string().max(64),
  color: z.string().max(32).default('#4FD5E8')
})

const goalSchema = z.object({
  id,
  projectId: id.nullable().default(null),
  title: z.string().max(500),
  description: z.string().nullable().default(null),
  targetValue: z.number().positive().default(100),
  currentValue: z.number().min(0).default(0),
  deadline: iso.default(null),
  status: z.enum(GOAL_STATUSES).default('ACTIVE'),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: z.string(),

  /**
   * Identité VISIBLE seulement. Ni empreinte de mot de passe, ni clé enveloppée,
   * ni phrase de récupération : un fichier de sauvegarde ne doit jamais suffire
   * à usurper un compte, ni à ouvrir un coffre.
   */
  profile: z.object({
    displayName: z.string().max(64),
    avatar: z.string().nullable().default(null),
    accentColor: z.string().max(32).default('#3D7BFF')
  }),

  settings: z.object({
    theme: z.enum(THEMES).default('dark'),
    language: z.enum(LANGUAGES).default('fr'),
    notificationsEnabled: z.boolean().default(true),
    preferences: z.record(z.unknown()).default({})
  }),

  projects: z.array(projectSchema).default([]),
  tasks: z.array(taskSchema).default([]),
  subtasks: z.array(subtaskSchema).default([]),
  tags: z.array(tagSchema).default([]),
  taskTags: z.array(z.object({ taskId: id, tagId: id })).default([]),
  goals: z.array(goalSchema).default([])
})

export type BackupDocument = z.infer<typeof backupSchema>

/** `merge` ajoute sans écraser ; `replace` vide le coffre d'abord. */
export const IMPORT_MODES = ['merge', 'replace'] as const
export type ImportMode = (typeof IMPORT_MODES)[number]

export const importOptionsSchema = z.object({
  mode: z.enum(IMPORT_MODES).default('merge')
})

export interface ImportReport {
  mode: ImportMode
  projects: number
  tasks: number
  subtasks: number
  tags: number
  goals: number
  /** Lignes ignorées parce que leur identifiant ou leur nom existait déjà. */
  skipped: number
}

export interface ExportReport {
  path: string
  tasks: number
  projects: number
}
