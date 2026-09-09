import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * AUDIT STRUCTUREL de l'isolation (ADR-003, §33).
 *
 * Les tests d'isolation prouvent que le code ACTUEL cloisonne bien les
 * utilisateurs. Celui-ci vérifie autre chose : que toute requête écrite DEMAIN
 * sur une table possédée porte un filtre `user_id`. C'est une garantie sur la
 * FORME du code, la seule qui tienne quand quelqu'un ajoute une méthode six
 * mois plus tard.
 *
 * Il lit les sources, pas la base : c'est une relecture automatisée.
 */

/** Tables dont chaque ligne appartient directement à un utilisateur. */
const OWNED_TABLES = ['tasks', 'projects', 'tags', 'goals', 'settings']

/**
 * Tables possédées TRANSITIVEMENT : leur propriétaire se déduit du parent —
 * `subtasks` par `task_id`, `task_tags` par ses deux extrémités. Leurs requêtes
 * sont légitimement dépourvues de `user_id`, et le service vérifie la propriété
 * du parent avant d'y toucher (voir subtasks.service.ts).
 */
const TRANSITIVE_TABLES = ['subtasks', 'task_tags']

const SOURCE_DIRS = ['src/main/repositories', 'src/main/services']

interface Statement {
  file: string
  sql: string
}

function sourceFiles(): { file: string; source: string }[] {
  return SOURCE_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => ({ file: join(dir, name), source: readFileSync(join(dir, name), 'utf-8') }))
  )
}

/**
 * Fragments de base : des débuts de requête auxquels chaque appelant ajoute son
 * `WHERE`. Ils n'ont donc pas de `user_id` en propre — d'où leur DÉVELOPPEMENT
 * avant l'audit, plutôt qu'une exemption. Exempter un fragment reviendrait à ne
 * jamais auditer les requêtes qui l'utilisent, c'est-à-dire les plus nombreuses.
 */
function collectFragments(): Map<string, string> {
  const fragments = new Map<string, string>()

  for (const { source } of sourceFiles()) {
    for (const match of source.matchAll(/const (SELECT_\w+) = `([^`]*)`/g)) {
      fragments.set(match[1] as string, match[2] as string)
    }
  }

  return fragments
}

function collectStatements(fragments: Map<string, string>): Statement[] {
  const statements: Statement[] = []
  const fragmentBodies = new Set(fragments.values())

  for (const { file, source } of sourceFiles()) {
    const literals = source.match(/`[^`]*`|'[^'\n]*'/g) ?? []

    for (const literal of literals) {
      const raw = literal.slice(1, -1)
      // La définition du fragment elle-même n'est pas une requête exécutée.
      if (fragmentBodies.has(raw)) continue

      // Développement : `${SELECT_TASK} WHERE …` devient la requête complète.
      let sql = raw
      for (const [name, body] of fragments) sql = sql.split(`\${${name}}`).join(body)

      if (/\b(SELECT|UPDATE|DELETE|INSERT)\b/i.test(sql)) statements.push({ file, sql })
    }
  }

  return statements
}

function tableReference(sql: string, table: string): boolean {
  return new RegExp(`\\b(FROM|INTO|UPDATE|JOIN)\\s+${table}\\b`, 'i').test(sql)
}

const fragments = collectFragments()
const statements = collectStatements(fragments)

describe('audit des requêtes SQL', () => {
  it('trouve des fragments et des requêtes à auditer', () => {
    // Si l'extraction cassait, tous les tests suivants passeraient à vide.
    expect(fragments.size).toBeGreaterThan(0)
    expect(statements.length).toBeGreaterThan(20)
  })

  it('toute requête sur une table possédée filtre par user_id', () => {
    const offenders = statements
      .filter((statement) => OWNED_TABLES.some((table) => tableReference(statement.sql, table)))
      .filter((statement) => !/user_id/i.test(statement.sql))
      .map((statement) => `${statement.file} :: ${statement.sql.trim().slice(0, 90)}`)

    expect(offenders).toEqual([])
  })

  it('les tables transitives ne sont touchées que là où le parent est vérifié', () => {
    const transitive = statements.filter((statement) =>
      TRANSITIVE_TABLES.some((table) => tableReference(statement.sql, table))
    )

    expect(transitive.length).toBeGreaterThan(0)

    // `tags.repo.ts` compte les usages sous un WHERE user_id ; les autres
    // passent par la tâche parente, dont la propriété est vérifiée en amont.
    // backup.service.ts les atteint par jointure sur les tâches de
    // l'utilisateur ; tags.repo.ts compte les usages sous un WHERE user_id.
    const allowed = [
      'subtasks.repo.ts',
      'tasks.repo.ts',
      'subtasks.service.ts',
      'tags.repo.ts',
      'backup.service.ts'
    ]
    const misplaced = transitive
      .filter((statement) => !allowed.some((name) => statement.file.endsWith(name)))
      .map((statement) => statement.file)

    expect([...new Set(misplaced)]).toEqual([])
  })

  it('aucune valeur utilisateur n’est concaténée dans du SQL', () => {
    // Les seules interpolations tolérées produisent des séries de « ? » ou des
    // noms de colonnes issus du code, jamais une donnée saisie.
    const allowed = [
      'placeholders',
      'assignments',
      'filter',
      'sql',
      'order',
      'where',
      'columns',
      'column',
      'table',
      'migration.version',
      'PUBLIC_COLUMNS',
      'ACTIVE_STATUSES',
      'LOCAL_DAY',
      ".map(() => '?')"
    ]

    const suspicious = statements.flatMap((statement) =>
      (statement.sql.match(/\$\{([^}]+)\}/g) ?? [])
        .map((raw) => raw.slice(2, -1).trim())
        .filter((expression) => !allowed.some((entry) => expression.includes(entry)))
        .map((expression) => `${statement.file} :: \${${expression}}`)
    )

    expect(suspicious).toEqual([])
  })
})
