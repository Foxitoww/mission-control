import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from '@main/db/init'
import type { Db } from '@main/db/connection'
import { authService } from '@main/services/auth.service'
import { session } from '@main/services/session.service'
import { settingsRepo } from '@main/repositories/settings.repo'
import { usersRepo } from '@main/repositories/users.repo'
import { AppErrorCode } from '@shared/errors'
import { memoryStore } from './helpers'

/**
 * ISOLATION DES UTILISATEURS — porte bloquante de la Phase 2 (§33, ADR-003).
 *
 *   USER A → TASK A
 *   USER B → TASK B
 *   USER A ≠ USER B
 *
 * Aucun utilisateur ne doit jamais atteindre les données d'un autre, et
 * supprimer un compte ne doit rien retirer à l'autre.
 */

let db: Db
let store: ReturnType<typeof memoryStore>
let alice: string
let bob: string

function seedTask(userId: string, title: string): string {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO tasks (id, user_id, title, position, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)`
  ).run(id, userId, title, now, now)
  return id
}

/** Le motif obligatoire de toute lecture : filtrée par utilisateur. */
function tasksOf(userId: string): string[] {
  const rows = db
    .prepare('SELECT title FROM tasks WHERE user_id = ? ORDER BY title')
    .all(userId) as { title: string }[]
  return rows.map((row) => row.title)
}

beforeEach(async () => {
  db = createTestDatabase()
  store = memoryStore()
  session.clear()

  alice = (await authService.register(db, {
    username: 'alice',
    displayName: 'Alice',
    password: 'alice-password',
    avatar: null
  })).id
  session.clear()

  bob = (await authService.register(db, {
    username: 'bob',
    displayName: 'Bob',
    password: 'bob-password',
    avatar: null
  })).id
  session.clear()

  seedTask(alice, 'TASK A')
  seedTask(bob, 'TASK B')
})

afterEach(() => db.close())

describe('cloisonnement des données', () => {
  it('chaque utilisateur ne voit que ses propres tâches', () => {
    expect(tasksOf(alice)).toEqual(['TASK A'])
    expect(tasksOf(bob)).toEqual(['TASK B'])
  })

  it('les tags homonymes coexistent sans collision', () => {
    const insert = db.prepare('INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)')
    insert.run(randomUUID(), alice, 'urgent')
    insert.run(randomUUID(), bob, 'urgent')

    const count = db.prepare('SELECT COUNT(*) AS n FROM tags WHERE name = ?').get('urgent')
    expect(count).toEqual({ n: 2 })
  })

  it('le même utilisateur ne peut pas créer deux fois le même tag', () => {
    const insert = db.prepare('INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)')
    insert.run(randomUUID(), alice, 'urgent')
    expect(() => insert.run(randomUUID(), alice, 'urgent')).toThrow()
  })

  it('les paramètres restent propres à chaque utilisateur', () => {
    settingsRepo.update(db, alice, { theme: 'light', language: 'en' })

    expect(settingsRepo.get(db, alice)?.theme).toBe('light')
    expect(settingsRepo.get(db, bob)?.theme).toBe('dark')
    expect(settingsRepo.get(db, bob)?.language).toBe('fr')
  })
})

describe('suppression de compte', () => {
  it('efface toutes les données du compte supprimé et aucune de l’autre', async () => {
    await authService.login(db, { username: 'alice', password: 'alice-password' }, store)
    await authService.deleteAccount(db, { password: 'alice-password' }, store)

    expect(tasksOf(alice)).toEqual([])
    expect(tasksOf(bob)).toEqual(['TASK B'])
    expect(usersRepo.findById(db, bob)).not.toBeNull()
    expect(settingsRepo.get(db, bob)).not.toBeNull()
  })

  it('ne laisse aucune ligne orpheline (les cascades sont bien actives)', async () => {
    const taskId = seedTask(alice, 'AVEC SOUS-TACHES')
    db.prepare('INSERT INTO subtasks (id, task_id, title, position) VALUES (?, ?, ?, 0)').run(
      randomUUID(),
      taskId,
      'ETAPE 1'
    )

    await authService.login(db, { username: 'alice', password: 'alice-password' }, store)
    await authService.deleteAccount(db, { password: 'alice-password' }, store)

    // Si PRAGMA foreign_keys avait été oublié, ces lignes survivraient en silence.
    expect(db.prepare('SELECT COUNT(*) AS n FROM subtasks').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 1 })
  })
})

describe('session', () => {
  it('bloque tout accès sans session active', () => {
    session.clear()
    expect(() => session.requireUserId()).toThrow(
      expect.objectContaining({ code: AppErrorCode.AUTH_REQUIRED })
    )
  })

  it('se connecter en tant que Bob ne donne jamais accès aux données d’Alice', async () => {
    await authService.login(db, { username: 'bob', password: 'bob-password' }, store)

    const current = authService.currentUser(db)
    expect(current?.id).toBe(bob)

    // Le point central d'ADR-003 : la seule identité disponible pour construire
    // une requête est celle de la session. Il n'existe aucun chemin par lequel
    // un appel entrant pourrait en désigner une autre.
    expect(tasksOf(session.requireUserId())).toEqual(['TASK B'])
  })
})
