import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@renderer/components/Button'
import { QueryState } from '@renderer/components/QueryState'
import { useProjects } from '@renderer/features/missions/queries'
import { ProjectComposer } from '@renderer/features/missions/ProjectComposer'
import { useI18n } from '@renderer/i18n'
import { formatPercent, isoToDateInput } from '@renderer/lib/format'
import '@renderer/features/missions/missions.css'

export function MissionsPage(): JSX.Element {
  const { t, language } = useI18n()
  const navigate = useNavigate()
  const { data: projects = [], isPending, isError, refetch } = useProjects()
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

      <QueryState
        isPending={isPending}
        isError={isError}
        isEmpty={projects.length === 0}
        retry={() => void refetch()}
        emptyTitle={t('project.emptyTitle')}
        emptyHint={t('project.emptyHint')}
        skeletonHeight={130}
        skeletonCount={2}
      >
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
      </QueryState>

      {composing && <ProjectComposer onClose={() => setComposing(false)} />}
    </div>
  )
}
