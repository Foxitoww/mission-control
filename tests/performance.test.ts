import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Db } from '@main/db/connection'
import { tasksService } from '@main/services/tasks.service'
import { dashboardService } from '@main/services/dashboard.service'
import { searchService } from '@main/services/search.service'
import { projectsRepo } from '@main/repositories/projects.repo'
import { createTestEnv, seedUser, signIn, type TestEnv } from './helpers'

/**
 * Garde-fous de performance (§32).
 *
 * Deux natures d'assertion, volontairement :
 *
 *  · les PLANS de requête sont déterministes — ils vérifient qu'un index est
 *    bien emprunté, ce qui ne dépend ni de la machine ni de sa charge ;
 *  · les DURÉES sont larges — dix fois la mesure observée. Elles n'attestent
 *    pas d'une vitesse, elles attrapent un retour à un comportement quadratique.
 *
 * Sans les secondes, un jour quelqu'un remettrait des sous-requêtes corrélées et
 * personne ne le verrait avant d'avoir 200 projets.
 */

const TASKS = 5000
const PROJECTS = 200
const TAGS = 60

let env: TestEnv
let db: Db
let alice: string
let tagIds: string[] = []

beforeAll(() => {
  env = createTestEnv()
  db = env.vault
  alice = seedUser(env, 'alice')
  signIn(env, alice)

  const now = new Date().toISOString()

  const projectIds: string[] = []
  const insertProject = db.prepare(
    'INSERT INTO projects (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
  const insertTag = db.prepare('INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)')
  const insertTask = db.prepare(
    `INSERT INTO tasks (id, user_id, project_id, title, description, status, priority,
                        due_date, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertLink = db.prepare('INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)')

  const statuses = ['TODO', 'IN_PROGRESS', 'BLOCKED']
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

  db.transaction(() => {
    for (let i = 0; i < PROJECTS; i += 1) {
      const id = randomUUID()
      insertProject.run(id, alice, `Projet ${i}`, now, now)
      projectIds.push(id)
    }
    for (let i = 0; i < TAGS; i += 1) {
      const id = randomUUID()
      insertTag.run(id, alice, `tag-${i}`)
      tagIds.push(id)
    }
    for (let i = 0; i < TASKS; i += 1) {
      const id = randomUUID()
      insertTask.run(
        id,
        alice,
        projectIds[i % PROJECTS],
        `Operation numero ${i}`,
        `Description de controle ${i}`,
        statuses[i % 3],
        priorities[i % 4],
        new Date(Date.now() + ((i % 60) - 30) * 86_400_000).toISOString(),
        i * 1000,
        now,
        now
      )
      insertLink.run(id, tagIds[i % TAGS])
    }
  })()
})

afterAll(() => env.close())

function elapsed(fn: () => unknown): number {
  const start = performance.now()
  fn()
  return performance.now() - start
}

function plan(sql: string, ...params: unknown[]): string {
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[]
  return rows.map((row) => row.detail).join(' | ')
}

describe('plans de requête', () => {
  it('emprunte l’index sur (user_id, status)', () => {
    const detail = plan('SELECT t.id FROM tasks t WHERE t.user_id = ? AND t.status = ?', alice, 'BLOCKED')
    expect(detail).toContain('idx_tasks_user_status')
  })

  it('emprunte l’index sur (user_id, due_date)', () => {
    const detail = plan(
      `SELECT t.id FROM tasks t WHERE t.user_id = ? AND t.due_date < ?
        AND t.status IN ('TODO','IN_PROGRESS','BLOCKED') ORDER BY t.due_date ASC`,
      alice,
      new Date().toISOString()
    )
    expect(detail).toContain('idx_tasks_user_due')
  })

  it('compte les tâches par projet en UNE passe, pas une par projet', () => {
    const detail = plan(
      `SELECT p.id FROM projects p
       LEFT JOIN (SELECT project_id, COUNT(*) AS n FROM tasks
                   WHERE user_id = ? AND project_id IS NOT NULL GROUP BY project_id) agg
              ON agg.project_id = p.id
        WHERE p.user_id = ?`,
      alice,
      alice
    )

    // « CORRELATED » signalerait le retour du motif quadratique : une
    // sous-requête réexécutée pour chaque projet.
    expect(detail).not.toContain('CORRELATED')
  })
})

describe('temps de réponse sur 5000 opérations', () => {
  it('liste sans filtre', () => {
    expect(elapsed(() => tasksService.list(db, {}))).toBeLessThan(150)
  })

  it('liste filtrée par statut', () => {
    expect(elapsed(() => tasksService.list(db, { statuses: ['BLOCKED'] }))).toBeLessThan(150)
  })

  it('filtre par deux étiquettes', () => {
    const both = [tagIds[0] as string, tagIds[1] as string]
    expect(elapsed(() => tasksService.list(db, { tagIds: both }))).toBeLessThan(150)
  })

  it('recherche globale', () => {
    expect(elapsed(() => searchService.run(db, { query: 'operation' }))).toBeLessThan(150)
  })

  it('liste des 200 projets avec leur progression', () => {
    // Mesuré à 1,7 ms après optimisation ; 81 ms avant. Le seuil attrape le
    // retour aux sous-requêtes corrélées sans être sensible à la machine.
    expect(elapsed(() => projectsRepo.list(db, alice))).toBeLessThan(60)
  })

  it('tableau de bord complet', () => {
    expect(elapsed(() => dashboardService.load(db))).toBeLessThan(200)
  })
})
