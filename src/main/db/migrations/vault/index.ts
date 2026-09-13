import vault001 from './001_vault.sql?raw'
import vault002 from './002_task_comments.sql?raw'
import vault003 from './003_task_progress.sql?raw'
import vault004 from './004_chat_messages.sql?raw'
import vault005 from './005_project_activity_seen.sql?raw'
import type { Migration } from '../../migrator'

/**
 * Migrations du coffre. En ajout seul.
 *
 * Rejouées à l'OUVERTURE du coffre, donc à la connexion : une nouvelle version
 * de l'application ne peut pas mettre à niveau un coffre qu'elle ne sait pas
 * encore déchiffrer.
 */
export const vaultMigrations: Migration[] = [
  { version: 1, name: 'vault', sql: vault001 },
  { version: 2, name: 'task_comments', sql: vault002 },
  { version: 3, name: 'task_progress', sql: vault003 },
  { version: 4, name: 'chat_messages', sql: vault004 },
  { version: 5, name: 'project_activity_seen', sql: vault005 }
]
