import { useState, type FormEvent } from 'react'
import type { GoalSummary } from '@shared/types/views'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { TextField } from '@renderer/components/TextField'
import { QueryState } from '@renderer/components/QueryState'
import {
  useGoals,
  useProjects,
  useCreateGoal,
  useAdvanceGoal,
  useDeleteGoal,
  useUpdateGoal
} from '@renderer/features/missions/queries'
import { useI18n } from '@renderer/i18n'
import { useToast } from '@renderer/components/Toast'
import { IpcError } from '@renderer/lib/ipc'
import { formatPercent, formatDue, dateInputToIso } from '@renderer/lib/format'
import '@renderer/features/missions/missions.css'
import './goals.css'

function GoalComposer({ onClose }: { onClose: () => void }): JSX.Element {
  const { t, tError } = useI18n()
  const { data: projects = [] } = useProjects()
  const create = useCreateGoal()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [target, setTarget] = useState('10')
  const [projectId, setProjectId] = useState('')
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    try {
      await create.mutateAsync({
        title,
        description: description.trim() === '' ? null : description,
        targetValue: Number(target) || 1,
        projectId: projectId === '' ? null : projectId,
        deadline: dateInputToIso(deadline)
      })
      onClose()
    } catch (caught) {
      setError(tError(caught instanceof IpcError ? caught.key : 'UNKNOWN'))
    }
  }

  return (
    <Modal title={t('goal.new')} label="New objective" onClose={onClose}>
      <form className="editor" onSubmit={submit} noValidate>
        {error && (
          <div className="mc-alert" role="alert">
            <span>{error}</span>
          </div>
        )}

        <TextField
          label={t('goal.title')}
          value={title}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />

        <div className="editor__row">
          <label className="mc-field__label" htmlFor="goal-description">
            {t('task.description')}
          </label>
          <textarea
            id="goal-description"
            className="editor__textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="editor__grid">
          <TextField
            label={t('goal.target')}
            type="number"
            min={1}
            value={target}
            hint={t('goal.targetHint')}
            onChange={(event) => setTarget(event.target.value)}
          />

          <div className="editor__row">
            <label className="mc-field__label" htmlFor="goal-project">
              {t('task.project')}
            </label>
            <select
              id="goal-project"
              className="editor__select"
              value={projectId}
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

          <TextField
            label={t('project.deadline')}
            type="date"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </div>

        <div className="mc-modal__actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={create.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function GoalCard({ goal }: { goal: GoalSummary }): JSX.Element {
  const { t, language } = useI18n()
  const toast = useToast()
  const advance = useAdvanceGoal()
  const update = useUpdateGoal()
  const remove = useDeleteGoal()

  const due = formatDue(goal.deadline, language)
  const done = goal.status === 'COMPLETED'

  return (
    <article className={`goal-card${done ? ' goal-card--done' : ''}`}>
      <header className="goal-card__head">
        <span className="goal-card__title">{goal.title}</span>
        <span className="mc-data goal-card__ratio">
          {goal.currentValue} / {goal.targetValue}
        </span>
      </header>

      {goal.description && <p className="mission-card__desc">{goal.description}</p>}

      <div className="progress">
        <div
          className="progress__bar"
          style={{
            width: `${goal.progress * 100}%`,
            background: done ? 'var(--mc-green)' : (goal.projectColor ?? 'var(--mc-accent)')
          }}
        />
      </div>

      <footer className="goal-card__foot">
        <span className="mc-data">{formatPercent(goal.progress)}</span>
        {goal.projectName && (
          <span className="task-row__project">
            <span
              className="task-row__dot"
              style={{ background: goal.projectColor ?? 'var(--mc-accent)' }}
              aria-hidden="true"
            />
            {goal.projectName}
          </span>
        )}
        {due && (
          <span className={`mc-data task-row__due--${due.tone}`} title={due.absolute}>
            {due.countdown}
          </span>
        )}
        <span className="mc-data goal-card__status">{t(`goalStatus.${goal.status}`)}</span>
      </footer>

      <div className="goal-card__actions">
        {/* Incrément direct depuis la carte : avancer d'un cran est le geste le
            plus fréquent, il ne doit pas exiger d'ouvrir un formulaire. */}
        <Button
          variant="secondary"
          onClick={() => advance.mutate({ id: goal.id, by: -1 })}
          aria-label={t('goal.decrement')}
        >
          −
        </Button>
        <Button
          variant="secondary"
          onClick={() => advance.mutate({ id: goal.id, by: 1 })}
          aria-label={t('goal.increment')}
        >
          +
        </Button>
        {goal.status === 'ACTIVE' && (
          <Button
            variant="ghost"
            onClick={() => update.mutate({ id: goal.id, status: 'ABANDONED' })}
          >
            {t('goal.abandon')}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() =>
            remove.mutate(
              { id: goal.id },
              {
                onSuccess: () => toast.success(t('toast.goalDeleted')),
                onError: () => toast.error(t('toast.failed'))
              }
            )
          }
        >
          {t('common.delete')}
        </Button>
      </div>
    </article>
  )
}

export function GoalsPage(): JSX.Element {
  const { t } = useI18n()
  const { data: goals = [], isPending, isError, refetch } = useGoals()
  const [composing, setComposing] = useState(false)

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <span className="mc-label">Objectives</span>
          <h1 className="page__title">{t('nav.goals')}</h1>
        </div>
        <Button onClick={() => setComposing(true)}>{t('goal.new')}</Button>
      </header>

      <QueryState
        isPending={isPending}
        isError={isError}
        isEmpty={goals.length === 0}
        retry={() => void refetch()}
        emptyTitle={t('goal.emptyTitle')}
        emptyHint={t('goal.emptyHint')}
        skeletonHeight={160}
        skeletonCount={2}
      >
        <div className="goal-grid">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      </QueryState>

      {composing && <GoalComposer onClose={() => setComposing(false)} />}
    </div>
  )
}
