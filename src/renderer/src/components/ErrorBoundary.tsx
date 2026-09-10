import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Filet de sécurité contre les plantages de rendu (§31).
 *
 * Sans lui, une exception dans n'importe quel composant démonte l'arbre React
 * en entier et laisse une FENÊTRE BLANCHE — sans message, sans issue, sans
 * indice. C'est le pire état possible pour une application de bureau : rien ne
 * dit à l'utilisateur si ses données sont perdues.
 *
 * Doit rester une classe : React n'expose toujours pas `componentDidCatch` aux
 * composants fonction.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Journalisé côté renderer, pas affiché : une pile d'appels ne dit rien à
    // l'utilisateur et peut contenir des chemins de fichiers.
    console.error('[render]', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash">
        <span className="mc-label">System fault</span>
        <h1 className="crash__title">L’interface a rencontré une erreur</h1>

        {/* Le point qui compte le plus pour quelqu'un qui vient de perdre son
            écran : ses données sont intactes. */}
        <p className="crash__body">
          Tes données sont intactes : elles vivent dans le coffre chiffré, pas dans cette fenêtre.
          Recharger l’interface suffit dans la plupart des cas.
        </p>

        <div className="crash__actions">
          <button
            type="button"
            className="mc-btn mc-btn--primary"
            onClick={() => window.location.reload()}
          >
            Recharger l’interface
          </button>
          <button
            type="button"
            className="mc-btn mc-btn--ghost"
            onClick={() => this.setState({ error: null })}
          >
            Réessayer sans recharger
          </button>
        </div>

        {/* Repliée par défaut : utile pour un rapport de bogue, invisible sinon. */}
        <details className="crash__details">
          <summary>Détail technique</summary>
          <pre>{error.message}</pre>
        </details>
      </div>
    )
  }
}
