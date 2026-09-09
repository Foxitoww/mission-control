import type { ReactNode } from 'react'
import { useI18n } from '@renderer/i18n'
import './query-state.css'

interface QueryStateProps {
  isPending: boolean
  isError: boolean
  /** Vrai quand la requête a abouti mais n'a rien renvoyé. */
  isEmpty?: boolean
  retry?: () => void
  emptyTitle?: string
  emptyHint?: string
  /** Hauteur de l'ossature, pour éviter que la page ne saute au chargement. */
  skeletonHeight?: number
  skeletonCount?: number
  children: ReactNode
}

/**
 * Les quatre états d'un écran piloté par une requête (§37).
 *
 * Sept pages répétaient « chargement » et « vide » mais AUCUNE ne traitait
 * l'erreur : une requête en échec laissait une ossature qui tournait
 * indéfiniment, sans jamais dire que quelque chose s'était mal passé ni offrir
 * de réessayer. Rassembler les quatre états ici rend l'oubli impossible.
 */
export function QueryState({
  isPending,
  isError,
  isEmpty = false,
  retry,
  emptyTitle,
  emptyHint,
  skeletonHeight = 44,
  skeletonCount = 3,
  children
}: QueryStateProps): JSX.Element {
  const { t } = useI18n()

  if (isPending) {
    return (
      <div className="query-state__skeletons" aria-busy="true" aria-live="polite">
        <span className="visually-hidden">{t('common.loading')}</span>
        {Array.from({ length: skeletonCount }, (_, index) => (
          <div key={index} className="skeleton" style={{ height: skeletonHeight }} />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="state state--error" role="alert">
        <span className="state__title">{t('state.errorTitle')}</span>
        <span>{t('state.errorHint')}</span>
        {retry && (
          <button type="button" className="mc-btn mc-btn--secondary" onClick={retry}>
            {t('common.retry')}
          </button>
        )}
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="state">
        <span className="state__title">{emptyTitle ?? t('state.emptyTitle')}</span>
        {emptyHint && <span>{emptyHint}</span>}
      </div>
    )
  }

  return <>{children}</>
}
