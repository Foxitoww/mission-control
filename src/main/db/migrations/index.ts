import init001 from './001_init.sql?raw'
import type { Migration } from '../migrator'

/**
 * Registre des migrations, EN AJOUT SEUL.
 *
 * Une migration livrée n'est jamais modifiée : des bases existantes l'ont déjà
 * appliquée et ne la rejoueront pas. Toute correction passe par une nouvelle
 * migration.
 */
export const migrations: Migration[] = [{ version: 1, name: 'init', sql: init001 }]
