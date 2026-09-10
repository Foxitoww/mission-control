/**
 * État de la mise à jour, partagé main ↔ renderer.
 *
 * `unsupported` n'est pas une erreur : en développement, ou dans une copie non
 * empaquetée, il n'existe simplement aucun canal de mise à jour. L'interface
 * doit le dire calmement plutôt que d'afficher un échec.
 */
export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'ready'
  | 'error'
  | 'unsupported'

export interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  latestVersion?: string
  /** Progression du téléchargement, 0–100. */
  percent?: number
  reason?: 'dev'
  /**
   * Page GitHub de la version concernée (ou la liste des versions à défaut).
   *
   * Toujours renseignée après un `check` : c'est le repli quand le
   * téléchargement automatique n'est pas possible — en développement, ou si
   * l'installeur n'est pas signé et que l'utilisateur préfère le récupérer
   * lui-même.
   */
  releaseUrl?: string
}
