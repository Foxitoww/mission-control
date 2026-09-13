import accounts001 from './001_accounts.sql?raw'
import accounts002 from './002_direct_messages.sql?raw'
import type { Migration } from '../../migrator'

/** Migrations de la base des comptes. En ajout seul. */
export const accountMigrations: Migration[] = [
  { version: 1, name: 'accounts', sql: accounts001 },
  { version: 2, name: 'direct_messages', sql: accounts002 }
]
