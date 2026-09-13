import { writeFileSync, readFileSync } from 'node:fs'
import type { Db } from '../db/connection'
import { session } from './session.service'
import { usersRepo } from '../repositories/users.repo'
import { settingsRepo } from '../repositories/settings.repo'
import { parseOrThrow } from '../lib/validate'
import { AppError, AppErrorCode } from '@shared/errors'
import {
  backupSchema,
  importOptionsSchema,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupDocument,
  type ImportReport,
  type ExportReport
} from '@shared/schemas/backup.schema'

/**
 * Sauvegarde et restauration (§18).
 *
 * L'export lit le coffre DÉCHIFFRÉ et écrit du JSON en clair. C'est le seul
 * artefact non protégé du produit, et c'est assumé : une sauvegarde illisible
 * sans le mot de passe perdu ne sauvegarde rien. L'interface l'annonce avant
 * d'écrire le fichier.
 *
 * L'import valide TOUT avant d'écrire quoi que ce soit, puis applique en une
 * transaction : un fichier corrompu ne peut pas laisser un coffre à moitié
 * restauré.
 */

interface Row {
  [column: string]: unknown
}

function rows(db: Db, sql: string, ...params: unknown[]): Row[] {
  return db.prepare(sql).all(...params) as Row[]
}

export const backupService = {
  /** Assemble le document, sans jamais toucher au matériel cryptographique. */
  build(vault: Db, accounts: Db): BackupDocument {
    const userId = session.requireUserId()

    const user = usersRepo.findById(accounts, userId)
    if (!user) throw new AppError(AppErrorCode.NOT_FOUND, 'NOT_FOUND')

    const settings = settingsRepo.get(vault, userId)

    return {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      profile: {
        displayName: user.displayName,
        avatar: user.avatar,
        accentColor: user.accentColor
      },
      settings: settings ?? {
        theme: 'dark',
        language: 'fr',
        notificationsEnabled: true,
        preferences: {}
      },
      projects: rows(
        vault,
        `SELECT id, name, description, color, icon, status, deadline, position,
                created_at, updated_at
           FROM projects WHERE user_id = ? ORDER BY position`,
        userId
      ).map((row) => ({
        id: row['id'] as string,
        name: row['name'] as string,
        description: (row['description'] as string) ?? null,
        color: row['color'] as string,
        icon: (row['icon'] as string) ?? null,
        status: row['status'] as BackupDocument['projects'][number]['status'],
        deadline: (row['deadline'] as string) ?? null,
        position: row['position'] as number,
        createdAt: row['created_at'] as string,
        updatedAt: row['updated_at'] as string
      })),
      tasks: rows(
        vault,
        `SELECT id, project_id, title, description, status, priority, due_date, completed_at,
                estimated_minutes, progress, position, recurrence_rule, recurrence_parent_id,
                created_at, updated_at
           FROM tasks WHERE user_id = ? ORDER BY position`,
        userId
      ).map((row) => ({
        id: row['id'] as string,
        projectId: (row['project_id'] as string) ?? null,
        title: row['title'] as string,
        description: (row['description'] as string) ?? null,
        status: row['status'] as BackupDocument['tasks'][number]['status'],
        priority: row['priority'] as BackupDocument['tasks'][number]['priority'],
        dueDate: (row['due_date'] as string) ?? null,
        completedAt: (row['completed_at'] as string) ?? null,
        estimatedMinutes: (row['estimated_minutes'] as number) ?? null,
        progress: row['progress'] as number,
        position: row['position'] as number,
        recurrenceRule: (row['recurrence_rule'] as string) ?? null,
        recurrenceParentId: (row['recurrence_parent_id'] as string) ?? null,
        createdAt: row['created_at'] as string,
        updatedAt: row['updated_at'] as string
      })),
      // Les sous-tâches sont rattachées par jointure sur les tâches de
      // l'utilisateur : elles n'ont pas de user_id à elles.
      subtasks: rows(
        vault,
        `SELECT s.id, s.task_id, s.title, s.completed, s.position
           FROM subtasks s JOIN tasks t ON t.id = s.task_id
          WHERE t.user_id = ? ORDER BY s.position`,
        userId
      ).map((row) => ({
        id: row['id'] as string,
        taskId: row['task_id'] as string,
        title: row['title'] as string,
        completed: row['completed'] === 1,
        position: row['position'] as number
      })),
      tags: rows(
        vault,
        'SELECT id, name, color FROM tags WHERE user_id = ? ORDER BY name',
        userId
      ).map((row) => ({
        id: row['id'] as string,
        name: row['name'] as string,
        color: row['color'] as string
      })),
      taskTags: rows(
        vault,
        `SELECT tt.task_id, tt.tag_id FROM task_tags tt
           JOIN tasks t ON t.id = tt.task_id WHERE t.user_id = ?`,
        userId
      ).map((row) => ({ taskId: row['task_id'] as string, tagId: row['tag_id'] as string })),
      goals: rows(
        vault,
        `SELECT id, project_id, title, description, target_value, current_value, deadline,
                status, created_at, updated_at
           FROM goals WHERE user_id = ? ORDER BY created_at`,
        userId
      ).map((row) => ({
        id: row['id'] as string,
        projectId: (row['project_id'] as string) ?? null,
        title: row['title'] as string,
        description: (row['description'] as string) ?? null,
        targetValue: row['target_value'] as number,
        currentValue: row['current_value'] as number,
        deadline: (row['deadline'] as string) ?? null,
        status: row['status'] as BackupDocument['goals'][number]['status'],
        createdAt: row['created_at'] as string,
        updatedAt: row['updated_at'] as string
      }))
    }
  },

  exportToFile(vault: Db, accounts: Db, path: string): ExportReport {
    const document = backupService.build(vault, accounts)
    // Indenté : une sauvegarde se relit, se compare, se corrige à la main.
    writeFileSync(path, JSON.stringify(document, null, 2), 'utf-8')
    return { path, tasks: document.tasks.length, projects: document.projects.length }
  },

  /**
   * Restaure un document validé.
   *
   * `merge` ajoute sans écraser : toute ligne dont l'identifiant — ou, pour une
   * étiquette, le nom — existe déjà est IGNORÉE et comptée. C'est le
   * comportement prévisible ; fusionner deux versions d'une même tâche
   * demanderait un arbitrage que l'application ne peut pas rendre à la place de
   * l'utilisateur.
   */
  restore(vault: Db, input: unknown, options: unknown): ImportReport {
    const userId = session.requireUserId()
    const document = parseOrThrow(backupSchema, input)
    const { mode } = parseOrThrow(importOptionsSchema, options ?? {})

    const report: ImportReport = {
      mode,
      projects: 0,
      tasks: 0,
      subtasks: 0,
      tags: 0,
      goals: 0,
      skipped: 0
    }

    // TOUT dans une seule transaction : un fichier qui casse à mi-chemin ne
    // doit pas laisser un coffre à moitié restauré.
    vault.transaction(() => {
      if (mode === 'replace') {
        // L'ordre suit les dépendances : les enfants avant les parents.
        for (const table of ['task_tags', 'subtasks']) {
          vault
            .prepare(
              `DELETE FROM ${table} WHERE task_id IN (SELECT id FROM tasks WHERE user_id = ?)`
            )
            .run(userId)
        }
        for (const table of ['goals', 'tasks', 'projects', 'tags']) {
          vault.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId)
        }
      }

      const insertProject = vault.prepare(
        `INSERT OR IGNORE INTO projects
           (id, user_id, name, description, color, icon, status, deadline, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const project of document.projects) {
        const result = insertProject.run(
          project.id,
          userId,
          project.name,
          project.description,
          project.color,
          project.icon,
          project.status,
          project.deadline,
          project.position,
          project.createdAt,
          project.updatedAt
        )
        result.changes > 0 ? (report.projects += 1) : (report.skipped += 1)
      }

      const insertTag = vault.prepare(
        `INSERT OR IGNORE INTO tags (id, user_id, name, color) VALUES (?, ?, ?, ?)`
      )
      for (const tag of document.tags) {
        const result = insertTag.run(tag.id, userId, tag.name, tag.color)
        result.changes > 0 ? (report.tags += 1) : (report.skipped += 1)
      }

      const insertTask = vault.prepare(
        `INSERT OR IGNORE INTO tasks
           (id, user_id, project_id, title, description, status, priority, due_date, completed_at,
            estimated_minutes, progress, position, recurrence_rule, recurrence_parent_id,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const task of document.tasks) {
        // L'invariant du schéma (COMPLETED ⟺ completed_at) est réappliqué :
        // un fichier édité à la main pourrait le violer, et la contrainte CHECK
        // ferait alors échouer tout l'import. Même chose pour l'avancement, dont
        // le CHECK n'est qu'un intervalle : on réaligne les deux bornes sur le
        // statut plutôt que de faire confiance à une valeur éditée à la main.
        const completedAt =
          task.status === 'COMPLETED' ? (task.completedAt ?? task.updatedAt) : null
        const progress =
          task.status === 'COMPLETED' ? 100 : task.status === 'TODO' ? 0 : task.progress

        const result = insertTask.run(
          task.id,
          userId,
          task.projectId,
          task.title,
          task.description,
          task.status,
          task.priority,
          task.dueDate,
          completedAt,
          task.estimatedMinutes,
          progress,
          task.position,
          task.recurrenceRule,
          task.recurrenceParentId,
          task.createdAt,
          task.updatedAt
        )
        result.changes > 0 ? (report.tasks += 1) : (report.skipped += 1)
      }

      const insertSubtask = vault.prepare(
        `INSERT OR IGNORE INTO subtasks (id, task_id, title, completed, position)
         VALUES (?, ?, ?, ?, ?)`
      )
      for (const subtask of document.subtasks) {
        const result = insertSubtask.run(
          subtask.id,
          subtask.taskId,
          subtask.title,
          subtask.completed ? 1 : 0,
          subtask.position
        )
        result.changes > 0 ? (report.subtasks += 1) : (report.skipped += 1)
      }

      const insertLink = vault.prepare(
        `INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)`
      )
      for (const link of document.taskTags) insertLink.run(link.taskId, link.tagId)

      const insertGoal = vault.prepare(
        `INSERT OR IGNORE INTO goals
           (id, user_id, project_id, title, description, target_value, current_value,
            deadline, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const goal of document.goals) {
        const result = insertGoal.run(
          goal.id,
          userId,
          goal.projectId,
          goal.title,
          goal.description,
          goal.targetValue,
          goal.currentValue,
          goal.deadline,
          goal.status,
          goal.createdAt,
          goal.updatedAt
        )
        result.changes > 0 ? (report.goals += 1) : (report.skipped += 1)
      }

      settingsRepo.update(vault, userId, document.settings)
    })()

    return report
  },

  importFromFile(vault: Db, path: string, options: unknown): ImportReport {
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(path, 'utf-8'))
    } catch {
      // Fichier illisible ou JSON invalide : un message clair, pas une exception
      // brute remontée jusqu'à l'écran.
      throw new AppError(AppErrorCode.VALIDATION_FAILED, 'BACKUP_UNREADABLE')
    }

    return backupService.restore(vault, parsed, options)
  }
}
