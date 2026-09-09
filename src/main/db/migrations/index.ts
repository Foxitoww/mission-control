import init001 from './001_init.sql?raw'
import profile002 from './002_profile.sql?raw'
import remembered003 from './003_remembered_sessions.sql?raw'
import type { Migration } from '../migrator'

/**
 * Registre des migrations, EN AJOUT SEUL.
 *
 * Une migration livrée n'est jamais modifiée : des bases existantes l'ont déjà
 * appliquée et ne la rejoueront pas. Toute correction passe par une nouvelle
 * migration.
 */
export const migrations: Migration[] = [
  { version: 1, name: 'init', sql: init001 },
  { version: 2, name: 'profile', sql: profile002 },
  { version: 3, name: 'remembered_sessions', sql: remembered003 }
]
