import type { Db } from '../db/connection'
import type { ContactSummary, ProjectRef } from '@shared/types/views'

interface ContactRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  notes: string | null
  color: string
  created_at: string
  updated_at: string
}

function toContact(row: ContactRow, projects: ProjectRef[]): ContactSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    notes: row.notes,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projects
  }
}

/**
 * Charge les projets liés de TOUS les contacts renvoyés en une seule requête
 * — même geste que `tagsByTask` dans tasks.repo.ts, pour la même raison :
 * éviter un aller-retour par contact.
 */
function projectsByContact(
  db: Db,
  userId: string,
  contactIds: string[]
): Map<string, ProjectRef[]> {
  const map = new Map<string, ProjectRef[]>()
  if (contactIds.length === 0) return map

  const placeholders = contactIds.map(() => '?').join(', ')
  const rows = db
    .prepare(
      // `p.user_id` est redondant avec la provenance des contactIds (déjà
      // filtrés par utilisateur), mais présent quand même : voir le
      // commentaire équivalent dans tasks.repo.ts::tagsByTask.
      `SELECT cp.contact_id, p.id, p.name, p.color
         FROM contact_projects cp
         JOIN projects p ON p.id = cp.project_id
        WHERE p.user_id = ? AND cp.contact_id IN (${placeholders})
        ORDER BY p.name`
    )
    .all(userId, ...contactIds) as {
    contact_id: string
    id: string
    name: string
    color: string
  }[]

  for (const row of rows) {
    const list = map.get(row.contact_id) ?? []
    list.push({ id: row.id, name: row.name, color: row.color })
    map.set(row.contact_id, list)
  }
  return map
}

function hydrate(db: Db, userId: string, rows: ContactRow[]): ContactSummary[] {
  const projects = projectsByContact(
    db,
    userId,
    rows.map((row) => row.id)
  )
  return rows.map((row) => toContact(row, projects.get(row.id) ?? []))
}

export const contactsRepo = {
  insert(
    db: Db,
    data: {
      id: string
      userId: string
      name: string
      email: string | null
      phone: string | null
      company: string | null
      notes: string | null
      color: string
      now: string
    }
  ): void {
    db.prepare(
      `INSERT INTO contacts (id, user_id, name, email, phone, company, notes, color,
                             created_at, updated_at)
       VALUES (@id, @userId, @name, @email, @phone, @company, @notes, @color, @now, @now)`
    ).run(data)
  },

  findById(db: Db, userId: string, id: string): ContactSummary | null {
    const row = db
      .prepare(
        `SELECT id, name, email, phone, company, notes, color, created_at, updated_at
           FROM contacts WHERE user_id = ? AND id = ?`
      )
      .get(userId, id) as ContactRow | undefined
    return row ? hydrate(db, userId, [row])[0]! : null
  },

  list(db: Db, userId: string): ContactSummary[] {
    const rows = db
      .prepare(
        `SELECT id, name, email, phone, company, notes, color, created_at, updated_at
           FROM contacts WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC`
      )
      .all(userId) as ContactRow[]
    return hydrate(db, userId, rows)
  },

  update(
    db: Db,
    userId: string,
    id: string,
    fields: Record<string, unknown>,
    now: string
  ): boolean {
    const columns = Object.keys(fields)
    if (columns.length === 0) return true

    const assignments = columns.map((column) => `${column} = @${column}`).join(', ')
    return (
      db
        .prepare(
          `UPDATE contacts SET ${assignments}, updated_at = @now WHERE id = @id AND user_id = @userId`
        )
        .run({ ...fields, now, id, userId }).changes > 0
    )
  },

  delete(db: Db, userId: string, id: string): boolean {
    return (
      db.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
    )
  },

  /** Remplace les projets liés — même geste que `tasksRepo.setTags`. */
  setProjects(db: Db, contactId: string, projectIds: string[]): void {
    db.prepare('DELETE FROM contact_projects WHERE contact_id = ?').run(contactId)
    if (projectIds.length === 0) return

    const insert = db.prepare(
      'INSERT OR IGNORE INTO contact_projects (contact_id, project_id) VALUES (?, ?)'
    )
    for (const projectId of projectIds) insert.run(contactId, projectId)
  },

  /** Les projets fournis appartiennent-ils TOUS à cet utilisateur ? */
  projectsBelongToUser(db: Db, userId: string, projectIds: string[]): boolean {
    if (projectIds.length === 0) return true
    const placeholders = projectIds.map(() => '?').join(', ')
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM projects WHERE user_id = ? AND id IN (${placeholders})`)
      .get(userId, ...projectIds) as { n: number }
    return row.n === projectIds.length
  }
}
