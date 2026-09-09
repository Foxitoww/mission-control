import vault001 from './001_vault.sql?raw'
import type { Migration } from '../../migrator'

/**
 * Migrations du coffre. En ajout seul.
 *
 * Rejouées à l'OUVERTURE du coffre, donc à la connexion : une nouvelle version
 * de l'application ne peut pas mettre à niveau un coffre qu'elle ne sait pas
 * encore déchiffrer.
 */
export const vaultMigrations: Migration[] = [{ version: 1, name: 'vault', sql: vault001 }]
