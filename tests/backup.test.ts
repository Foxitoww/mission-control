import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Db } from '@main/db/connection'
import { backupService } from '@main/services/backup.service'
import { tasksService } from '@main/services/tasks.service'
import { projectsService } from '@main/services/projects.service'
import { tagsService } from '@main/services/tags.service'
import { goalsService } from '@main/services/goals.service'
import { subtasksService } from '@main/services/subtasks.service'
import { settingsRepo } from '@main/repositories/settings.repo'
import { AppErrorCode } from '@shared/errors'
import { BACKUP_FORMAT } from '@shared/schemas/backup.schema'
import { createTestEnv, seedUser, signIn, type TestEnv } from './helpers'

let env: TestEnv
let db: Db
let accounts: Db
let aliceId: string
let directory: string

function seedData(): void {
  const project = projectsService.create(db, { name: 'Programme Ariane' })
  const tag = tagsService.create(db, { name: 'orbite' })

  const task = tasksService.create(db, {
    title: 'Revue de trajectoire',
    description: 'Contrôle avant tir',
    projectId: project.id,
    priority: 'CRITICAL',
    tagIds: [tag.id]
  })
  subtasksService.create(db, { taskId: task.id, title: 'Étape 1' })

  tasksService.create(db, { title: 'Déjà faite', status: 'COMPLETED' })
  goalsService.create(db, { title: 'Objectif', targetValue: 10, currentValue: 4 })
}

beforeEach(() => {
  env = createTestEnv()
  db = env.vault
  accounts = env.accounts
  aliceId = seedUser(env, 'alice')
  signIn(env, aliceId)
  directory = mkdtempSync(join(tmpdir(), 'mc-backup-'))
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
  env.close()
})

describe('export', () => {
  it('produit un document complet et identifiable', () => {
    seedData()
    const document = backupService.build(db, accounts)

    expect(document.format).toBe(BACKUP_FORMAT)
    expect(document.formatVersion).toBe(1)
    expect(document.projects).toHaveLength(1)
    expect(document.tasks).toHaveLength(2)
    expect(document.subtasks).toHaveLength(1)
    expect(document.tags).toHaveLength(1)
    expect(document.taskTags).toHaveLength(1)
    expect(document.goals).toHaveLength(1)
  })

  it('n’exporte AUCUN secret', () => {
    seedData()
    const raw = JSON.stringify(backupService.build(db, accounts))

    // Une sauvegarde ne doit jamais suffire à usurper un compte ni à ouvrir un
    // coffre : ni empreinte de mot de passe, ni clé enveloppée, ni sel.
    for (const forbidden of ['passwordHash', 'password_hash', 'dek', 'kdfSalt', 'recovery']) {
      expect(raw).not.toContain(forbidden)
    }
  })

  it('écrit un JSON relisible à la main', () => {
    seedData()
    const path = join(directory, 'export.json')
    const report = backupService.exportToFile(db, accounts, path)

    expect(report.tasks).toBe(2)
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    expect(parsed.format).toBe(BACKUP_FORMAT)
    // Indenté : une sauvegarde se relit et se corrige.
    expect(readFileSync(path, 'utf-8')).toContain('\n  ')
  })
})

describe('import — aller-retour', () => {
  it('restaure exactement ce qui a été exporté dans un coffre vide', () => {
    seedData()
    const path = join(directory, 'export.json')
    backupService.exportToFile(db, accounts, path)

    // Nouveau coffre, même utilisateur : la restauration doit tout retrouver.
    const fresh = createTestEnv()
    const freshId = seedUser(fresh, 'alice')
    signIn(fresh, freshId)

    const report = backupService.importFromFile(fresh.vault, path, { mode: 'merge' })

    expect(report.projects).toBe(1)
    expect(report.tasks).toBe(2)
    expect(report.subtasks).toBe(1)
    expect(report.tags).toBe(1)
    expect(report.goals).toBe(1)

    const restored = tasksService.list(fresh.vault, {})
    expect(restored.map((task) => task.title).sort()).toEqual([
      'Déjà faite',
      'Revue de trajectoire'
    ])
    // Les relations survivent : l'étiquette est toujours posée sur sa tâche.
    expect(restored.find((task) => task.title === 'Revue de trajectoire')?.tags).toHaveLength(1)

    fresh.close()
    signIn(env, aliceId)
  })

  it('conserve les paramètres', () => {
    settingsRepo.update(db, aliceId, { theme: 'light', language: 'en' })
    const path = join(directory, 'export.json')
    backupService.exportToFile(db, accounts, path)

    const fresh = createTestEnv()
    const freshId = seedUser(fresh, 'alice')
    signIn(fresh, freshId)
    backupService.importFromFile(fresh.vault, path, {})

    expect(settingsRepo.get(fresh.vault, freshId)?.theme).toBe('light')
    fresh.close()
    signIn(env, aliceId)
  })
})

describe('import — conflits', () => {
  it('en mode fusion, ignore ce qui existe déjà au lieu d’échouer', () => {
    seedData()
    const path = join(directory, 'export.json')
    backupService.exportToFile(db, accounts, path)

    // Réimporter dans le MÊME coffre : tout est en double, donc tout est ignoré.
    const report = backupService.importFromFile(db, path, { mode: 'merge' })

    expect(report.tasks).toBe(0)
    expect(report.skipped).toBeGreaterThan(0)
    expect(tasksService.list(db, {})).toHaveLength(2)
  })

  it('en mode remplacement, efface d’abord les données existantes', () => {
    seedData()
    const path = join(directory, 'export.json')
    backupService.exportToFile(db, accounts, path)

    tasksService.create(db, { title: 'Ajoutée après la sauvegarde' })
    expect(tasksService.list(db, {})).toHaveLength(3)

    backupService.importFromFile(db, path, { mode: 'replace' })

    // La tâche postérieure disparaît : c'est bien un remplacement.
    const titles = tasksService.list(db, {}).map((task) => task.title)
    expect(titles).toHaveLength(2)
    expect(titles).not.toContain('Ajoutée après la sauvegarde')
  })
})

describe('import — données invalides (§18)', () => {
  it('refuse un fichier qui n’est pas du JSON', () => {
    const path = join(directory, 'broken.json')
    writeFileSync(path, 'ceci nest pas du json {{{')

    expect(() => backupService.importFromFile(db, path, {})).toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )
  })

  it('refuse un JSON valide qui n’est pas une sauvegarde', () => {
    const path = join(directory, 'other.json')
    writeFileSync(path, JSON.stringify({ hello: 'world' }))

    expect(() => backupService.importFromFile(db, path, {})).toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )
  })

  it('refuse un statut hors énumération plutôt que de corrompre la base', () => {
    seedData()
    const path = join(directory, 'export.json')
    backupService.exportToFile(db, accounts, path)

    const document = JSON.parse(readFileSync(path, 'utf-8'))
    document.tasks[0].status = 'LAUNCHED'
    writeFileSync(path, JSON.stringify(document))

    expect(() => backupService.importFromFile(db, path, {})).toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )
  })

  it('répare l’invariant statut / date d’un fichier édité à la main', () => {
    seedData()
    const path = join(directory, 'export.json')
    backupService.exportToFile(db, accounts, path)

    // COMPLETED sans completed_at violerait la contrainte CHECK et ferait
    // échouer tout l'import. Le service réapplique l'invariant.
    const document = JSON.parse(readFileSync(path, 'utf-8'))
    for (const task of document.tasks) {
      if (task.status === 'COMPLETED') task.completedAt = null
    }
    writeFileSync(path, JSON.stringify(document))

    const fresh = createTestEnv()
    const freshId = seedUser(fresh, 'alice')
    signIn(fresh, freshId)

    expect(() => backupService.importFromFile(fresh.vault, path, {})).not.toThrow()
    const done = tasksService.list(fresh.vault, { statuses: ['COMPLETED'] })
    expect(done[0]?.completedAt).not.toBeNull()

    fresh.close()
    signIn(env, aliceId)
  })

  it('n’écrit RIEN quand le fichier est refusé', () => {
    const path = join(directory, 'bad.json')
    writeFileSync(path, JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 1 }))

    expect(() => backupService.importFromFile(db, path, {})).toThrow()
    // La validation précède toute écriture : le coffre reste vide.
    expect(tasksService.list(db, {})).toHaveLength(0)
  })
})

describe('isolation', () => {
  it('exige une session active', () => {
    env.close()
    env = createTestEnv()
    expect(() => backupService.build(env.vault, env.accounts)).toThrow(
      expect.objectContaining({ code: AppErrorCode.AUTH_REQUIRED })
    )
  })

  it('n’exporte que les données de l’utilisateur connecté', () => {
    seedData()

    const bobId = seedUser(env, 'bob')
    signIn(env, bobId)
    tasksService.create(db, { title: 'Tâche de Bob' })

    const document = backupService.build(db, accounts)
    expect(document.tasks.map((task) => task.title)).toEqual(['Tâche de Bob'])
  })
})
