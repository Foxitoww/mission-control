import { IpcChannel } from '@shared/ipc-contract'
import { handle } from './registry'
import { getDb } from '../db/connection'
import { tasksService } from '../services/tasks.service'
import { projectsService } from '../services/projects.service'
import { tagsService } from '../services/tags.service'
import { subtasksService } from '../services/subtasks.service'
import { dashboardService } from '../services/dashboard.service'
import { searchService } from '../services/search.service'

/**
 * Handlers du domaine métier.
 *
 * Chacun se réduit à « prendre la base, passer l'entrée au service ». La session,
 * la validation et les règles vivent dans les services : cette couche ne fait que
 * relier des canaux, ce qui la rend triviale à relire.
 */
export function registerMissionHandlers(): void {
  handle(IpcChannel.DASHBOARD_LOAD, () => dashboardService.load(getDb()))

  handle(IpcChannel.TASKS_LIST, (input: unknown) => tasksService.list(getDb(), input))
  handle(IpcChannel.TASKS_GET, (input: unknown) => tasksService.get(getDb(), input))
  handle(IpcChannel.TASKS_CREATE, (input: unknown) => tasksService.create(getDb(), input))
  handle(IpcChannel.TASKS_UPDATE, (input: unknown) => tasksService.update(getDb(), input))
  handle(IpcChannel.TASKS_MOVE, (input: unknown) => tasksService.move(getDb(), input))
  handle(IpcChannel.TASKS_TOGGLE, (input: unknown) => tasksService.toggle(getDb(), input))
  handle(IpcChannel.TASKS_DELETE, (input: unknown) => tasksService.remove(getDb(), input))

  handle(IpcChannel.PROJECTS_LIST, () => projectsService.list(getDb()))
  handle(IpcChannel.PROJECTS_GET, (input: unknown) => projectsService.get(getDb(), input))
  handle(IpcChannel.PROJECTS_CREATE, (input: unknown) => projectsService.create(getDb(), input))
  handle(IpcChannel.PROJECTS_UPDATE, (input: unknown) => projectsService.update(getDb(), input))
  handle(IpcChannel.PROJECTS_DELETE, (input: unknown) => projectsService.remove(getDb(), input))

  handle(IpcChannel.TAGS_LIST, () => tagsService.list(getDb()))
  handle(IpcChannel.TAGS_CREATE, (input: unknown) => tagsService.create(getDb(), input))
  handle(IpcChannel.TAGS_UPDATE, (input: unknown) => tagsService.update(getDb(), input))
  handle(IpcChannel.TAGS_DELETE, (input: unknown) => tagsService.remove(getDb(), input))

  handle(IpcChannel.SUBTASKS_CREATE, (input: unknown) => subtasksService.create(getDb(), input))
  handle(IpcChannel.SUBTASKS_UPDATE, (input: unknown) => subtasksService.update(getDb(), input))
  handle(IpcChannel.SUBTASKS_DELETE, (input: unknown) => subtasksService.remove(getDb(), input))
  handle(IpcChannel.SUBTASKS_REORDER, (input: unknown) => subtasksService.reorder(getDb(), input))

  handle(IpcChannel.SEARCH_RUN, (input: unknown) => searchService.run(getDb(), input))
}
