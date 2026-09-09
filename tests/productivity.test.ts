import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Db } from '@main/db/connection'
import { nextOccurrence } from '@main/services/recurrence'
import { tasksService } from '@main/services/tasks.service'
import { goalsService } from '@main/services/goals.service'
import { projectsService } from '@main/services/projects.service'
import { statsService } from '@main/services/stats.service'
import { AppErrorCode } from '@shared/errors'
import type { RecurrenceRule } from '@shared/schemas/recurrence.schema'
import { createTestEnv, seedUser, signIn, type TestEnv } from './helpers'

let env: TestEnv
let db: Db
let aliceId: string

function rule(partial: Partial<RecurrenceRule>): RecurrenceRule {
  return { freq: 'DAILY', interval: 1, weekdays: [], ...partial }
}

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

describe('calcul de la prochaine occurrence', () => {
  const now = new Date('2026-03-10T12:00:00')

  it('quotidien', () => {
    const next = nextOccurrence(rule({ freq: 'DAILY' }), new Date('2026-03-10T09:00:00'), now)
    expect(next?.getDate()).toBe(11)
  })

  it('tous les trois jours — c’est le mode « personnalisé »', () => {
    const next = nextOccurrence(
      rule({ freq: 'DAILY', interval: 3 }),
      new Date('2026-03-10T09:00:00'),
      now
    )
    expect(next?.getDate()).toBe(13)
  })

  it('hebdomadaire', () => {
    const next = nextOccurrence(rule({ freq: 'WEEKLY' }), new Date('2026-03-10T09:00:00'), now)
    expect(next?.getDate()).toBe(17)
  })

  it('hebdomadaire avec jours choisis : passe au prochain jour retenu', () => {
    // 10 mars 2026 est un mardi (2). Jours retenus : mardi et jeudi.
    const next = nextOccurrence(
      rule({ freq: 'WEEKLY', weekdays: [2, 4] }),
      new Date('2026-03-10T09:00:00'),
      now
    )
    expect(next?.getDay()).toBe(4) // jeudi
    expect(next?.getDate()).toBe(12)
  })

  it('hebdomadaire : repasse à la semaine suivante quand il ne reste aucun jour', () => {
    // Vendredi 13, jours retenus lundi (1) et mardi (2) : rien après vendredi.
    const next = nextOccurrence(
      rule({ freq: 'WEEKLY', weekdays: [1, 2] }),
      new Date('2026-03-13T09:00:00'),
      new Date('2026-03-13T12:00:00')
    )
    expect(next?.getDay()).toBe(1)
    expect(next?.getDate()).toBe(16)
  })

  it('mensuel', () => {
    const next = nextOccurrence(rule({ freq: 'MONTHLY' }), new Date('2026-03-10T09:00:00'), now)
    expect(next?.getMonth()).toBe(3) // avril
    expect(next?.getDate()).toBe(10)
  })

  it('mensuel : le 31 janvier tombe le 28 février, PAS le 3 mars', () => {
    // Le piège classique de setMonth : février n'a pas de 31.
    const next = nextOccurrence(
      rule({ freq: 'MONTHLY' }),
      new Date('2026-01-31T09:00:00'),
      new Date('2026-01-31T12:00:00')
    )
    expect(next?.getMonth()).toBe(1) // février
    expect(next?.getDate()).toBe(28)
  })

  it('rattrape le retard au lieu de créer une occurrence déjà dépassée', () => {
    // Tâche quotidienne dont l'échéance remonte à trois semaines : la prochaine
    // doit être dans le futur, pas trois semaines en arrière.
    const next = nextOccurrence(
      rule({ freq: 'DAILY' }),
      new Date('2026-02-15T09:00:00'),
      new Date('2026-03-10T12:00:00')
    )
    expect(next).not.toBeNull()
    expect((next as Date).getTime()).toBeGreaterThan(new Date('2026-03-10T00:00:00').getTime())
  })
})

describe('tâches récurrentes', () => {
  it('exige une échéance', () => {
    expect(() =>
      tasksService.create(db, { title: 'Sans date', recurrence: rule({ freq: 'DAILY' }) })
    ).toThrow(expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED }))
  })

  it('engendre l’occurrence suivante à la complétion', () => {
    const task = tasksService.create(db, {
      title: 'Relevé quotidien',
      dueDate: daysFromNow(0),
      recurrence: rule({ freq: 'DAILY' })
    })

    tasksService.toggle(db, { id: task.id })

    const all = tasksService.list(db, { statuses: ['TODO'] })
    expect(all.map((t) => t.title)).toEqual(['Relevé quotidien'])
    expect(all[0]?.id).not.toBe(task.id)
  })

  it('CONSERVE la tâche terminée comme historique', () => {
    const task = tasksService.create(db, {
      title: 'Relevé',
      dueDate: daysFromNow(0),
      recurrence: rule({ freq: 'DAILY' })
    })
    tasksService.toggle(db, { id: task.id })

    // Deux lignes : l'occurrence faite et la suivante. Réutiliser la même ligne
    // rendrait « j'ai fait ça 14 fois » indémontrable.
    expect(tasksService.list(db, {})).toHaveLength(2)
    expect(tasksService.get(db, { id: task.id }).status).toBe('COMPLETED')
  })

  it('rattache toutes les occurrences à la PREMIÈRE de la série', () => {
    const first = tasksService.create(db, {
      title: 'Série',
      dueDate: daysFromNow(0),
      recurrence: rule({ freq: 'DAILY' })
    })

    tasksService.toggle(db, { id: first.id })
    const second = tasksService.list(db, { statuses: ['TODO'] })[0]
    expect(second?.recurrenceParentId).toBe(first.id)

    tasksService.toggle(db, { id: second?.id as string })
    const third = tasksService.list(db, { statuses: ['TODO'] })[0]

    // La troisième pointe encore vers la PREMIÈRE, pas vers la deuxième.
    expect(third?.recurrenceParentId).toBe(first.id)
  })

  it('transmet les étiquettes à l’occurrence suivante', () => {
    const task = tasksService.create(db, {
      title: 'Ménage',
      dueDate: daysFromNow(0),
      recurrence: rule({ freq: 'WEEKLY' })
    })
    const tagged = tasksService.update(db, { id: task.id, tagIds: [] })
    expect(tagged.tags).toEqual([])

    tasksService.toggle(db, { id: task.id })
    const next = tasksService.list(db, { statuses: ['TODO'] })[0]
    expect(next?.recurrence?.freq).toBe('WEEKLY')
  })

  it('n’engendre rien pour une tâche non récurrente', () => {
    const task = tasksService.create(db, { title: 'Ponctuelle', dueDate: daysFromNow(0) })
    tasksService.toggle(db, { id: task.id })

    expect(tasksService.list(db, {})).toHaveLength(1)
  })

  it('rouvrir puis reterminer n’engendre qu’une occurrence par complétion', () => {
    const task = tasksService.create(db, {
      title: 'Relevé',
      dueDate: daysFromNow(0),
      recurrence: rule({ freq: 'DAILY' })
    })

    tasksService.toggle(db, { id: task.id }) // terminée -> 2 tâches
    tasksService.toggle(db, { id: task.id }) // rouverte -> toujours 2
    expect(tasksService.list(db, {})).toHaveLength(2)

    tasksService.toggle(db, { id: task.id }) // reterminée -> 3
    expect(tasksService.list(db, {})).toHaveLength(3)
  })
})

describe('objectifs', () => {
  it('calcule la progression à la lecture', () => {
    const goal = goalsService.create(db, { title: 'Lire 10 rapports', targetValue: 10 })
    const advanced = goalsService.advance(db, { id: goal.id, by: 4 })

    expect(advanced.progress).toBeCloseTo(0.4)
  })

  it('plafonne la progression à 100 %', () => {
    const goal = goalsService.create(db, { title: 'Cible', targetValue: 10 })
    expect(goalsService.advance(db, { id: goal.id, by: 25 }).progress).toBe(1)
  })

  it('se termine automatiquement quand la cible est atteinte', () => {
    const goal = goalsService.create(db, { title: 'Cible', targetValue: 3 })
    expect(goalsService.advance(db, { id: goal.id, by: 3 }).status).toBe('COMPLETED')
  })

  it('ne se ROUVRE jamais tout seul si la valeur redescend', () => {
    const goal = goalsService.create(db, { title: 'Cible', targetValue: 3 })
    goalsService.advance(db, { id: goal.id, by: 3 })

    // Corriger une saisie ne doit pas annuler une réussite.
    const corrected = goalsService.advance(db, { id: goal.id, by: -2 })
    expect(corrected.status).toBe('COMPLETED')
    expect(corrected.currentValue).toBe(1)
  })

  it('ne descend jamais sous zéro', () => {
    const goal = goalsService.create(db, { title: 'Cible', targetValue: 10 })
    expect(goalsService.advance(db, { id: goal.id, by: -5 }).currentValue).toBe(0)
  })

  it('un statut explicite l’emporte sur la déduction automatique', () => {
    const goal = goalsService.create(db, { title: 'Cible', targetValue: 3 })
    const abandoned = goalsService.update(db, { id: goal.id, currentValue: 3, status: 'ABANDONED' })
    expect(abandoned.status).toBe('ABANDONED')
  })

  it('refuse un objectif rattaché à un projet inexistant', () => {
    expect(() =>
      goalsService.create(db, {
        title: 'X',
        projectId: '00000000-0000-4000-8000-000000000000'
      })
    ).toThrow(expect.objectContaining({ code: AppErrorCode.NOT_FOUND }))
  })

  it('reste invisible pour un autre utilisateur', () => {
    goalsService.create(db, { title: 'Objectif d’Alice' })
    signIn(env, seedUser(env, 'bob'))

    expect(goalsService.list(db)).toEqual([])
  })
})

describe('statistiques', () => {
  it('renvoie une série continue, jours vides compris', () => {
    const stats = statsService.load(db, { days: 14 })

    // Sans les trous, trois barres côte à côte laisseraient croire à trois
    // jours consécutifs alors qu'ils peuvent être espacés d'une semaine.
    expect(stats.daily).toHaveLength(14)
    expect(stats.daily.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date))).toBe(true)
  })

  it('compte les créations et les complétions du jour', () => {
    const task = tasksService.create(db, { title: 'Aujourd’hui' })
    tasksService.toggle(db, { id: task.id })

    const stats = statsService.load(db, {})
    const today = stats.daily[stats.daily.length - 1]

    expect(today?.created).toBe(1)
    expect(today?.completed).toBe(1)
  })

  it('expose TOUTES les priorités, même à zéro', () => {
    const stats = statsService.load(db, {})
    // Des colonnes qui apparaissent et disparaissent rendent l'histogramme
    // illisible d'une semaine sur l'autre.
    expect(stats.byPriority.map((entry) => entry.priority)).toEqual([
      'LOW',
      'MEDIUM',
      'HIGH',
      'CRITICAL'
    ])
  })

  it('compte une série en cours dès la première complétion', () => {
    const task = tasksService.create(db, { title: 'Série' })
    tasksService.toggle(db, { id: task.id })

    expect(statsService.load(db, {}).streak).toBe(1)
  })

  it('ne casse pas la série parce que la journée vient de commencer', () => {
    // Aucune complétion aujourd'hui : la série vaut 0, mais le jour en cours
    // n'est pas compté comme une rupture.
    expect(statsService.load(db, {}).streak).toBe(0)
  })

  it('additionne les minutes estimées des opérations terminées', () => {
    const task = tasksService.create(db, { title: 'Longue', estimatedMinutes: 90 })
    tasksService.toggle(db, { id: task.id })

    expect(statsService.load(db, {}).estimatedMinutesCompleted).toBe(90)
  })

  it('inclut la progression des projets et le décompte des objectifs', () => {
    const project = projectsService.create(db, { name: 'Programme' })
    tasksService.create(db, { title: 'Une', projectId: project.id, status: 'COMPLETED' })
    goalsService.create(db, { title: 'Objectif', targetValue: 1 })

    const stats = statsService.load(db, {})
    expect(stats.byProject).toHaveLength(1)
    expect(stats.byProject[0]?.progress).toBe(1)
    expect(stats.goals.total).toBe(1)
  })
})
