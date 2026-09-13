import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Db } from '@main/db/connection'
import { createTestAccountsDb, createTestVaultDb } from '@main/db/init'
import { migrate, currentVersion } from '@main/db/migrator'
import { accountMigrations } from '@main/db/migrations/accounts'
import { vaultMigrations } from '@main/db/migrations/vault'

let accounts: Db
let vault: Db

beforeEach(() => {
  accounts = createTestAccountsDb()
  vault = createTestVaultDb()
})

afterEach(() => {
  accounts.close()
  vault.close()
})

describe('migrations', () => {
  it('porte chaque base à sa dernière version', () => {
    expect(currentVersion(accounts)).toBe(Math.max(...accountMigrations.map((m) => m.version)))
    expect(currentVersion(vault)).toBe(Math.max(...vaultMigrations.map((m) => m.version)))
  })

  it('est idempotent : rejouer n’applique rien', () => {
    expect(migrate(accounts, accountMigrations)).toBe(0)
    expect(migrate(vault, vaultMigrations)).toBe(0)
  })

  it('sépare strictement les comptes des données', () => {
    const tablesOf = (db: Db): string[] =>
      (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
          )
          .all() as { name: string }[]
      )
        .map((row) => row.name)
        .sort()

    // La base des comptes ne contient AUCUNE donnée métier : quiconque la lit
    // apprend qui a un compte sur la machine, et rien d'autre (ADR-007).
    expect(tablesOf(accounts)).toEqual(['remembered_sessions', 'users'])

    expect(tablesOf(vault)).toEqual([
      'chat_messages',
      'goals',
      'projects',
      'settings',
      'subtasks',
      'tags',
      'task_comments',
      'task_tags',
      'tasks'
    ])
  })

  it('crée les index du coffre, préfixés par user_id', () => {
    const rows = vault
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
      .all() as { name: string }[]

    expect(rows.length).toBeGreaterThanOrEqual(9)
    expect(rows.map((row) => row.name)).toContain('idx_tasks_user_status')
  })
})

describe('pragmas', () => {
  it('active les clés étrangères sur les DEUX bases', () => {
    // Sans ce PRAGMA, toutes les cascades seraient silencieusement inopérantes.
    expect(accounts.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(vault.pragma('foreign_keys', { simple: true })).toBe(1)
  })
})

describe('contraintes du schéma', () => {
  const now = new Date().toISOString()
  const userId = randomUUID()

  it('refuse un statut de tâche inconnu', () => {
    expect(() =>
      vault
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
    expect(() =>
      vault
        .prepare(
          `INSERT INTO tasks (id, user_id, title, status, position, created_at, updated_at)
           VALUES (?, ?, 'X', 'COMPLETED', 0, ?, ?)`
        )
        .run(randomUUID(), userId, now, now)
    ).toThrow(/CHECK constraint/i)
  })

  it('une tâche démarre à 0 % d’avancement et refuse une valeur hors bornes', () => {
    const id = randomUUID()
    vault
      .prepare(
        `INSERT INTO tasks (id, user_id, title, position, created_at, updated_at)
         VALUES (?, ?, 'X', 0, ?, ?)`
      )
      .run(id, userId, now, now)

    const row = vault.prepare('SELECT progress FROM tasks WHERE id = ?').get(id) as {
      progress: number
    }
    expect(row.progress).toBe(0)

    expect(() => vault.prepare('UPDATE tasks SET progress = 101 WHERE id = ?').run(id)).toThrow(
      /CHECK constraint/i
    )
  })

  it('détache les tâches quand leur projet est supprimé, sans les détruire', () => {
    const projectId = randomUUID()
    vault
      .prepare(
        `INSERT INTO projects (id, user_id, name, created_at, updated_at) VALUES (?, ?, 'P', ?, ?)`
      )
      .run(projectId, userId, now, now)

    const taskId = randomUUID()
    vault
      .prepare(
        `INSERT INTO tasks (id, user_id, project_id, title, position, created_at, updated_at)
         VALUES (?, ?, ?, 'X', 0, ?, ?)`
      )
      .run(taskId, userId, projectId, now, now)

    vault.prepare('DELETE FROM projects WHERE id = ?').run(projectId)

    expect(vault.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId)).toEqual({
      project_id: null
    })
  })

  it('supprimer un compte efface ses sessions mémorisées', () => {
    const id = randomUUID()
    accounts
      .prepare(
        `INSERT INTO users (id, username, display_name, password_hash, kdf_salt, dek_password,
                            recovery_salt, dek_recovery, created_at, updated_at)
         VALUES (?, 'u', 'U', 'scrypt$x', x'00', x'00', x'00', x'00', ?, ?)`
      )
      .run(id, now, now)

    accounts
      .prepare(
        `INSERT INTO remembered_sessions (id, user_id, token_hash, created_at, expires_at)
         VALUES (?, ?, 'hash', ?, ?)`
      )
      .run(randomUUID(), id, now, now)

    accounts.prepare('DELETE FROM users WHERE id = ?').run(id)
    expect(accounts.prepare('SELECT COUNT(*) AS n FROM remembered_sessions').get()).toEqual({
      n: 0
    })
  })
})
