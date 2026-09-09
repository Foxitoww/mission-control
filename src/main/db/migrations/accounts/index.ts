import accounts001 from './001_accounts.sql?raw'
import type { Migration } from '../../migrator'

/** Migrations de la base des comptes. En ajout seul. */
export const accountMigrations: Migration[] = [
  { version: 1, name: 'accounts', sql: accounts001 }
]
