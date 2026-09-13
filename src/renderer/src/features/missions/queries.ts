import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type QueryClient
} from '@tanstack/react-query'
import type { AccentColor } from '@shared/types/domain'
import type { TagWithUsage } from '@shared/ipc-contract'
import type {
  TaskListItem,
  TaskDetail,
  TaskComment,
  ChatMessage,
  ProjectSummary,
  DashboardData,
  SearchResults,
  GoalSummary,
  StatsData,
  TimelineData
} from '@shared/types/views'
import type { ChatReaction } from '@shared/schemas/chat.schema'
import type { TaskFilter } from '@shared/schemas/task.schema'
import { unwrap } from '@renderer/lib/ipc'

/**
 * Clés de cache.
 *
 * Toutes les vues — liste, Kanban, calendrier, tableau de bord — lisent le MÊME
 * cache. Terminer une tâche depuis n'importe où les met donc toutes à jour, sans
 * aucun code de synchronisation : elles n'ont jamais eu de copies séparées (§10).
 */
export const keys = {
  dashboard: ['dashboard'] as const,
  tasks: (filter: Partial<TaskFilter>) => ['tasks', filter] as const,
  task: (id: string) => ['task', id] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  tags: ['tags'] as const,
  search: (query: string) => ['search', query] as const,
  goals: ['goals'] as const,
  stats: (days: number) => ['stats', days] as const,
  timeline: ['timeline'] as const,
  comments: (taskId: string) => ['comments', taskId] as const,
  chat: (projectId: string) => ['chat', projectId] as const
}

/**
 * Invalidation après toute écriture sur une tâche.
 *
 * Volontairement LARGE : une tâche terminée change son projet (progression), le
 * tableau de bord (compteurs) et toute liste filtrée. Invalider finement serait
 * une optimisation prématurée sur des requêtes locales qui coûtent une
 * milliseconde — et le premier oubli produirait un chiffre faux à l'écran.
 */
function invalidateMissions(client: QueryClient, taskId?: string): void {
  void client.invalidateQueries({ queryKey: ['tasks'] })
  void client.invalidateQueries({ queryKey: keys.dashboard })
  void client.invalidateQueries({ queryKey: keys.projects })
  void client.invalidateQueries({ queryKey: keys.tags })
  void client.invalidateQueries({ queryKey: keys.goals })
  void client.invalidateQueries({ queryKey: ['stats'] })
  void client.invalidateQueries({ queryKey: keys.timeline })
  if (taskId) void client.invalidateQueries({ queryKey: keys.task(taskId) })
}

export function useDashboard(): UseQueryResult<DashboardData> {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: () => unwrap(window.mc.dashboard.load())
  })
}

export function useTasks(filter: Partial<TaskFilter>): UseQueryResult<TaskListItem[]> {
  return useQuery({
    queryKey: keys.tasks(filter),
    queryFn: () => unwrap(window.mc.tasks.list(filter)),
    // Les filtres changent à chaque frappe : garder l'ancien résultat affiché
    // évite que la liste ne clignote entre chaque caractère.
    placeholderData: (previous) => previous
  })
}

export function useTask(id: string | null): UseQueryResult<TaskDetail> {
  return useQuery({
    queryKey: keys.task(id ?? ''),
    queryFn: () => unwrap(window.mc.tasks.get({ id: id as string })),
    enabled: id !== null
  })
}

export function useProjects(): UseQueryResult<ProjectSummary[]> {
  return useQuery({
    queryKey: keys.projects,
    queryFn: () => unwrap(window.mc.projects.list())
  })
}

export function useTags(): UseQueryResult<TagWithUsage[]> {
  return useQuery({ queryKey: keys.tags, queryFn: () => unwrap(window.mc.tags.list()) })
}

export function useSearch(query: string): UseQueryResult<SearchResults> {
  return useQuery({
    queryKey: keys.search(query),
    queryFn: () => unwrap(window.mc.search.run({ query })),
    enabled: query.trim().length > 0,
    placeholderData: (previous) => previous
  })
}

/* --- Écritures ----------------------------------------------------------- */

type Api = typeof window.mc

function useMissionMutation<TInput, TResult>(
  call: (api: Api, input: TInput) => Promise<TResult>,
  taskIdOf?: (result: TResult) => string
): ReturnType<typeof useMutation<TResult, Error, TInput>> {
  const client = useQueryClient()
  return useMutation<TResult, Error, TInput>({
    mutationFn: (input) => call(window.mc, input),
    onSuccess: (result) => invalidateMissions(client, taskIdOf?.(result))
  })
}

export const useCreateTask = () =>
  useMissionMutation(
    (api, input: Parameters<Api['tasks']['create']>[0]) => unwrap(api.tasks.create(input)),
    (task) => task.id
  )

export const useUpdateTask = () =>
  useMissionMutation(
    (api, input: Parameters<Api['tasks']['update']>[0]) => unwrap(api.tasks.update(input)),
    (task) => task.id
  )

export const useToggleTask = () =>
  useMissionMutation(
    (api, input: { id: string }) => unwrap(api.tasks.toggle(input)),
    (task) => task.id
  )

export const useMoveTask = () =>
  useMissionMutation(
    (api, input: Parameters<Api['tasks']['move']>[0]) => unwrap(api.tasks.move(input)),
    (task) => task.id
  )

export const useDeleteTask = () =>
  useMissionMutation((api, input: { id: string }) => unwrap(api.tasks.remove(input)))

export const useCreateProject = () =>
  useMissionMutation((api, input: Parameters<Api['projects']['create']>[0]) =>
    unwrap(api.projects.create(input))
  )

export const useUpdateProject = () =>
  useMissionMutation((api, input: Parameters<Api['projects']['update']>[0]) =>
    unwrap(api.projects.update(input))
  )

export const useDeleteProject = () =>
  useMissionMutation((api, input: { id: string }) => unwrap(api.projects.remove(input)))

export const useCreateTag = () =>
  useMissionMutation((api, input: { name: string; color?: AccentColor }) =>
    unwrap(api.tags.create(input))
  )

export const useDeleteTag = () =>
  useMissionMutation((api, input: { id: string }) => unwrap(api.tags.remove(input)))

export const useCreateSubtask = () =>
  useMissionMutation(
    (api, input: { taskId: string; title: string }) => unwrap(api.subtasks.create(input)),
    (task) => task.id
  )

export const useUpdateSubtask = () =>
  useMissionMutation(
    (api, input: { id: string; title?: string; completed?: boolean }) =>
      unwrap(api.subtasks.update(input)),
    (task) => task.id
  )

export const useDeleteSubtask = () =>
  useMissionMutation(
    (api, input: { id: string }) => unwrap(api.subtasks.remove(input)),
    (task) => task.id
  )

/* --- Fil de discussion d'une tâche -------------------------------------- */

export function useComments(taskId: string | null): UseQueryResult<TaskComment[]> {
  return useQuery({
    queryKey: keys.comments(taskId ?? ''),
    queryFn: () => unwrap(window.mc.comments.list({ taskId: taskId as string })),
    enabled: taskId !== null
  })
}

/**
 * Les mutations de commentaire renvoient le fil complet à jour : on l'écrit
 * directement dans le cache plutôt que d'invalider, pour que le message
 * apparaisse sans clignotement. On invalide seulement la liste des tâches, pour
 * rafraîchir le badge de compteur.
 */
function useCommentMutation<TInput extends { taskId?: string }>(
  call: (api: Api, input: TInput) => Promise<TaskComment[]>,
  taskIdOf: (input: TInput) => string | undefined
): ReturnType<typeof useMutation<TaskComment[], Error, TInput>> {
  const client = useQueryClient()
  return useMutation<TaskComment[], Error, TInput>({
    mutationFn: (input) => call(window.mc, input),
    onSuccess: (comments, input) => {
      const taskId = taskIdOf(input) ?? comments[0]?.taskId
      if (taskId) client.setQueryData(keys.comments(taskId), comments)
      void client.invalidateQueries({ queryKey: ['tasks'] })
      if (taskId) void client.invalidateQueries({ queryKey: keys.task(taskId) })
    }
  })
}

export const useCreateComment = () =>
  useCommentMutation(
    (api, input: { taskId: string; body: string }) => unwrap(api.comments.create(input)),
    (input) => input.taskId
  )

export const useUpdateComment = () =>
  useCommentMutation(
    (api, input: { id: string; body: string; taskId: string }) =>
      unwrap(api.comments.update({ id: input.id, body: input.body })),
    (input) => input.taskId
  )

export const useDeleteComment = () =>
  useCommentMutation(
    (api, input: { id: string; taskId: string }) => unwrap(api.comments.remove({ id: input.id })),
    (input) => input.taskId
  )

/* --- Chat général d'une app ---------------------------------------------
   Séparé du fil de discussion d'une tâche ci-dessus : une app entière, pas
   une tâche précise. Même stratégie de cache — la mutation renvoie le fil
   complet, écrit directement plutôt qu'invalidé, pour qu'un envoi ou une
   réaction n'ait jamais à clignoter. */

export function useChatMessages(projectId: string | null): UseQueryResult<ChatMessage[]> {
  return useQuery({
    queryKey: keys.chat(projectId ?? ''),
    queryFn: () => unwrap(window.mc.chat.list({ projectId: projectId as string })),
    enabled: projectId !== null
  })
}

function useChatMutation<TInput extends { projectId?: string }>(
  call: (api: Api, input: TInput) => Promise<ChatMessage[]>,
  projectIdOf: (input: TInput) => string | undefined
): ReturnType<typeof useMutation<ChatMessage[], Error, TInput>> {
  const client = useQueryClient()
  return useMutation<ChatMessage[], Error, TInput>({
    mutationFn: (input) => call(window.mc, input),
    onSuccess: (messages, input) => {
      const projectId = projectIdOf(input) ?? messages[0]?.projectId
      if (projectId) client.setQueryData(keys.chat(projectId), messages)
    }
  })
}

export const useCreateChatMessage = () =>
  useChatMutation(
    (api, input: { projectId: string; body: string }) => unwrap(api.chat.create(input)),
    (input) => input.projectId
  )

export const useUpdateChatMessage = () =>
  useChatMutation(
    (api, input: { id: string; body: string; projectId: string }) =>
      unwrap(api.chat.update({ id: input.id, body: input.body })),
    (input) => input.projectId
  )

export const useReactToChatMessage = () =>
  useChatMutation(
    (api, input: { id: string; reaction: ChatReaction | null; projectId: string }) =>
      unwrap(api.chat.react({ id: input.id, reaction: input.reaction })),
    (input) => input.projectId
  )

export const useDeleteChatMessage = () =>
  useChatMutation(
    (api, input: { id: string; projectId: string }) => unwrap(api.chat.remove({ id: input.id })),
    (input) => input.projectId
  )

/* --- Objectifs et statistiques -------------------------------------------- */

export function useGoals(): UseQueryResult<GoalSummary[]> {
  return useQuery({ queryKey: keys.goals, queryFn: () => unwrap(window.mc.goals.list()) })
}

export function useStats(days: number): UseQueryResult<StatsData> {
  return useQuery({
    queryKey: keys.stats(days),
    queryFn: () => unwrap(window.mc.stats.load({ days })),
    placeholderData: (previous) => previous
  })
}

export const useCreateGoal = () =>
  useMissionMutation((api, input: Parameters<Api['goals']['create']>[0]) =>
    unwrap(api.goals.create(input))
  )

export const useUpdateGoal = () =>
  useMissionMutation((api, input: Parameters<Api['goals']['update']>[0]) =>
    unwrap(api.goals.update(input))
  )

export const useAdvanceGoal = () =>
  useMissionMutation((api, input: { id: string; by: number }) => unwrap(api.goals.advance(input)))

export const useDeleteGoal = () =>
  useMissionMutation((api, input: { id: string }) => unwrap(api.goals.remove(input)))

export function useTimeline(): UseQueryResult<TimelineData> {
  return useQuery({ queryKey: keys.timeline, queryFn: () => unwrap(window.mc.timeline.load()) })
}
