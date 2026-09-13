import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ProjectStatus } from '@shared/types/domain'
import { QueryState } from '@renderer/components/QueryState'
import { useProjects } from '@renderer/features/missions/queries'
import { ProjectComposer } from '@renderer/features/missions/ProjectComposer'
import { useI18n } from '@renderer/i18n'
import './library.css'

/**
 * BIBLIOTHÈQUE D'APPS — l'accueil.
 *
 * Chaque app (un « projet » côté domaine) est une carte MINIMALE : une icône,
 * un nom. Rien d'autre. La progression, les tâches, l'échéance, le tableau —
 * tout cela vit dans la vue de détail, au clic. La grille doit se parcourir
 * comme un lanceur d'applications, pas comme un tableau de bord.
 */

/** Traitement visuel d'une carte selon le statut de l'app. */
interface CardTreatment {
  /** Classe modificatrice ajoutée à `.app-card`, ou `''`. */
  className: string
  /** Vrai quand l'état se lit dans le style : il faut alors l'annoncer aussi. */
  announce: boolean
}

/**
 * ACTIVE reste nu — c'est le cas courant, toute décoration y serait du bruit
 * répété sur chaque carte. PAUSED s'atténue (et se ravive au survol) : une app
 * en pause n'est pas une destination du moment. COMPLETED garde sa pleine
 * présence mais reçoit le liseré vert : on l'ouvre encore pour relire, ce
 * n'est pas un échec à masquer. ARCHIVED est déjà filtré avant la grille ; on
 * le traite quand même, par sécurité, comme PAUSED.
 */
function cardTreatment(status: ProjectStatus): CardTreatment {
  switch (status) {
    case 'PAUSED':
    case 'ARCHIVED':
      return { className: 'app-card--muted', announce: true }
    case 'COMPLETED':
      return { className: 'app-card--done', announce: true }
    case 'ACTIVE':
    default:
      return { className: '', announce: false }
  }
}

export function LibraryPage(): JSX.Element {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { data: projects = [], isPending, isError, refetch } = useProjects()
  const [composing, setComposing] = useState(false)

  // Les apps archivées ne sont pas des destinations courantes : on les tient
  // hors de la bibliothèque, elles restent atteignables par la recherche.
  const shown = projects.filter((project) => project.status !== 'ARCHIVED')
  const active = shown.filter((p) => p.status === 'ACTIVE').length
  const paused = shown.filter((p) => p.status === 'PAUSED').length

  return (
    <div className="library">
      <header className="library__head">
        <h1 className="library__title">{t('library.title')}</h1>
        <span className="library__count mc-data">
          {String(active).padStart(2, '0')} {t('library.active')}
          {paused > 0 && ` · ${String(paused).padStart(2, '0')} ${t('library.paused')}`}
        </span>
      </header>

      <QueryState
        isPending={isPending}
        isError={isError}
        isEmpty={false}
        retry={() => void refetch()}
        skeletonHeight={132}
        skeletonCount={4}
      >
        <div className="app-grid">
          {shown.map((project) => {
            const treat = cardTreatment(project.status)
            return (
              <button
                key={project.id}
                type="button"
                className={`app-card${treat.className ? ` ${treat.className}` : ''}`}
                style={{ ['--card-accent' as string]: project.color }}
                onClick={() => navigate(`/app/${project.id}`)}
              >
                <span className="app-card__icon" aria-hidden="true">
                  {project.icon ?? project.name.slice(0, 1).toUpperCase()}
                  {/* Pastille façon Discord : une tâche ou un message est
                      apparu depuis la dernière visite de l'onglet concerné. */}
                  {(project.hasNewTasks || project.hasUnreadChat) && (
                    <span className="badge-dot" aria-hidden="true" />
                  )}
                </span>
                <span className="app-card__name">{project.name}</span>
                {treat.announce && (
                  <span className="visually-hidden">{t(`projectStatus.${project.status}`)}</span>
                )}
                {(project.hasNewTasks || project.hasUnreadChat) && (
                  <span className="visually-hidden">{t('library.hasNew')}</span>
                )}
              </button>
            )
          })}

          <button
            type="button"
            className="app-card app-card--new"
            onClick={() => setComposing(true)}
          >
            <span className="app-card__plus" aria-hidden="true">
              +
            </span>
            <span className="app-card__name">{t('library.newApp')}</span>
          </button>
        </div>
      </QueryState>

      {composing && <ProjectComposer onClose={() => setComposing(false)} />}
    </div>
  )
}
