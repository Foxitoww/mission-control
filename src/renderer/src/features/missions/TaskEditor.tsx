import { useState, type FormEvent } from 'react'
import { TASK_STATUSES, TASK_PRIORITIES } from '@shared/types/domain'
import type { TaskStatus, TaskPriority } from '@shared/types/domain'
import type { TaskDetail } from '@shared/types/views'
import { FREQUENCIES, type Frequency } from '@shared/schemas/recurrence.schema'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { TextField } from '@renderer/components/TextField'
import { useI18n } from '@renderer/i18n'
import { useToast } from '@renderer/components/Toast'
import { IpcError } from '@renderer/lib/ipc'
import { dateInputToIso, isoToDateInput, missionCode } from '@renderer/lib/format'
import {
  useTask,
  useTags,
  useProjects,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useCreateSubtask,
  useUpdateSubtask,
  useDeleteSubtask
} from './queries'
import './missions.css'

/** Lundi d'abord : convention francaise, et non l'ordre 0-6 de getDay(). */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

interface TaskEditorProps {
  /** `null` = création. Un identifiant = édition. */
  taskId?: string | null
  /** Projet présélectionné, quand on crée depuis une page de mission. */
  defaultProjectId?: string | null
  onClose: () => void
}

/**
 * Enveloppe de chargement.
 *
 * Le formulaire initialise son état local une seule fois, à son montage. Si on
 * le montait avant l'arrivée des données, il naîtrait vide et n'afficherait
 * jamais la tâche. On attend donc, puis on monte — et la `key` garantit un
 * remontage propre quand on passe d'une tâche à une autre.
 */
export function TaskEditor({
  taskId = null,
  defaultProjectId = null,
  onClose
}: TaskEditorProps): JSX.Element {
  const { t } = useI18n()
  const existing = useTask(taskId)

  if (taskId !== null && !existing.data) {
    return (
      <Modal title={t('task.edit')} label="Loading" onClose={onClose}>
        <div className="skeleton" />
      </Modal>
    )
  }

  return (
    <EditorForm
      key={taskId ?? 'new'}
      task={existing.data ?? null}
      taskId={taskId}
      defaultProjectId={defaultProjectId}
      onClose={onClose}
    />
  )
}

function EditorForm({
  task,
  taskId,
  defaultProjectId,
  onClose
}: {
  task: TaskDetail | null
  taskId: string | null
  defaultProjectId: string | null
  onClose: () => void
}): JSX.Element {
  const { t, tError } = useI18n()
  const toast = useToast()
  const { data: projects = [] } = useProjects()
  const { data: tags = [] } = useTags()

  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const createSubtask = useCreateSubtask()
  const updateSubtask = useUpdateSubtask()
  const deleteSubtask = useDeleteSubtask()

  const isEdit = taskId !== null

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [projectId, setProjectId] = useState(task?.projectId ?? defaultProjectId ?? '')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'TODO')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'MEDIUM')
  const [dueDate, setDueDate] = useState(isoToDateInput(task?.dueDate ?? null))
  const [estimate, setEstimate] = useState(task?.estimatedMinutes?.toString() ?? '')
  const [tagIds, setTagIds] = useState<string[]>(task?.tags.map((tag) => tag.id) ?? [])
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Une fréquence vide signifie « tâche ponctuelle ». On évite un booléen
  // séparé : deux états pour une seule information finissent par diverger.
  const [freq, setFreq] = useState<Frequency | ''>(task?.recurrence?.freq ?? '')
  const [interval, setInterval] = useState(String(task?.recurrence?.interval ?? 1))
  const [weekdays, setWeekdays] = useState<number[]>(task?.recurrence?.weekdays ?? [])

  const busy = createTask.isPending || updateTask.isPending

  function toggleTag(id: string): void {
    setTagIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    )
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)

    const payload = {
      title,
      description: description.trim() === '' ? null : description,
      projectId: projectId === '' ? null : projectId,
      status,
      priority,
      dueDate: dateInputToIso(dueDate),
      estimatedMinutes: estimate === '' ? null : Number(estimate),
      tagIds,
      recurrence:
        freq === ''
          ? null
          : { freq, interval: Math.max(1, Number(interval) || 1), weekdays }
    }

    try {
      if (isEdit && taskId) await updateTask.mutateAsync({ id: taskId, ...payload })
      else await createTask.mutateAsync(payload)
      onClose()
    } catch (caught) {
      setError(tError(caught instanceof IpcError ? caught.key : 'UNKNOWN'))
    }
  }

  async function removeTask(): Promise<void> {
    if (!taskId) return
    try {
      await deleteTask.mutateAsync({ id: taskId })
      // Une suppression silencieuse laisse un doute : la tâche a-t-elle disparu
      // ou l'action a-t-elle échoué ? La confirmation lève l'ambiguïté.
      toast.success(t('toast.taskDeleted'))
      onClose()
    } catch {
      toast.error(t('toast.failed'))
    }
  }

  return (
    <Modal
      title={isEdit ? t('task.edit') : t('task.new')}
      label={isEdit && taskId ? missionCode(taskId) : 'New operation'}
      onClose={onClose}
    >
      <form className="editor" onSubmit={submit} noValidate>
        {error && (
          <div className="mc-alert" role="alert">
            <span>{error}</span>
          </div>
        )}

        <TextField
          label={t('task.title')}
          value={title}
          autoFocus
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
        />

        <div className="editor__row">
          <label className="mc-field__label" htmlFor="task-description">
            {t('task.description')}
          </label>
          <textarea
            id="task-description"
            className="editor__textarea"
            value={description}
            disabled={busy}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="editor__grid">
          <div className="editor__row">
            <label className="mc-field__label" htmlFor="task-project">
              {t('task.project')}
            </label>
            <select
              id="task-project"
              className="editor__select"
              value={projectId}
              disabled={busy}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">{t('task.noProject')}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="editor__row">
            <label className="mc-field__label" htmlFor="task-status">
              {t('task.status')}
            </label>
            <select
              id="task-status"
              className="editor__select"
              value={status}
              disabled={busy}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
            >
              {TASK_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`status.${value}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="editor__row">
            <label className="mc-field__label" htmlFor="task-priority">
              {t('task.priority')}
            </label>
            <select
              id="task-priority"
              className="editor__select"
              value={priority}
              disabled={busy}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
            >
              {TASK_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {t(`priority.${value}`)}
                </option>
              ))}
            </select>
          </div>

          <TextField
            label={t('task.dueDate')}
            type="date"
            value={dueDate}
            disabled={busy}
            onChange={(event) => setDueDate(event.target.value)}
          />

          <TextField
            label={t('task.estimate')}
            type="number"
            min={1}
            value={estimate}
            disabled={busy}
            placeholder="60"
            onChange={(event) => setEstimate(event.target.value)}
          />
        </div>

        {tags.length > 0 && (
          <div className="editor__row">
            <span className="mc-field__label">{t('task.tags')}</span>
            <div className="editor__tags" role="group" aria-label={t('task.tags')}>
              {tags.map((tag) => {
                const selected = tagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className="tag-toggle"
                    aria-pressed={selected}
                    disabled={busy}
                    style={selected ? { borderColor: tag.color, background: `${tag.color}22` } : undefined}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="editor__row">
          <span className="mc-field__label">{t('recurrence.label')}</span>

          <div className="filters__row">
            <select
              className="editor__select"
              value={freq}
              disabled={busy}
              aria-label={t('recurrence.label')}
              onChange={(event) => setFreq(event.target.value as Frequency | '')}
            >
              <option value="">{t('recurrence.none')}</option>
              {FREQUENCIES.map((value) => (
                <option key={value} value={value}>
                  {t(`recurrence.${value}`)}
                </option>
              ))}
            </select>

            {freq !== '' && (
              <label className="recurrence__interval">
                {t('recurrence.every')}
                <input
                  className="mc-field__input"
                  type="number"
                  min={1}
                  max={365}
                  value={interval}
                  disabled={busy}
                  onChange={(event) => setInterval(event.target.value)}
                />
                {t(`recurrence.unit.${freq}`)}
              </label>
            )}
          </div>

          {/* Les jours ne s'affichent que pour la fréquence hebdomadaire :
              proposer « lundi, mercredi » sur une récurrence mensuelle
              inviterait à un réglage sans effet. */}
          {freq === 'WEEKLY' && (
            <div className="filters__group" role="group" aria-label={t('recurrence.weekdays')}>
              {WEEKDAY_ORDER.map((day) => (
                <button
                  key={day}
                  type="button"
                  className="chip"
                  aria-pressed={weekdays.includes(day)}
                  disabled={busy}
                  onClick={() =>
                    setWeekdays((current) =>
                      current.includes(day)
                        ? current.filter((value) => value !== day)
                        : [...current, day]
                    )
                  }
                >
                  {t(`weekday.${day}`)}
                </button>
              ))}
            </div>
          )}

          {freq !== '' && <span className="mc-field__hint">{t('recurrence.hint')}</span>}
        </div>

        {/* Les sous-tâches ne sont éditables qu'après création : elles ont besoin
            d'un identifiant de tâche parente pour exister. */}
        {isEdit && task && (
          <div className="editor__row">
            <span className="mc-field__label">
              {t('task.subtasks')} {task.subtaskDone}/{task.subtaskTotal}
            </span>

            <ul className="subtasks">
              {task.subtasks.map((subtask) => (
                <li key={subtask.id} className={`subtask${subtask.completed ? ' subtask--done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={subtask.completed}
                    aria-label={subtask.title}
                    onChange={() =>
                      updateSubtask.mutate({ id: subtask.id, completed: !subtask.completed })
                    }
                  />
                  <span className="subtask__title">{subtask.title}</span>
                  <button
                    type="button"
                    className="subtask__remove"
                    aria-label={t('common.delete')}
                    onClick={() => deleteSubtask.mutate({ id: subtask.id })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            <div className="inline-add">
              <input
                className="mc-field__input"
                value={subtaskTitle}
                placeholder={t('task.addSubtask')}
                aria-label={t('task.addSubtask')}
                onChange={(event) => setSubtaskTitle(event.target.value)}
                onKeyDown={(event) => {
                  // Entrée ajoute la sous-tâche SANS soumettre le formulaire :
                  // sinon enchaîner trois étapes fermerait la modale trois fois.
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  if (subtaskTitle.trim() === '') return
                  createSubtask.mutate({ taskId: task.id, title: subtaskTitle })
                  setSubtaskTitle('')
                }}
              />
            </div>
          </div>
        )}

        <div className="mc-modal__actions">
          {isEdit && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void removeTask()}
              disabled={busy}
            >
              {t('common.delete')}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
