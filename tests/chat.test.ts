import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Db } from '@main/db/connection'
import { projectsService } from '@main/services/projects.service'
import { chatService } from '@main/services/chat.service'
import { AppErrorCode } from '@shared/errors'
import { createTestEnv, seedUser, signIn, type TestEnv } from './helpers'

let env: TestEnv
let db: Db
let aliceId: string
let bobId: string

beforeEach(() => {
  env = createTestEnv()
  db = env.vault

  // Coffre partagé : c'est le filtrage par app parente qu'on éprouve ici, pas
  // la séparation des fichiers (voir helpers.ts).
  aliceId = seedUser(env, 'alice')
  bobId = seedUser(env, 'bob')
  signIn(env, aliceId)
})

afterEach(() => env.close())

describe('chat général — cycle de vie', () => {
  it('ajoute un message et renvoie le fil complet, du plus ancien au plus récent', () => {
    const project = projectsService.create(db, { name: 'Nova Client' })

    const afterFirst = chatService.create(db, {
      projectId: project.id,
      body: 'On démarre le sprint'
    })
    expect(afterFirst).toHaveLength(1)
    expect(afterFirst[0]?.body).toBe('On démarre le sprint')
    expect(afterFirst[0]?.edited).toBe(false)
    expect(afterFirst[0]?.reaction).toBeNull()

    const afterSecond = chatService.create(db, { projectId: project.id, body: 'Merge fait' })
    expect(afterSecond.map((m) => m.body)).toEqual(['On démarre le sprint', 'Merge fait'])
  })

  it('liste les messages d’une app', () => {
    const project = projectsService.create(db, { name: 'App' })
    chatService.create(db, { projectId: project.id, body: 'A' })
    chatService.create(db, { projectId: project.id, body: 'B' })

    expect(chatService.list(db, { projectId: project.id }).map((m) => m.body)).toEqual(['A', 'B'])
  })

  it('trim le corps et refuse un message vide', () => {
    const project = projectsService.create(db, { name: 'App' })

    const thread = chatService.create(db, { projectId: project.id, body: '  garde-moi  ' })
    expect(thread[0]?.body).toBe('garde-moi')

    expect(() => chatService.create(db, { projectId: project.id, body: '   ' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )
  })

  it('refuse un message de plus de 4 000 caractères', () => {
    const project = projectsService.create(db, { name: 'App' })

    expect(() => chatService.create(db, { projectId: project.id, body: 'x'.repeat(4001) })).toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )
  })

  it('marque un message comme modifié, définitivement, sans toucher sa réaction', () => {
    const project = projectsService.create(db, { name: 'App' })
    const created = chatService.create(db, { projectId: project.id, body: 'version 1' })
    const id = created[0]!.id
    chatService.react(db, { id, reaction: '👍' })

    const edited = chatService.update(db, { id, body: 'version 2' })
    expect(edited[0]?.body).toBe('version 2')
    expect(edited[0]?.edited).toBe(true)
    expect(edited[0]?.reaction).toBe('👍')

    // Une seconde retouche ne « dé-marque » pas le message.
    const again = chatService.update(db, { id, body: 'version 3' })
    expect(again[0]?.edited).toBe(true)
  })

  it('supprime un message et renvoie le fil restant', () => {
    const project = projectsService.create(db, { name: 'App' })
    chatService.create(db, { projectId: project.id, body: 'à garder' })
    chatService.create(db, { projectId: project.id, body: 'à retirer' })
    const toRemove = chatService.list(db, { projectId: project.id })[1]!

    const remaining = chatService.remove(db, { id: toRemove.id })
    expect(remaining.map((m) => m.body)).toEqual(['à garder'])
  })
})

describe('chat général — réactions', () => {
  it('pose une réaction parmi la palette autorisée', () => {
    const project = projectsService.create(db, { name: 'App' })
    const id = chatService.create(db, { projectId: project.id, body: 'Bien joué' })[0]!.id

    const reacted = chatService.react(db, { id, reaction: '❤️' })
    expect(reacted[0]?.reaction).toBe('❤️')
  })

  it('changer de réaction REMPLACE l’ancienne, jamais un cumul', () => {
    const project = projectsService.create(db, { name: 'App' })
    const id = chatService.create(db, { projectId: project.id, body: 'Bien joué' })[0]!.id

    chatService.react(db, { id, reaction: '👍' })
    const changed = chatService.react(db, { id, reaction: '😂' })

    expect(changed[0]?.reaction).toBe('😂')
  })

  it('retire la réaction avec reaction: null', () => {
    const project = projectsService.create(db, { name: 'App' })
    const id = chatService.create(db, { projectId: project.id, body: 'Bien joué' })[0]!.id

    chatService.react(db, { id, reaction: '👍' })
    const cleared = chatService.react(db, { id, reaction: null })

    expect(cleared[0]?.reaction).toBeNull()
  })

  it('refuse une réaction hors de la palette des trois autorisées', () => {
    const project = projectsService.create(db, { name: 'App' })
    const id = chatService.create(db, { projectId: project.id, body: 'Bien joué' })[0]!.id

    expect(() => chatService.react(db, { id, reaction: '🔥' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )
  })
})

describe('chat général — suppression en cascade', () => {
  it('supprime les messages quand l’app parente disparaît', () => {
    const project = projectsService.create(db, { name: 'Éphémère' })
    chatService.create(db, { projectId: project.id, body: 'orphelin en devenir' })

    projectsService.remove(db, { id: project.id })

    const rows = db
      .prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE project_id = ?')
      .get(project.id) as { n: number }
    expect(rows.n).toBe(0)
  })
})

describe('chat général — isolation entre utilisateurs', () => {
  it('Bob ne peut pas lister le chat d’une app d’Alice', () => {
    const project = projectsService.create(db, { name: 'Secret Alice' })
    chatService.create(db, { projectId: project.id, body: 'note privée' })
    signIn(env, bobId)

    expect(() => chatService.list(db, { projectId: project.id })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('Bob ne peut pas écrire dans le chat d’une app d’Alice', () => {
    const project = projectsService.create(db, { name: 'Secret Alice' })
    signIn(env, bobId)

    expect(() => chatService.create(db, { projectId: project.id, body: 'Intrusion' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('Bob ne peut ni modifier, ni réagir, ni supprimer un message d’Alice', () => {
    const project = projectsService.create(db, { name: 'Secret Alice' })
    const id = chatService.create(db, { projectId: project.id, body: 'à moi' })[0]!.id
    signIn(env, bobId)

    expect(() => chatService.update(db, { id, body: 'détourné' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
    expect(() => chatService.react(db, { id, reaction: '👍' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
    expect(() => chatService.remove(db, { id })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })
})
