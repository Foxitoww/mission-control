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
}
