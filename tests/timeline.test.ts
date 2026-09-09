import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Db } from '@main/db/connection'
import { timelineService } from '@main/services/timeline.service'
import { tasksService } from '@main/services/tasks.service'
import { projectsService } from '@main/services/projects.service'
import { AppErrorCode } from '@shared/errors'
import { createTestEnv, seedUser, signIn, type TestEnv } from './helpers'

let env: TestEnv
let db: Db
let aliceId: string

function daysFromNow(days: number): string {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

beforeEach(() => {
  env = createTestEnv()
  db = env.vault
  aliceId = seedUser(env, 'alice')
  signIn(env, aliceId)
})

afterEach(() => env.close())

describe('bornes d’une mission', () => {
  it('déduit le début de la première échéance de ses opérations', () => {
    const project = projectsService.create(db, { name: 'Programme' })
    tasksService.create(db, { title: 'Tard', projectId: project.id, dueDate: daysFromNow(20) })
    tasksService.create(db, { title: 'Tôt', projectId: project.id, dueDate: daysFromNow(5) })

    const entry = timelineService.load(db).entries[0]
    expect(entry?.start).toBe(daysFromNow(5))
  })

  it('retombe sur la date de création quand aucune opération n’est datée', () => {
    const project = projectsService.create(db, { name: 'Sans date' })
    tasksService.create(db, { title: 'Sans échéance', projectId: project.id })

    const entry = timelineService.load(db).entries[0]
    expect(entry?.start).toBe(project.createdAt)
    // Aucun horizon connu : `end` vaut null, et l'interface n'invente pas de barre.
    expect(entry?.end).toBeNull()
    expect(entry?.hasDeadline).toBe(false)
  })

  it('la date limite DÉCLARÉE l’emporte sur la dernière échéance', () => {
    const project = projectsService.create(db, {
      name: 'Programme',
      deadline: daysFromNow(30)
    })
    tasksService.create(db, { title: 'Après', projectId: project.id, dueDate: daysFromNow(60) })

    const entry = timelineService.load(db).entries[0]
    expect(entry?.end).toBe(daysFromNow(30))
    expect(entry?.hasDeadline).toBe(true)
  })

  it('déduit la fin de la dernière échéance à défaut de date limite', () => {
    const project = projectsService.create(db, { name: 'Programme' })
    tasksService.create(db, { title: 'Une', projectId: project.id, dueDate: daysFromNow(5) })
    tasksService.create(db, { title: 'Deux', projectId: project.id, dueDate: daysFromNow(40) })

    const entry = timelineService.load(db).entries[0]
    expect(entry?.end).toBe(daysFromNow(40))
    // Le drapeau distingue une fin déduite d'une fin promise : l'interface en
    // fait un trait tireté.
    expect(entry?.hasDeadline).toBe(false)
  })
})

describe('jalons', () => {
  it('rattache chaque échéance à sa mission', () => {
    const project = projectsService.create(db, { name: 'Programme' })
    tasksService.create(db, { title: 'Jalon', projectId: project.id, dueDate: daysFromNow(3) })

    const entry = timelineService.load(db).entries[0]
    expect(entry?.milestones.map((m) => m.title)).toEqual(['Jalon'])
  })

  it('range les opérations datées SANS mission dans leur propre ligne', () => {
    tasksService.create(db, { title: 'Orpheline', dueDate: daysFromNow(7) })

    const data = timelineService.load(db)
    expect(data.entries).toHaveLength(0)
    expect(data.unassigned.map((m) => m.title)).toEqual(['Orpheline'])
  })

  it('ignore les opérations sans échéance : elles ne se situent nulle part', () => {
    const project = projectsService.create(db, { name: 'Programme' })
    tasksService.create(db, { title: 'Datée', projectId: project.id, dueDate: daysFromNow(2) })
    tasksService.create(db, { title: 'Non datée', projectId: project.id })

    const entry = timelineService.load(db).entries[0]
    expect(entry?.milestones).toHaveLength(1)
    // Elle compte quand même dans l'avancement de la mission.
    expect(entry?.taskTotal).toBe(2)
  })

  it('exclut les opérations archivées', () => {
    const project = projectsService.create(db, { name: 'Programme' })
    tasksService.create(db, {
      title: 'Rangée',
      projectId: project.id,
      dueDate: daysFromNow(4),
      status: 'ARCHIVED'
    })

    expect(timelineService.load(db).entries[0]?.milestones).toHaveLength(0)
  })

  it('trie les jalons par échéance croissante', () => {
    const project = projectsService.create(db, { name: 'Programme' })
    tasksService.create(db, { title: 'C', projectId: project.id, dueDate: daysFromNow(30) })
    tasksService.create(db, { title: 'A', projectId: project.id, dueDate: daysFromNow(2) })
    tasksService.create(db, { title: 'B', projectId: project.id, dueDate: daysFromNow(15) })

    const entry = timelineService.load(db).entries[0]
    expect(entry?.milestones.map((m) => m.title)).toEqual(['A', 'B', 'C'])
  })
})

describe('progression et bornes globales', () => {
  it('calcule la progression de chaque mission', () => {
    const project = projectsService.create(db, { name: 'Programme' })
    tasksService.create(db, { title: 'Faite', projectId: project.id, status: 'COMPLETED' })
    tasksService.create(db, { title: 'À faire', projectId: project.id })

    expect(timelineService.load(db).entries[0]?.progress).toBe(0.5)
  })

  it('renvoie les bornes réelles des données', () => {
    const project = projectsService.create(db, { name: 'Programme' })
    tasksService.create(db, { title: 'Début', projectId: project.id, dueDate: daysFromNow(-10) })
    tasksService.create(db, { title: 'Fin', projectId: project.id, dueDate: daysFromNow(50) })

    const range = timelineService.load(db).range
    expect(range?.from).toBe(daysFromNow(-10))
    expect(range?.to).toBe(daysFromNow(50))
  })

  it('renvoie des bornes nulles quand il n’y a rien à situer', () => {
    expect(timelineService.load(db).range).toBeNull()
  })

  it('inclut les opérations sans mission dans les bornes', () => {
    tasksService.create(db, { title: 'Orpheline', dueDate: daysFromNow(90) })
    expect(timelineService.load(db).range?.to).toBe(daysFromNow(90))
  })
})

describe('isolation', () => {
  it('exige une session active', () => {
    env.close()
    env = createTestEnv()
    expect(() => timelineService.load(env.vault)).toThrow(
      expect.objectContaining({ code: AppErrorCode.AUTH_REQUIRED })
    )
  })

  it('ne montre jamais les missions d’un autre utilisateur', () => {
    const project = projectsService.create(db, { name: 'Mission d’Alice' })
    tasksService.create(db, { title: 'Tâche', projectId: project.id, dueDate: daysFromNow(3) })

    signIn(env, seedUser(env, 'bob'))

    const data = timelineService.load(db)
    expect(data.entries).toEqual([])
    expect(data.unassigned).toEqual([])
    expect(data.range).toBeNull()
  })
})
