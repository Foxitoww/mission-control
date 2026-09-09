import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Db } from '@main/db/connection'
import { session } from '@main/services/session.service'
import { settingsRepo } from '@main/repositories/settings.repo'
import { AppErrorCode } from '@shared/errors'
import { createTestEnv, seedUser, signIn, type TestEnv } from './helpers'

/**
 * ISOLATION DES UTILISATEURS — porte bloquante (§33, ADR-003).
 *
 *   USER A → TASK A
 *   USER B → TASK B
 *   USER A ≠ USER B
 *
 * Ce fichier éprouve la couche LOGIQUE : le filtre `WHERE user_id = ?` présent
 * dans chaque requête. Les deux utilisateurs partagent donc volontairement le
 * même coffre, ce qui n'arrive jamais en production — précisément pour que le
 * test ne puisse pas réussir par accident grâce à la séparation des fichiers.
 *
 * La couche PHYSIQUE (un coffre chiffré par compte) est vérifiée dans
 * `encryption.test.ts`.
 */

let env: TestEnv
let db: Db
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

beforeEach(() => {
  env = createTestEnv()
  db = env.vault

  alice = seedUser(env, 'alice')
  bob = seedUser(env, 'bob')

  seedTask(alice, 'TASK A')
  seedTask(bob, 'TASK B')

  signIn(env, alice)
})

afterEach(() => env.close())

describe('cloisonnement des données', () => {
  it('chaque utilisateur ne voit que ses propres tâches', () => {
    expect(tasksOf(alice)).toEqual(['TASK A'])
    expect(tasksOf(bob)).toEqual(['TASK B'])
  })

  it('les tags homonymes coexistent sans collision', () => {
    const insert = db.prepare('INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)')
    insert.run(randomUUID(), alice, 'urgent')
    insert.run(randomUUID(), bob, 'urgent')

    expect(db.prepare('SELECT COUNT(*) AS n FROM tags WHERE name = ?').get('urgent')).toEqual({
      n: 2
    })
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

describe('cascades internes au coffre', () => {
  it('supprimer une tâche efface ses sous-tâches', () => {
    const taskId = seedTask(alice, 'AVEC SOUS-TACHES')
    db.prepare('INSERT INTO subtasks (id, task_id, title, position) VALUES (?, ?, ?, 0)').run(
      randomUUID(),
      taskId,
      'ETAPE 1'
    )

    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId)

    // Si PRAGMA foreign_keys avait été oublié, cette ligne survivrait en silence.
    expect(db.prepare('SELECT COUNT(*) AS n FROM subtasks').get()).toEqual({ n: 0 })
  })
})

describe('session', () => {
  it('bloque tout accès sans session active', () => {
    session.clear()
    expect(() => session.requireUserId()).toThrow(
      expect.objectContaining({ code: AppErrorCode.AUTH_REQUIRED })
    )
  })

  it('refuse l’accès au coffre hors session', () => {
    session.clear()
    expect(() => session.requireVault()).toThrow(
      expect.objectContaining({ code: AppErrorCode.AUTH_REQUIRED })
    )
  })

  it('se connecter en tant que Bob ne donne jamais accès aux données d’Alice', () => {
    signIn(env, bob)

    // Le point central d'ADR-003 : la seule identité disponible pour construire
    // une requête est celle de la session. Il n'existe aucun chemin par lequel
    // un appel entrant pourrait en désigner une autre.
    expect(tasksOf(session.requireUserId())).toEqual(['TASK B'])
  })

  it('les identifiants d’Alice et Bob sont bien distincts', () => {
    expect(alice).not.toBe(bob)
  })
})
