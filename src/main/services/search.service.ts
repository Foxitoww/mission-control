import { z } from 'zod'
import type { Db } from '../db/connection'
import { tasksRepo } from '../repositories/tasks.repo'
import { projectsRepo } from '../repositories/projects.repo'
import { tagsRepo } from '../repositories/tags.repo'
import { session } from './session.service'
import { parseOrThrow } from '../lib/validate'
import { taskFilterSchema } from '@shared/schemas/task.schema'
import type { SearchResults } from '@shared/types/views'

const searchInputSchema = z.object({
  query: z.string().trim().max(200).default('')
})

/**
 * Recherche globale sur les tâches, projets et tags.
 *
 * Implémentée avec `LIKE` plutôt qu'avec FTS5. FTS5 est disponible dans SQLite
 * et serait plus rapide, mais il exige une table miroir et des déclencheurs pour
 * la garder synchronisée — de la complexité permanente pour un gain qui ne se
 * mesure qu'au-delà de plusieurs dizaines de milliers de lignes. Optimiser
 * seulement quand c'est nécessaire et mesurable (§32) ; le passage à FTS5 est
 * une modification locale à ce fichier et à une migration.
 */
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, '\\$&')}%`
}

export const searchService = {
  run(db: Db, input: unknown): SearchResults {
    const userId = session.requireUserId()
    const { query } = parseOrThrow(searchInputSchema, input)

    // Une recherche vide ne doit pas renvoyer toute la base : elle ne renvoie rien.
    if (query.length === 0) return { tasks: [], projects: [], tags: [] }

    const pattern = likePattern(query)

    return {
      tasks: tasksRepo.list(db, userId, parseOrThrow(taskFilterSchema, { search: query }), 25),
      projects: projectsRepo.search(db, userId, pattern, 10),
      tags: tagsRepo.search(db, userId, pattern, 10)
    }
  }
}
