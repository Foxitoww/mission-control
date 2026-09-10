import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Db } from '@main/db/connection'
import { tasksService } from '@main/services/tasks.service'
import { commentsService } from '@main/services/comments.service'
import { AppErrorCode } from '@shared/errors'
import { createTestEnv, seedUser, signIn, type TestEnv } from './helpers'

let env: TestEnv
let db: Db
let aliceId: string
let bobId: string

beforeEach(() => {
  env = createTestEnv()
  db = env.vault

  // Coffre partagé : c'est le filtrage par tâche parente qu'on éprouve ici,
  // pas la séparation des fichiers (voir helpers.ts).
  aliceId = seedUser(env, 'alice')
  bobId = seedUser(env, 'bob')
  signIn(env, aliceId)
})

afterEach(() => env.close())

describe('commentaires — cycle de vie', () => {
  it('ajoute un message et renvoie le fil complet, du plus ancien au plus récent', () => {
    const task = tasksService.create(db, { title: 'Corriger la trajectoire' })

    const afterFirst = commentsService.create(db, { taskId: task.id, body: 'Premier point de blocage' })
    expect(afterFirst).toHaveLength(1)
    expect(afterFirst[0]?.body).toBe('Premier point de blocage')
    expect(afterFirst[0]?.edited).toBe(false)

    const afterSecond = commentsService.create(db, { taskId: task.id, body: 'Piste de résolution' })
    expect(afterSecond.map((c) => c.body)).toEqual(['Premier point de blocage', 'Piste de résolution'])
  })

  it('liste les messages d’une tâche', () => {
    const task = tasksService.create(db, { title: 'Séquence' })
    commentsService.create(db, { taskId: task.id, body: 'A' })
    commentsService.create(db, { taskId: task.id, body: 'B' })

    expect(commentsService.list(db, { taskId: task.id }).map((c) => c.body)).toEqual(['A', 'B'])
  })

  it('trim le corps et refuse un message vide', () => {
    const task = tasksService.create(db, { title: 'Tâche' })

    const thread = commentsService.create(db, { taskId: task.id, body: '  garde-moi  ' })
    expect(thread[0]?.body).toBe('garde-moi')

    expect(() => commentsService.create(db, { taskId: task.id, body: '   ' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )
  })

  it('refuse un message de plus de 4 000 caractères', () => {
    const task = tasksService.create(db, { title: 'Tâche' })

    expect(() =>
      commentsService.create(db, { taskId: task.id, body: 'x'.repeat(4001) })
    ).toThrow(expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED }))
  })

  it('marque un message comme modifié, définitivement', () => {
    const task = tasksService.create(db, { title: 'Tâche' })
    const created = commentsService.create(db, { taskId: task.id, body: 'version 1' })
    const id = created[0]!.id

    const edited = commentsService.update(db, { id, body: 'version 2' })
    expect(edited[0]?.body).toBe('version 2')
    expect(edited[0]?.edited).toBe(true)

    // Une seconde retouche ne « dé-marque » pas le message.
    const again = commentsService.update(db, { id, body: 'version 3' })
    expect(again[0]?.edited).toBe(true)
  })

  it('supprime un message et renvoie le fil restant', () => {
    const task = tasksService.create(db, { title: 'Tâche' })
    const thread = commentsService.create(db, { taskId: task.id, body: 'à garder' })
    commentsService.create(db, { taskId: task.id, body: 'à retirer' })
    const toRemove = commentsService.list(db, { taskId: task.id })[1]!

    const remaining = commentsService.remove(db, { id: toRemove.id })
    expect(remaining.map((c) => c.body)).toEqual(['à garder'])
    void thread
  })
})

describe('commentaires — compteur sur la tâche', () => {
  it('expose commentCount dans la liste des tâches', () => {
    const task = tasksService.create(db, { title: 'Tâche' })
    expect(tasksService.list(db, {})[0]?.commentCount).toBe(0)

    commentsService.create(db, { taskId: task.id, body: 'un' })
    commentsService.create(db, { taskId: task.id, body: 'deux' })
    expect(tasksService.list(db, {})[0]?.commentCount).toBe(2)

    const id = commentsService.list(db, { taskId: task.id })[0]!.id
    commentsService.remove(db, { id })
    expect(tasksService.list(db, {})[0]?.commentCount).toBe(1)
  })
})

describe('commentaires — suppression en cascade', () => {
  it('supprime les messages quand la tâche parente disparaît', () => {
    const task = tasksService.create(db, { title: 'Éphémère' })
    commentsService.create(db, { taskId: task.id, body: 'orphelin en devenir' })

    tasksService.remove(db, { id: task.id })

    const rows = db
      .prepare('SELECT COUNT(*) AS n FROM task_comments WHERE task_id = ?')
      .get(task.id) as { n: number }
    expect(rows.n).toBe(0)
  })
})

describe('commentaires — isolation entre utilisateurs', () => {
  it('Bob ne peut pas lister le fil d’une tâche d’Alice', () => {
    const task = tasksService.create(db, { title: 'Secret Alice' })
    commentsService.create(db, { taskId: task.id, body: 'note privée' })
    signIn(env, bobId)

    expect(() => commentsService.list(db, { taskId: task.id })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('Bob ne peut pas commenter une tâche d’Alice', () => {
    const task = tasksService.create(db, { title: 'Secret Alice' })
    signIn(env, bobId)

    expect(() => commentsService.create(db, { taskId: task.id, body: 'Intrusion' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('Bob ne peut ni modifier ni supprimer un message d’Alice', () => {
    const task = tasksService.create(db, { title: 'Secret Alice' })
    const id = commentsService.create(db, { taskId: task.id, body: 'à moi' })[0]!.id
    signIn(env, bobId)

    expect(() => commentsService.update(db, { id, body: 'détourné' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
    expect(() => commentsService.remove(db, { id })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })
})
