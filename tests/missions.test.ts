import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Db } from '@main/db/connection'
import { tasksService } from '@main/services/tasks.service'
import { projectsService } from '@main/services/projects.service'
import { tagsService } from '@main/services/tags.service'
import { subtasksService } from '@main/services/subtasks.service'
import { chatService } from '@main/services/chat.service'
import { dashboardService } from '@main/services/dashboard.service'
import { searchService } from '@main/services/search.service'
import { AppErrorCode } from '@shared/errors'
import { createTestEnv, seedUser, signIn, type TestEnv } from './helpers'

let env: TestEnv
/** Le coffre : c'est lui que reçoivent tous les services du domaine. */
let db: Db
let aliceId: string
let bobId: string

function daysFromNow(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

/**
 * Assure un `created_at` strictement postérieur au prochain appel.
 *
 * Les horodatages du service sont des `Date.toISOString()` — résolution
 * milliseconde. Deux écritures synchrones consécutives dans un test peuvent
 * tomber sur la MÊME milliseconde, ce que « nouveau depuis la dernière
 * consultation » (comparaison stricte `>`) ne peut alors pas distinguer. Un
 * humain qui clique n'est jamais infra-milliseconde ; seul un test l'est.
 */
function tick(ms = 2): void {
  const until = Date.now() + ms
  while (Date.now() < until) {
    /* attente active : le test est synchrone. */
  }
}

beforeEach(() => {
  env = createTestEnv()
  db = env.vault

  // Alice et Bob partagent DÉLIBÉRÉMENT le même coffre de test : c'est ainsi
  // que les tests d'isolation éprouvent le filtrage par user_id, et non la
  // simple séparation des fichiers qui existe en production.
  aliceId = seedUser(env, 'alice')
  bobId = seedUser(env, 'bob')
  signIn(env, aliceId)
})

afterEach(() => env.close())

describe('tâches — cycle de vie', () => {
  it('crée une tâche avec les valeurs par défaut du schéma', () => {
    const task = tasksService.create(db, { title: '  Réviser la trajectoire  ' })

    expect(task.title).toBe('Réviser la trajectoire') // trim appliqué
    expect(task.status).toBe('TODO')
    expect(task.priority).toBe('MEDIUM')
    expect(task.completedAt).toBeNull()
    expect(task.progress).toBe(0)
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

describe('invariant statut / avancement (un seul sens)', () => {
  it('un statut explicite fixe l’avancement à ses bornes', () => {
    const task = tasksService.create(db, { title: 'Mission' })

    const done = tasksService.update(db, { id: task.id, status: 'COMPLETED' })
    expect(done.progress).toBe(100)

    const restored = tasksService.update(db, { id: task.id, status: 'TODO' })
    expect(restored.progress).toBe(0)
  })

  it('« en cours » et « bloquée » laissent l’avancement où il était', () => {
    const task = tasksService.create(db, { title: 'Mission' })
    tasksService.update(db, { id: task.id, progress: 42 })

    const progressing = tasksService.update(db, { id: task.id, status: 'IN_PROGRESS' })
    expect(progressing.progress).toBe(42)

    const blocked = tasksService.update(db, { id: task.id, status: 'BLOCKED' })
    expect(blocked.progress).toBe(42)
  })

  it('glisser l’avancement à une borne ne termine plus la tâche automatiquement', () => {
    const task = tasksService.create(db, { title: 'Mission' })

    const atHundred = tasksService.update(db, { id: task.id, progress: 100 })
    expect(atHundred.progress).toBe(100)
    expect(atHundred.status).toBe('TODO')
    expect(atHundred.completedAt).toBeNull()

    const backToZero = tasksService.update(db, { id: task.id, progress: 0 })
    expect(backToZero.progress).toBe(0)
    expect(backToZero.status).toBe('TODO')
  })

  it('un avancement intermédiaire ne déplace jamais une tâche entre les colonnes', () => {
    const task = tasksService.create(db, { title: 'Mission' })
    tasksService.update(db, { id: task.id, status: 'BLOCKED' })

    const stillBlocked = tasksService.update(db, { id: task.id, progress: 55 })
    expect(stillBlocked.status).toBe('BLOCKED')
    expect(stillBlocked.progress).toBe(55)
  })

  it('le bouton Terminer/Rouvrir (toggle) reste le geste explicite qui synchronise l’avancement', () => {
    const task = tasksService.create(db, { title: 'Bascule' })

    const done = tasksService.toggle(db, { id: task.id })
    expect(done.progress).toBe(100)

    const undone = tasksService.toggle(db, { id: task.id })
    expect(undone.progress).toBe(0)
  })

  it('un déplacement Kanban explicite synchronise l’avancement', () => {
    const task = tasksService.create(db, { title: 'Séquence' })
    tasksService.update(db, { id: task.id, progress: 70 })

    const moved = tasksService.move(db, { id: task.id, status: 'COMPLETED' })
    expect(moved.progress).toBe(100)
  })
})

describe('avancement dérivé des sous-tâches', () => {
  it('se recalcule à la création, à la case cochée et à la suppression d’une sous-tâche', () => {
    const task = tasksService.create(db, { title: 'Avec sous-tâches' })

    const withOne = subtasksService.create(db, { taskId: task.id, title: 'Étape 1' })
    expect(withOne.progress).toBe(0) // 0/1

    const withTwo = subtasksService.create(db, { taskId: task.id, title: 'Étape 2' })
    expect(withTwo.progress).toBe(0) // 0/2

    const firstId = withTwo.subtasks[0]!.id
    const oneDone = subtasksService.update(db, { id: firstId, completed: true })
    expect(oneDone.progress).toBe(50) // 1/2

    const secondId = withTwo.subtasks[1]!.id
    const bothDone = subtasksService.update(db, { id: secondId, completed: true })
    expect(bothDone.progress).toBe(100) // 2/2

    const afterRemove = subtasksService.remove(db, { id: firstId })
    expect(afterRemove.progress).toBe(100) // 1/1 restante, cochée
  })

  it('un avancement manuel est ignoré tant qu’une sous-tâche existe', () => {
    const task = tasksService.create(db, { title: 'Avec sous-tâches' })
    subtasksService.create(db, { taskId: task.id, title: 'Étape unique' })

    const attempted = tasksService.update(db, { id: task.id, progress: 77 })
    expect(attempted.progress).toBe(0) // toujours dérivé (0/1), le 77 est ignoré
  })

  it('marquer terminée force 100 % même si des sous-tâches restent à cocher', () => {
    const task = tasksService.create(db, { title: 'Avec sous-tâches' })
    subtasksService.create(db, { taskId: task.id, title: 'Faite' })
    const second = subtasksService.create(db, { taskId: task.id, title: 'Pas faite' })
    subtasksService.update(db, { id: second.subtasks[0]!.id, completed: true })

    const done = tasksService.toggle(db, { id: task.id })
    expect(done.status).toBe('COMPLETED')
    expect(done.progress).toBe(100)
  })

  it('une tâche sans sous-tâche garde son avancement manuel après leur suppression', () => {
    const task = tasksService.create(db, { title: 'Redevient manuelle' })
    const created = subtasksService.create(db, { taskId: task.id, title: 'Seule' })
    subtasksService.update(db, { id: created.subtasks[0]!.id, completed: true })

    const afterRemove = subtasksService.remove(db, { id: created.subtasks[0]!.id })
    expect(afterRemove.subtaskTotal).toBe(0)
    expect(afterRemove.progress).toBe(100) // ne saute pas à 0 sans raison

    const manual = tasksService.update(db, { id: task.id, progress: 40 })
    expect(manual.progress).toBe(40) // de nouveau modifiable
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
    expect(tasksService.list(db, { statuses: ['BLOCKED'] }).map((t) => t.title)).toEqual([
      'Bloquée'
    ])
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

describe('pastilles « nouveau » (tâches et chat)', () => {
  it('une app neuve sans activité n’a aucune pastille', () => {
    const project = projectsService.create(db, { name: 'Neuve' })
    expect(project.hasNewTasks).toBe(false)
    expect(project.hasUnreadChat).toBe(false)
  })

  it('une tâche ajoutée allume la pastille tant que le tableau n’est pas revisité', () => {
    const project = projectsService.create(db, { name: 'App' })
    tasksService.create(db, { title: 'Fraîche', projectId: project.id })

    expect(projectsService.get(db, { id: project.id }).hasNewTasks).toBe(true)

    const seen = projectsService.markTasksSeen(db, { id: project.id })
    expect(seen.hasNewTasks).toBe(false)

    tick() // garantit un created_at strictement postérieur à tasks_seen_at
    tasksService.create(db, { title: 'Encore une', projectId: project.id })
    expect(projectsService.get(db, { id: project.id }).hasNewTasks).toBe(true)
  })

  it('un message de chat allume sa PROPRE pastille, indépendante de celle des tâches', () => {
    const project = projectsService.create(db, { name: 'App' })
    tasksService.create(db, { title: 'Tâche', projectId: project.id })
    projectsService.markTasksSeen(db, { id: project.id })

    chatService.create(db, { projectId: project.id, body: 'Salut' })

    const after = projectsService.get(db, { id: project.id })
    expect(after.hasNewTasks).toBe(false) // toujours éteinte
    expect(after.hasUnreadChat).toBe(true) // nouvelle, elle

    const seen = projectsService.markChatSeen(db, { id: project.id })
    expect(seen.hasUnreadChat).toBe(false)
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
    signIn(env, bobId)

    expect(tasksService.list(db, {})).toEqual([])
  })

  it('Bob ne peut pas lire une tâche d’Alice par son identifiant', async () => {
    const task = tasksService.create(db, { title: 'Secret Alice' })
    signIn(env, bobId)

    expect(() => tasksService.get(db, { id: task.id })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('Bob ne peut ni modifier ni supprimer une tâche d’Alice', async () => {
    const task = tasksService.create(db, { title: 'Secret Alice' })
    signIn(env, bobId)

    expect(() => tasksService.update(db, { id: task.id, title: 'Détourné' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
    expect(() => tasksService.remove(db, { id: task.id })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('Bob ne peut pas rattacher sa tâche à un projet d’Alice', async () => {
    const project = projectsService.create(db, { name: 'Projet Alice' })
    signIn(env, bobId)

    expect(() => tasksService.create(db, { title: 'Intrusion', projectId: project.id })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('Bob ne peut pas poser un tag d’Alice sur sa propre tâche', async () => {
    const tag = tagsService.create(db, { name: 'privé' })
    signIn(env, bobId)

    expect(() => tasksService.create(db, { title: 'Intrusion', tagIds: [tag.id] })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('Bob ne peut pas ajouter de sous-tâche à une tâche d’Alice', async () => {
    const task = tasksService.create(db, { title: 'Secret Alice' })
    signIn(env, bobId)

    expect(() => subtasksService.create(db, { taskId: task.id, title: 'Intrusion' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.NOT_FOUND })
    )
  })

  it('la recherche de Bob ne remonte jamais les données d’Alice', async () => {
    tasksService.create(db, { title: 'Trajectoire Alice' })
    projectsService.create(db, { name: 'Trajectoire projet' })
    signIn(env, bobId)

    const results = searchService.run(db, { query: 'trajectoire' })
    expect(results.tasks).toEqual([])
    expect(results.projects).toEqual([])
  })

  it('les identifiants d’Alice et Bob sont bien distincts', () => {
    expect(aliceId).not.toBe(bobId)
  })
})
