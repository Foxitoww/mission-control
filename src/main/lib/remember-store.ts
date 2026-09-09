import { app } from 'electron'
import { join } from 'node:path'
import { fileStore, type RememberStore } from '../services/remember.service'

let instance: RememberStore | null = null

/**
 * Emplacement du jeton « se souvenir de moi », à côté de la base mais dans un
 * fichier distinct : supprimer l'un ou l'autre révoque la session.
 */
export function rememberStore(): RememberStore {
  if (!instance) instance = fileStore(join(app.getPath('userData'), 'session.json'))
  return instance
}
