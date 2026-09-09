import { IpcChannel } from '@shared/ipc-contract'
import { handle } from './registry'
import { session } from '../services/session.service'
import { tasksService } from '../services/tasks.service'
import { projectsService } from '../services/projects.service'
import { tagsService } from '../services/tags.service'
import { subtasksService } from '../services/subtasks.service'
import { dashboardService } from '../services/dashboard.service'
import { searchService } from '../services/search.service'
import { goalsService } from '../services/goals.service'
import { statsService } from '../services/stats.service'
import type { Db } from '../db/connection'

/** Lecture : le coffre déchiffré, jamais le fichier. */
function read<TResult>(channel: string, fn: (db: Db, input: unknown) => TResult): void {
  handle(channel, (input: unknown) => fn(session.requireVault(), input))
}

/**
 * Écriture : la même chose, suivie d'une réécriture du coffre chiffré.
 *
 * La persistance est ici plutôt que dans chaque service : un service qui
 * oublierait d'appeler `persist` produirait une modification visible à l'écran
 * mais absente du disque au prochain démarrage. En la plaçant sur le canal, on
 * ne peut pas l'oublier — écrire passe forcément par cette fonction.
 */
function write<TResult>(channel: string, fn: (db: Db, input: unknown) => TResult): void {
  handle(channel, (input: unknown) => {
    const result = fn(session.requireVault(), input)
    session.persist()
    return result
  })
}

export function registerMissionHandlers(): void {
  read(IpcChannel.DASHBOARD_LOAD, (db) => dashboardService.load(db))

  read(IpcChannel.TASKS_LIST, (db, input) => tasksService.list(db, input))
  read(IpcChannel.TASKS_GET, (db, input) => tasksService.get(db, input))
  write(IpcChannel.TASKS_CREATE, (db, input) => tasksService.create(db, input))
  write(IpcChannel.TASKS_UPDATE, (db, input) => tasksService.update(db, input))
  write(IpcChannel.TASKS_MOVE, (db, input) => tasksService.move(db, input))
  write(IpcChannel.TASKS_TOGGLE, (db, input) => tasksService.toggle(db, input))
  write(IpcChannel.TASKS_DELETE, (db, input) => tasksService.remove(db, input))

  read(IpcChannel.PROJECTS_LIST, (db) => projectsService.list(db))
  read(IpcChannel.PROJECTS_GET, (db, input) => projectsService.get(db, input))
  write(IpcChannel.PROJECTS_CREATE, (db, input) => projectsService.create(db, input))
  write(IpcChannel.PROJECTS_UPDATE, (db, input) => projectsService.update(db, input))
  write(IpcChannel.PROJECTS_DELETE, (db, input) => projectsService.remove(db, input))

  read(IpcChannel.TAGS_LIST, (db) => tagsService.list(db))
  write(IpcChannel.TAGS_CREATE, (db, input) => tagsService.create(db, input))
  write(IpcChannel.TAGS_UPDATE, (db, input) => tagsService.update(db, input))
  write(IpcChannel.TAGS_DELETE, (db, input) => tagsService.remove(db, input))

  write(IpcChannel.SUBTASKS_CREATE, (db, input) => subtasksService.create(db, input))
  write(IpcChannel.SUBTASKS_UPDATE, (db, input) => subtasksService.update(db, input))
  write(IpcChannel.SUBTASKS_DELETE, (db, input) => subtasksService.remove(db, input))
  write(IpcChannel.SUBTASKS_REORDER, (db, input) => subtasksService.reorder(db, input))

  read(IpcChannel.GOALS_LIST, (db) => goalsService.list(db))
  write(IpcChannel.GOALS_CREATE, (db, input) => goalsService.create(db, input))
  write(IpcChannel.GOALS_UPDATE, (db, input) => goalsService.update(db, input))
  write(IpcChannel.GOALS_ADVANCE, (db, input) => goalsService.advance(db, input))
  write(IpcChannel.GOALS_DELETE, (db, input) => goalsService.remove(db, input))

  read(IpcChannel.STATS_LOAD, (db, input) => statsService.load(db, input))

  read(IpcChannel.SEARCH_RUN, (db, input) => searchService.run(db, input))
}
