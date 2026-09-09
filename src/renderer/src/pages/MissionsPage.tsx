import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ACCENT_COLORS, PROJECT_STATUSES } from '@shared/types/domain'
import type { ProjectStatus } from '@shared/types/domain'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { TextField } from '@renderer/components/TextField'
import { useProjects, useCreateProject } from '@renderer/features/missions/queries'
import { useI18n } from '@renderer/i18n'
import { IpcError } from '@renderer/lib/ipc'
import { formatPercent, isoToDateInput } from '@renderer/lib/format'
import { dateInputToIso } from '@renderer/lib/format'
import '@renderer/features/missions/missions.css'

function ProjectComposer({ onClose }: { onClose: () => void }): JSX.Element {
  const { t, tError } = useI18n()
  const create = useCreateProject()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('')
  const [color, setColor] = useState<string>(ACCENT_COLORS[0])
  const [status, setStatus] = useState<ProjectStatus>('ACTIVE')
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    try {
      await create.mutateAsync({
        name,
        description: description.trim() === '' ? null : description,
        icon: icon.trim() === '' ? null : icon,
        color: color as (typeof ACCENT_COLORS)[number],
        status,
        deadline: dateInputToIso(deadline)
      })
      onClose()
    } catch (caught) {
      setError(tError(caught instanceof IpcError ? caught.key : 'UNKNOWN'))
    }
  }

  return (
    <Modal title={t('project.new')} label="New mission" onClose={onClose}>
      <form className="editor" onSubmit={submit} noValidate>
        {error && (
          <div className="mc-alert" role="alert">
            <span>{error}</span>
          </div>
        )}

        <TextField
          label={t('project.name')}
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />

        <div className="editor__row">
          <label className="mc-field__label" htmlFor="project-description">
            {t('task.description')}
          </label>
          <textarea
            id="project-description"
            className="editor__textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="editor__grid">
          <TextField
            label={t('project.icon')}
            value={icon}
            maxLength={16}
            placeholder="🛰️"
            onChange={(event) => setIcon(event.target.value)}
          />

          <div className="editor__row">
            <label className="mc-field__label" htmlFor="project-status">
              {t('task.status')}
            </label>
            <select
              id="project-status"
              className="editor__select"
              value={status}
              onChange={(event) => setStatus(event.target.value as ProjectStatus)}
            >
              {PROJECT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`projectStatus.${value}`)}
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

        <div className="editor__row">
          <span className="mc-field__label">{t('profile.accent')}</span>
          <div className="mc-swatches" role="group" aria-label={t('profile.accent')}>
            {ACCENT_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                className="mc-swatch"
                style={{ background: value }}
                aria-pressed={color === value}
                aria-label={value}
                onClick={() => setColor(value)}
              />
            ))}
          </div>
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

export function MissionsPage(): JSX.Element {
  const { t, language } = useI18n()
  const navigate = useNavigate()
  const { data: projects = [], isPending } = useProjects()
  const [composing, setComposing] = useState(false)

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <span className="mc-label">Programs</span>
          <h1 className="page__title">{t('nav.missions')}</h1>
        </div>
        <Button onClick={() => setComposing(true)}>{t('project.new')}</Button>
      </header>

      {isPending ? (
        <div className="mission-grid">
          <div className="skeleton" style={{ height: 130 }} />
          <div className="skeleton" style={{ height: 130 }} />
        </div>
      ) : projects.length === 0 ? (
        <div className="state">
          <span className="state__title">{t('project.emptyTitle')}</span>
          <span>{t('project.emptyHint')}</span>
        </div>
      ) : (
        <div className="mission-grid">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className="mission-card"
              style={{ borderTopColor: project.color }}
              onClick={() => navigate(`/missions/${project.id}`)}
            >
              <span className="mission-card__name">
                {project.icon ? `${project.icon} ` : ''}
                {project.name}
              </span>

              {project.description && (
                <span className="mission-card__desc">{project.description}</span>
              )}

              <div className="progress">
                <div
                  className="progress__bar"
                  style={{ width: `${project.progress * 100}%`, background: project.color }}
                />
              </div>

              <span className="mission-card__foot">
                <span className="mc-data">{t(`projectStatus.${project.status}`)}</span>
                <span className="mc-data">
                  {project.taskCompleted}/{project.taskTotal} · {formatPercent(project.progress)}
                </span>
              </span>

              {project.deadline && (
                <span className="mc-data mission-card__foot">
                  {t('project.deadline')} : {isoToDateInput(project.deadline)}
                  <span aria-hidden="true">{language === 'fr' ? '' : ''}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {composing && <ProjectComposer onClose={() => setComposing(false)} />}
    </div>
  )
}
