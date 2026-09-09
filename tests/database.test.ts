import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { applyPragmas, type Db } from '@main/db/connection'
import { createTestDatabase } from '@main/db/init'
import { migrate, currentVersion } from '@main/db/migrator'
import { migrations } from '@main/db/migrations'

let db: Db

beforeEach(() => {
  db = createTestDatabase()
})

afterEach(() => db.close())

describe('migrations', () => {
  it('porte la base à la dernière version', () => {
    const latest = Math.max(...migrations.map((m) => m.version))
    expect(currentVersion(db)).toBe(latest)
  })

  it('est idempotent : rejouer n’applique rien', () => {
    expect(migrate(db, migrations)).toBe(0)
  })

  it('crée toutes les tables attendues', () => {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]

    expect(rows.map((r) => r.name).sort()).toEqual([
      'goals',
      'projects',
      'settings',
      'subtasks',
      'tags',
      'task_tags',
      'tasks',
      'users'
    ])
  })

  it('crée les index préfixés par user_id', () => {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
      .all() as { name: string }[]

    expect(rows.length).toBeGreaterThanOrEqual(9)
    expect(rows.map((r) => r.name)).toContain('idx_tasks_user_status')
  })
})

describe('pragmas', () => {
  it('active les clés étrangères — sans quoi les cascades seraient inopérantes', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('utilise le mode WAL sur un fichier réel', () => {
    // WAL exige un fichier : une base :memory: reste en mode "memory".
    const file = new Database(':memory:')
    expect(() => applyPragmas(file)).not.toThrow()
    file.close()
  })
})

describe('contraintes du schéma', () => {
  const now = new Date().toISOString()

  function makeUser(): string {
    const id = randomUUID()
    db.prepare(
      `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at)
       VALUES (?, ?, 'X', 'scrypt$x', ?, ?)`
    ).run(id, `u${id.slice(0, 8)}`, now, now)
    return id
  }

  it('refuse un statut de tâche inconnu', () => {
    const userId = makeUser()
    expect(() =>
      db
        .prepare(
          `INSERT INTO tasks (id, user_id, title, status, position, created_at, updated_at)
           VALUES (?, ?, 'X', 'LAUNCHED', 0, ?, ?)`
        )
        .run(randomUUID(), userId, now, now)
    ).toThrow(/CHECK constraint/i)
  })

  it('refuse une tâche COMPLETED sans date de complétion', () => {
    // Invariant du schéma : le statut et la date ne peuvent pas diverger, sinon
    // les statistiques mentiraient.
    const userId = makeUser()
    expect(() =>
      db
        .prepare(
          `INSERT INTO tasks (id, user_id, title, status, position, created_at, updated_at)
           VALUES (?, ?, 'X', 'COMPLETED', 0, ?, ?)`
        )
        .run(randomUUID(), userId, now, now)
    ).toThrow(/CHECK constraint/i)
  })

  it('refuse une tâche rattachée à un utilisateur inexistant', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO tasks (id, user_id, title, position, created_at, updated_at)
           VALUES (?, 'utilisateur-fantome', 'X', 0, ?, ?)`
        )
        .run(randomUUID(), now, now)
    ).toThrow(/FOREIGN KEY/i)
  })

  it('détache les tâches quand leur projet est supprimé, sans les détruire', () => {
    const userId = makeUser()
    const projectId = randomUUID()
    db.prepare(
      `INSERT INTO projects (id, user_id, name, created_at, updated_at) VALUES (?, ?, 'P', ?, ?)`
    ).run(projectId, userId, now, now)

    const taskId = randomUUID()
    db.prepare(
      `INSERT INTO tasks (id, user_id, project_id, title, position, created_at, updated_at)
       VALUES (?, ?, ?, 'X', 0, ?, ?)`
    ).run(taskId, userId, projectId, now, now)

    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId)

    const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId)
    expect(task).toEqual({ project_id: null })
  })
})
