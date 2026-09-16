import { useState, type FormEvent } from 'react'
import { ACCENT_COLORS } from '@shared/types/domain'
import type { ContactSummary } from '@shared/types/views'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { TextField } from '@renderer/components/TextField'
import { useI18n } from '@renderer/i18n'
import { IpcError } from '@renderer/lib/ipc'
import { useProjects } from '@renderer/features/missions/queries'
import { useCreateContact, useUpdateContact } from './queries'
import '@renderer/features/missions/missions.css'

/**
 * Création ou modification d'un contact.
 *
 * Même formulaire pour les deux : `contact` présent bascule en modification
 * (mêmes champs pré-remplis), absent en création — comme TaskEditor pour les
 * tâches.
 */
export function ContactComposer({
  contact,
  onClose
}: {
  contact?: ContactSummary
  onClose: () => void
}): JSX.Element {
  const { t, tError } = useI18n()
  const { data: projects = [] } = useProjects()
  const create = useCreateContact()
  const update = useUpdateContact()

  const [name, setName] = useState(contact?.name ?? '')
  const [email, setEmail] = useState(contact?.email ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [company, setCompany] = useState(contact?.company ?? '')
  const [notes, setNotes] = useState(contact?.notes ?? '')
  const [color, setColor] = useState<string>(contact?.color ?? ACCENT_COLORS[0])
  const [projectIds, setProjectIds] = useState<string[]>(
    contact?.projects.map((project) => project.id) ?? []
  )
  const [error, setError] = useState<string | null>(null)

  const busy = create.isPending || update.isPending

  function toggleProject(id: string): void {
    setProjectIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    )
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)

    const payload = {
      name,
      email: email.trim() === '' ? null : email.trim(),
      phone: phone.trim() === '' ? null : phone.trim(),
      company: company.trim() === '' ? null : company.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
      color: color as (typeof ACCENT_COLORS)[number],
      projectIds
    }

    try {
      if (contact) await update.mutateAsync({ id: contact.id, ...payload })
      else await create.mutateAsync(payload)
      onClose()
    } catch (caught) {
      setError(tError(caught instanceof IpcError ? caught.key : 'UNKNOWN'))
    }
  }

  return (
    <Modal
      title={contact ? t('contact.edit') : t('contact.new')}
      label="Contacts"
      onClose={onClose}
    >
      <form className="editor" onSubmit={submit} noValidate>
        {error && (
          <div className="mc-alert" role="alert">
            <span>{error}</span>
          </div>
        )}

        <TextField
          label={t('contact.name')}
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />

        <div className="editor__grid">
          <TextField
            label={t('contact.email')}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label={t('contact.phone')}
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>

        <TextField
          label={t('contact.company')}
          value={company}
          onChange={(event) => setCompany(event.target.value)}
        />

        <div className="editor__row">
          <label className="mc-field__label" htmlFor="contact-notes">
            {t('contact.notes')}
          </label>
          <textarea
            id="contact-notes"
            className="editor__textarea"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        <div className="editor__row">
          <span className="mc-field__label">{t('profile.accent')}</span>
          <div className="mc-swatches" role="group" aria-label={t('profile.accent')}>
            {ACCENT_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                className="mc-swatch"
                style={{ background: value }}
                aria-pressed={color === value}
                aria-label={value}
                onClick={() => setColor(value)}
              />
            ))}
          </div>
        </div>

        {projects.length > 0 && (
          <div className="editor__row">
            <span className="mc-field__label">{t('contact.linkedProjects')}</span>
            <div className="editor__tags" role="group" aria-label={t('contact.linkedProjects')}>
              {projects.map((project) => {
                const selected = projectIds.includes(project.id)
                return (
                  <button
                    key={project.id}
                    type="button"
                    className="tag-toggle"
                    aria-pressed={selected}
                    disabled={busy}
                    style={
                      selected
                        ? { borderColor: project.color, background: `${project.color}22` }
                        : undefined
                    }
                    onClick={() => toggleProject(project.id)}
                  >
                    {project.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mc-modal__actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
