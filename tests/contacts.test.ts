import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Db } from '@main/db/connection'
import { contactsService } from '@main/services/contacts.service'
import { projectsService } from '@main/services/projects.service'
import { AppErrorCode } from '@shared/errors'
import { createTestEnv, seedUser, signIn, type TestEnv } from './helpers'

let env: TestEnv
let db: Db
let aliceId: string
let bobId: string

beforeEach(() => {
  env = createTestEnv()
  db = env.vault

  // Coffre partagé (voir helpers.ts) : ce qu'on éprouve ici est le filtre
  // `WHERE user_id = ?`, pas la séparation des fichiers.
  aliceId = seedUser(env, 'alice')
  bobId = seedUser(env, 'bob')
  signIn(env, aliceId)
})

afterEach(() => env.close())

describe('contacts — cycle de vie', () => {
  it('crée un contact et le relit avec ses valeurs par défaut', () => {
    const contact = contactsService.create(db, { name: 'Amélie Dev' })
    expect(contact.name).toBe('Amélie Dev')
    expect(contact.email).toBeNull()
    expect(contact.phone).toBeNull()
    expect(contact.company).toBeNull()
    expect(contact.notes).toBeNull()
    expect(contact.projects).toEqual([])
  })

  it('liste les contacts par ordre alphabétique, insensible à la casse', () => {
    contactsService.create(db, { name: 'zoé' })
    contactsService.create(db, { name: 'Amélie' })
    contactsService.create(db, { name: 'bruno' })

    expect(contactsService.list(db).map((c) => c.name)).toEqual(['Amélie', 'bruno', 'zoé'])
  })

  it('met à jour les champs fournis, laisse les autres intacts', () => {
    const created = contactsService.create(db, { name: 'Amélie', company: 'Nova' })
    const updated = contactsService.update(db, { id: created.id, phone: '0600000000' })

    expect(updated.name).toBe('Amélie')
    expect(updated.company).toBe('Nova')
    expect(updated.phone).toBe('0600000000')
  })

  it('supprime un contact', () => {
    const created = contactsService.create(db, { name: 'À supprimer' })
    contactsService.remove(db, { id: created.id })

    expect(contactsService.list(db)).toEqual([])
    expect(() => contactsService.get(db, { id: created.id })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('refuse un nom vide', () => {
    expect(() => contactsService.create(db, { name: '   ' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )
  })

  it('refuse une adresse mail mal formée, mais accepte son absence', () => {
    expect(() => contactsService.create(db, { name: 'X', email: 'pas-un-mail' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )
    expect(() => contactsService.create(db, { name: 'X', email: null })).not.toThrow()
  })

  it('modifier un contact inexistant échoue', () => {
    expect(() =>
      contactsService.update(db, { id: '00000000-0000-0000-0000-000000000000', name: 'X' })
    ).toThrow(expect.objectContaining({ code: AppErrorCode.NOT_FOUND }))
  })
})

describe('contacts — liaison aux projets', () => {
  it('lie un contact à un projet dès sa création, et le rend cliquable', () => {
    const project = projectsService.create(db, { name: 'Nova Client' })
    const contact = contactsService.create(db, { name: 'Amélie', projectIds: [project.id] })

    expect(contact.projects).toEqual([
      { id: project.id, name: 'Nova Client', color: project.color }
    ])
  })

  it('remplace entièrement les projets liés à la mise à jour', () => {
    const projectA = projectsService.create(db, { name: 'A' })
    const projectB = projectsService.create(db, { name: 'B' })
    const contact = contactsService.create(db, { name: 'Amélie', projectIds: [projectA.id] })

    const updated = contactsService.update(db, { id: contact.id, projectIds: [projectB.id] })
    expect(updated.projects.map((p) => p.id)).toEqual([projectB.id])
  })

  it('vider la liste de projets détache le contact de tous', () => {
    const project = projectsService.create(db, { name: 'A' })
    const contact = contactsService.create(db, { name: 'Amélie', projectIds: [project.id] })

    const updated = contactsService.update(db, { id: contact.id, projectIds: [] })
    expect(updated.projects).toEqual([])
  })

  it("refuse de lier un projet qui n'appartient pas à l'utilisateur courant", () => {
    signIn(env, bobId)
    const bobsProject = projectsService.create(db, { name: 'Projet de Bob' })

    signIn(env, aliceId)
    expect(() =>
      contactsService.create(db, { name: 'Amélie', projectIds: [bobsProject.id] })
    ).toThrow(expect.objectContaining({ code: AppErrorCode.NOT_FOUND }))
  })

  it('supprimer un projet détache ses contacts sans les supprimer', () => {
    const project = projectsService.create(db, { name: 'Éphémère' })
    const contact = contactsService.create(db, { name: 'Amélie', projectIds: [project.id] })

    projectsService.remove(db, { id: project.id })

    const stillThere = contactsService.get(db, { id: contact.id })
    expect(stillThere.projects).toEqual([])
  })
})

describe('contacts — isolation entre comptes', () => {
  it('un contact créé par Alice est invisible pour Bob', () => {
    contactsService.create(db, { name: 'Contact d’Alice' })

    signIn(env, bobId)
    expect(contactsService.list(db)).toEqual([])
  })

  it('Bob ne peut ni lire, ni modifier, ni supprimer un contact d’Alice', () => {
    const created = contactsService.create(db, { name: 'Contact d’Alice' })

    signIn(env, bobId)
    expect(() => contactsService.get(db, { id: created.id })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
    expect(() => contactsService.update(db, { id: created.id, name: 'Détourné' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
    expect(() => contactsService.remove(db, { id: created.id })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })
})
