import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDatabase } from '@main/db/init'
import type { Db } from '@main/db/connection'
import { authService } from '@main/services/auth.service'
import { session } from '@main/services/session.service'
import { tasksService } from '@main/services/tasks.service'
import { projectsService } from '@main/services/projects.service'
import { tagsService } from '@main/services/tags.service'
import { subtasksService } from '@main/services/subtasks.service'
import { dashboardService } from '@main/services/dashboard.service'
import { searchService } from '@main/services/search.service'
import { AppErrorCode } from '@shared/errors'
import { memoryStore } from './helpers'

let db: Db
let store: ReturnType<typeof memoryStore>
let aliceId: string
let bobId: string

function daysFromNow(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

async function signInAs(username: string): Promise<void> {
  session.clear()
  await authService.login(db, { username, password: `${username}-password` }, store)
}

beforeEach(async () => {
  db = createTestDatabase()
  store = memoryStore()
  session.clear()

  aliceId = (
    await authService.register(db, {
      username: 'alice',
      displayName: 'Alice',
      password: 'alice-password',
      avatar: null
    })
  ).id
  session.clear()

  bobId = (
    await authService.register(db, {
      username: 'bob',
      displayName: 'Bob',
      password: 'bob-password',
      avatar: null
    })
  ).id
  session.clear()

  await signInAs('alice')
})

afterEach(() => db.close())

describe('tâches — cycle de vie', () => {
  it('crée une tâche avec les valeurs par défaut du schéma', () => {
    const task = tasksService.create(db, { title: '  Réviser la trajectoire  ' })

    expect(task.title).toBe('Réviser la trajectoire') // trim appliqué
    expect(task.status).toBe('TODO')
    expect(task.priority).toBe('MEDIUM')
    expect(task.completedAt).toBeNull()
    expect(task.tags).toEqual([])
    expect(task.subtaskTotal).toBe(0)
  })

  it('refuse une tâche sans titre', () => {
    expect(() => tasksService.create(db, { title: '   ' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )
  })

  it('modifie une tâche', () => {
    const task = tasksService.create(db, { title: 'Brouillon' })
    const updated = tasksService.update(db, {
      id: task.id,
      title: 'Version finale',
      priority: 'CRITICAL'
    })

    expect(updated.title).toBe('Version finale')
    expect(updated.priority).toBe('CRITICAL')
  })

  it('supprime une tâche', () => {
    const task = tasksService.create(db, { title: 'À jeter' })
    tasksService.remove(db, { id: task.id })

    expect(() => tasksService.get(db, { id: task.id })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })
})

describe('invariant statut / date de complétion', () => {
  it('renseigne completedAt en passant à COMPLETED', () => {
    const task = tasksService.create(db, { title: 'Mission' })
    const done = tasksService.update(db, { id: task.id, status: 'COMPLETED' })

    expect(done.completedAt).not.toBeNull()
  })

  it('efface completedAt en repassant à TODO — la tâche est restaurée', () => {
    const task = tasksService.create(db, { title: 'Mission' })
    tasksService.update(db, { id: task.id, status: 'COMPLETED' })
    const restored = tasksService.update(db, { id: task.id, status: 'TODO' })

    expect(restored.status).toBe('TODO')
    expect(restored.completedAt).toBeNull()
  })

  it('conserve la date de complétion d’origine si l’on retermine sans rouvrir', () => {
    const task = tasksService.create(db, { title: 'Mission', status: 'COMPLETED' })
    const first = task.completedAt

    const again = tasksService.update(db, { id: task.id, status: 'COMPLETED', title: 'Mission v2' })
    expect(again.completedAt).toBe(first)
  })

  it('bascule terminé / à faire', () => {
    const task = tasksService.create(db, { title: 'Bascule' })

    const done = tasksService.toggle(db, { id: task.id })
    expect(done.status).toBe('COMPLETED')
    expect(done.completedAt).not.toBeNull()

    const undone = tasksService.toggle(db, { id: task.id })
    expect(undone.status).toBe('TODO')
    expect(undone.completedAt).toBeNull()
  })
})

describe('ordonnancement', () => {
  it('insère une tâche déplacée ENTRE ses voisins, en une seule écriture', () => {
    const first = tasksService.create(db, { title: 'A' })
    const second = tasksService.create(db, { title: 'B' })
    const third = tasksService.create(db, { title: 'C' })

    // On place C entre A et B.
    const moved = tasksService.move(db, { id: third.id, beforeId: first.id, afterId: second.id })

    expect(moved.position).toBeGreaterThan(first.position)
    expect(moved.position).toBeLessThan(second.position)

    // Les voisins n'ont PAS été renumérotés : c'est tout l'intérêt du REAL.
    expect(tasksService.get(db, { id: first.id }).position).toBe(first.position)
    expect(tasksService.get(db, { id: second.id }).position).toBe(second.position)
  })

  it('change de colonne Kanban en respectant l’invariant de complétion', () => {
    const task = tasksService.create(db, { title: 'Glissée' })
    const moved = tasksService.move(db, {
      id: task.id,
      status: 'COMPLETED',
      beforeId: null,
      afterId: null
    })

    expect(moved.status).toBe('COMPLETED')
    expect(moved.completedAt).not.toBeNull()
  })

  it('renvoie les tâches dans l’ordre des positions', () => {
    const a = tasksService.create(db, { title: 'A' })
    tasksService.create(db, { title: 'B' })
    const c = tasksService.create(db, { title: 'C' })

    tasksService.move(db, { id: c.id, beforeId: null, afterId: a.id })
    expect(tasksService.list(db, {}).map((task) => task.title)).toEqual(['C', 'A', 'B'])
  })
})

describe('filtres', () => {
  beforeEach(() => {
    tasksService.create(db, { title: 'Urgente', priority: 'CRITICAL' })
    tasksService.create(db, { title: 'Bloquée', status: 'BLOCKED' })
    tasksService.create(db, { title: 'En retard', dueDate: daysFromNow(-3) })
    tasksService.create(db, { title: 'Plus tard', dueDate: daysFromNow(10) })
    tasksService.create(db, { title: 'Rangée', status: 'ARCHIVED' })
  })

  it('exclut les archivées par défaut', () => {
    expect(tasksService.list(db, {}).map((t) => t.title)).not.toContain('Rangée')
  })

  it('inclut les archivées sur demande', () => {
    expect(tasksService.list(db, { includeArchived: true }).map((t) => t.title)).toContain('Rangée')
  })

  it('filtre par priorité', () => {
    const found = tasksService.list(db, { priorities: ['CRITICAL'] })
    expect(found.map((t) => t.title)).toEqual(['Urgente'])
  })

  it('filtre par statut', () => {
    expect(tasksService.list(db, { statuses: ['BLOCKED'] }).map((t) => t.title)).toEqual(['Bloquée'])
  })

  it('filtre les tâches en retard', () => {
    expect(tasksService.list(db, { overdue: true }).map((t) => t.title)).toEqual(['En retard'])
  })

  it('recherche dans le titre et la description', () => {
    tasksService.create(db, { title: 'Vérifier', description: 'capteur de pression' })
    expect(tasksService.list(db, { search: 'pression' }).map((t) => t.title)).toEqual(['Vérifier'])
  })

  it('traite % comme un caractère littéral dans la recherche', () => {
    tasksService.create(db, { title: 'Charge à 80%' })
    // Sans ESCAPE, « % » ferait correspondre absolument tout.
    expect(tasksService.list(db, { search: '%' }).map((t) => t.title)).toEqual(['Charge à 80%'])
  })
})

describe('tags', () => {
  it('crée un tag et l’associe à une tâche', () => {
    const tag = tagsService.create(db, { name: 'orbite' })
    const task = tasksService.create(db, { title: 'Calcul', tagIds: [tag.id] })

    expect(task.tags.map((t) => t.name)).toEqual(['orbite'])
  })

  it('renvoie le tag existant plutôt que d’échouer sur un doublon', () => {
    const first = tagsService.create(db, { name: 'orbite' })
    const second = tagsService.create(db, { name: 'orbite' })

    expect(second.id).toBe(first.id)
  })

  it('filtre par tag avec une sémantique ET', () => {
    const a = tagsService.create(db, { name: 'alpha' })
    const b = tagsService.create(db, { name: 'beta' })

    tasksService.create(db, { title: 'Les deux', tagIds: [a.id, b.id] })
    tasksService.create(db, { title: 'Un seul', tagIds: [a.id] })

    const found = tasksService.list(db, { tagIds: [a.id, b.id] })
    expect(found.map((t) => t.title)).toEqual(['Les deux'])
  })

  it('supprimer un tag le retire des tâches sans les supprimer', () => {
    const tag = tagsService.create(db, { name: 'temporaire' })
    const task = tasksService.create(db, { title: 'Survivante', tagIds: [tag.id] })

    tagsService.remove(db, { id: tag.id })

    const after = tasksService.get(db, { id: task.id })
    expect(after.tags).toEqual([])
  })

  it('compte les usages', () => {
    const tag = tagsService.create(db, { name: 'compté' })
    tasksService.create(db, { title: 'Une', tagIds: [tag.id] })
    tasksService.create(db, { title: 'Deux', tagIds: [tag.id] })

    expect(tagsService.list(db).find((t) => t.id === tag.id)?.taskCount).toBe(2)
  })
})

describe('projets', () => {
  it('calcule la progression à la lecture', () => {
    const project = projectsService.create(db, { name: 'Programme Ariane' })
    tasksService.create(db, { title: 'Une', projectId: project.id, status: 'COMPLETED' })
    tasksService.create(db, { title: 'Deux', projectId: project.id })

    expect(projectsService.get(db, { id: project.id }).progress).toBe(0.5)
  })

  it('vaut 0 et non NaN pour un projet sans tâche', () => {
    const project = projectsService.create(db, { name: 'Vide' })
    expect(projectsService.get(db, { id: project.id }).progress).toBe(0)
  })

  it('DÉTACHE les tâches à la suppression, sans les détruire', () => {
    const project = projectsService.create(db, { name: 'Abandonné' })
    const task = tasksService.create(db, { title: 'Travail consigné', projectId: project.id })

    projectsService.remove(db, { id: project.id })

    const orphan = tasksService.get(db, { id: task.id })
    expect(orphan.title).toBe('Travail consigné')
    expect(orphan.projectId).toBeNull()
  })

  it('refuse une tâche rattachée à un projet inexistant', () => {
    expect(() =>
      tasksService.create(db, { title: 'X', projectId: '00000000-0000-4000-8000-000000000000' })
    ).toThrow(expect.objectContaining({ code: AppErrorCode.NOT_FOUND }))
  })
})

describe('sous-tâches', () => {
  it('ajoute des sous-tâches et compte l’avancement', () => {
    const task = tasksService.create(db, { title: 'Séquence' })
    subtasksService.create(db, { taskId: task.id, title: 'Étape 1' })
    const withTwo = subtasksService.create(db, { taskId: task.id, title: 'Étape 2' })

    expect(withTwo.subtaskTotal).toBe(2)
    expect(withTwo.subtaskDone).toBe(0)

    const first = withTwo.subtasks[0]
    expect(first).toBeDefined()
    const updated = subtasksService.update(db, { id: first!.id, completed: true })
    expect(updated.subtaskDone).toBe(1)
  })

  it('réordonne les sous-tâches', () => {
    const task = tasksService.create(db, { title: 'Séquence' })
    subtasksService.create(db, { taskId: task.id, title: 'A' })
    const withBoth = subtasksService.create(db, { taskId: task.id, title: 'B' })

    const ids = withBoth.subtasks.map((s) => s.id).reverse()
    const reordered = subtasksService.reorder(db, { taskId: task.id, orderedIds: ids })

    expect(reordered.subtasks.map((s) => s.title)).toEqual(['B', 'A'])
  })
})

describe('tableau de bord', () => {
  it('sépare les retards, le jour et les prioritaires sans doublon', () => {
    tasksService.create(db, { title: 'Retard', dueDate: daysFromNow(-2) })
    tasksService.create(db, { title: 'Prioritaire', priority: 'CRITICAL' })
    tasksService.create(db, { title: 'Plus tard', dueDate: daysFromNow(5) })

    const board = dashboardService.load(db)

    expect(board.overdue.map((t) => t.title)).toEqual(['Retard'])
    expect(board.priority.map((t) => t.title)).toEqual(['Prioritaire'])
    expect(board.upcoming.map((t) => t.title)).toEqual(['Plus tard'])
  })

  it('calcule un taux de complétion qui ignore les archivées', () => {
    tasksService.create(db, { title: 'Faite', status: 'COMPLETED' })
    tasksService.create(db, { title: 'À faire' })
    tasksService.create(db, { title: 'Rangée', status: 'ARCHIVED' })

    const { stats } = dashboardService.load(db)
    expect(stats.total).toBe(2)
    expect(stats.completionRate).toBe(0.5)
  })
})

describe('recherche globale', () => {
  it('ne renvoie rien pour une requête vide', () => {
    tasksService.create(db, { title: 'Quelque chose' })
    expect(searchService.run(db, { query: '' })).toEqual({ tasks: [], projects: [], tags: [] })
  })

  it('trouve tâches, projets et tags', () => {
    tasksService.create(db, { title: 'Orbite basse' })
    projectsService.create(db, { name: 'Orbite géostationnaire' })
    tagsService.create(db, { name: 'orbite' })

    const results = searchService.run(db, { query: 'orbite' })
    expect(results.tasks).toHaveLength(1)
    expect(results.projects).toHaveLength(1)
    expect(results.tags).toHaveLength(1)
  })
})

describe('isolation entre utilisateurs', () => {
  it('Bob ne voit aucune tâche d’Alice', async () => {
    tasksService.create(db, { title: 'Secret Alice' })
    await signInAs('bob')

    expect(tasksService.list(db, {})).toEqual([])
  })

  it('Bob ne peut pas lire une tâche d’Alice par son identifiant', async () => {
    const task = tasksService.create(db, { title: 'Secret Alice' })
    await signInAs('bob')

    expect(() => tasksService.get(db, { id: task.id })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('Bob ne peut ni modifier ni supprimer une tâche d’Alice', async () => {
    const task = tasksService.create(db, { title: 'Secret Alice' })
    await signInAs('bob')

    expect(() => tasksService.update(db, { id: task.id, title: 'Détourné' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
    expect(() => tasksService.remove(db, { id: task.id })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('Bob ne peut pas rattacher sa tâche à un projet d’Alice', async () => {
    const project = projectsService.create(db, { name: 'Projet Alice' })
    await signInAs('bob')

    expect(() => tasksService.create(db, { title: 'Intrusion', projectId: project.id })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('Bob ne peut pas poser un tag d’Alice sur sa propre tâche', async () => {
    const tag = tagsService.create(db, { name: 'privé' })
    await signInAs('bob')

    expect(() => tasksService.create(db, { title: 'Intrusion', tagIds: [tag.id] })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('Bob ne peut pas ajouter de sous-tâche à une tâche d’Alice', async () => {
    const task = tasksService.create(db, { title: 'Secret Alice' })
    await signInAs('bob')

    expect(() => subtasksService.create(db, { taskId: task.id, title: 'Intrusion' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('la recherche de Bob ne remonte jamais les données d’Alice', async () => {
    tasksService.create(db, { title: 'Trajectoire Alice' })
    projectsService.create(db, { name: 'Trajectoire projet' })
    await signInAs('bob')

    const results = searchService.run(db, { query: 'trajectoire' })
    expect(results.tasks).toEqual([])
    expect(results.projects).toEqual([])
  })

  it('les identifiants d’Alice et Bob sont bien distincts', () => {
    expect(aliceId).not.toBe(bobId)
  })
})
