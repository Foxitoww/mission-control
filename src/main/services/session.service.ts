import { app } from 'electron'
import { join } from 'node:path'
import { AppError, AppErrorCode } from '@shared/errors'
import type { Db } from '../db/connection'
import { flushVault, closeVault, type OpenVault } from '../security/vault'

/**
 * Session locale — détient l'identité de l'utilisateur, son coffre ouvert et la
 * clé qui le déchiffre.
 *
 * Ces trois éléments ont exactement la même durée de vie : ouverte à la
 * connexion, effacée à la déconnexion. Les séparer inviterait un jour à laisser
 * traîner une clé sans session, ou un coffre sans clé.
 *
 * Rien n'est persisté ici. La clé de chiffrement n'existe qu'en mémoire du
 * processus main, et elle est effacée à la fermeture (ADR-007).
 *
 * Ce module reste le pivot d'ADR-003 : aucun canal IPC n'accepte de userId,
 * tous lisent ici.
 */
interface ActiveSession {
  userId: string
  vault: OpenVault
  dek: Buffer
}

let active: ActiveSession | null = null

/** Hors d'Electron (tests), `app` n'existe pas — l'absence vaut « non empaqueté ». */
function isPackaged(): boolean {
  try {
    return app.isPackaged
  } catch {
    return false
  }
}

/**
 * Emplacement du coffre d'un utilisateur, dans le dossier de données de l'OS.
 *
 * `MC_VAULT_DIR` redirige les coffres vers un dossier jetable — utilisé par les
 * tests de chiffrement, qui exercent le vrai scellement sur de vrais fichiers.
 * La bascule est refusée dans une application empaquetée : en production, les
 * données n'ont qu'un emplacement possible.
 */
export function vaultPath(userId: string): string {
  const override = process.env['MC_VAULT_DIR']
  if (override && !isPackaged()) return join(override, `${userId}.mcv`)
  return join(app.getPath('userData'), 'vaults', `${userId}.mcv`)
}

export const session = {
  start(userId: string, vault: OpenVault, dek: Buffer): void {
    active = { userId, vault, dek }
  },

  /**
   * Ferme la session : le coffre est écrit une dernière fois, refermé, et la
   * clé est ÉCRASÉE en mémoire.
   *
   * `dek.fill(0)` n'est pas décoratif : un Buffer Node conserve son contenu
   * jusqu'à ce que le ramasse-miettes le récupère, à un moment indéterminé.
   * Sans cet effacement, la clé pourrait subsister dans la mémoire du processus
   * — et donc dans un fichier de vidage mémoire — longtemps après la
   * déconnexion.
   */
  clear(): void {
    if (!active) return
    try {
      flushVault(active.vault, active.dek)
      closeVault(active.vault)
    } finally {
      active.dek.fill(0)
      active = null
    }
  },

  get userId(): string | null {
    return active?.userId ?? null
  },

  /** À utiliser dans tout handler IPC nécessitant une authentification. */
  requireUserId(): string {
    if (!active) throw new AppError(AppErrorCode.AUTH_REQUIRED, 'Aucune session active')
    return active.userId
  },

  /** Base du coffre déchiffré. Inaccessible hors session, par construction. */
  requireVault(): Db {
    if (!active) throw new AppError(AppErrorCode.AUTH_REQUIRED, 'Aucune session active')
    return active.vault.db
  },

  /** Réécrit le coffre chiffré. Appelé après chaque écriture. */
  persist(): void {
    if (active) flushVault(active.vault, active.dek)
  },

  /** Ferme le coffre SANS l'écrire — utilisé après suppression du compte. */
  discard(): void {
    if (!active) return
    closeVault(active.vault)
    active.dek.fill(0)
    active = null
  }
}
