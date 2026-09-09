import { safeStorage } from 'electron'

/**
 * Scellement de la clé de données par le SYSTÈME (couche facultative, ADR-007).
 *
 * Sous Windows, `safeStorage` s'appuie sur DPAPI : le secret n'est descellable
 * que par le compte Windows qui l'a scellé, sur cette machine. Copier le fichier
 * de comptes ailleurs le rend inexploitable.
 *
 * Ce que cela protège : disque volé, fichier copié, autre utilisateur du poste,
 * sauvegarde cloud. Ce que cela NE protège PAS : un programme s'exécutant sous
 * la session Windows de l'utilisateur — pour lui, DPAPI descelle tout aussi
 * volontiers. C'est précisément pourquoi cette couche est optionnelle et liée à
 * « se souvenir de moi », tandis que la clé dérivée du mot de passe reste la
 * protection par défaut.
 */
export const osKeyStore = {
  available(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      // Hors d'Electron (tests) ou sur un système sans trousseau disponible.
      return false
    }
  },

  seal(dek: Buffer): Buffer | null {
    if (!osKeyStore.available()) return null
    try {
      return safeStorage.encryptString(dek.toString('base64'))
    } catch {
      return null
    }
  },

  open(sealed: Buffer): Buffer | null {
    if (!osKeyStore.available()) return null
    try {
      return Buffer.from(safeStorage.decryptString(sealed), 'base64')
    } catch {
      return null
    }
  }
}
