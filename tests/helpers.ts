import type { RememberStore } from '@main/services/remember.service'

/**
 * Stockage de jeton en mémoire.
 *
 * `RememberStore` a été extrait en interface précisément pour cela : les tests
 * n'ont besoin ni du disque, ni d'un dossier temporaire à nettoyer, et la
 * logique de session mémorisée reste testable sans Electron.
 */
export function memoryStore(): RememberStore & { peek: () => unknown } {
  let value: { id: string; token: string } | null = null

  return {
    read: () => value,
    write: (next) => {
      value = next
    },
    clear: () => {
      value = null
    },
    peek: () => value
  }
}
