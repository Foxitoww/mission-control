import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ContactSummary } from '@shared/types/views'
import { Avatar } from '@renderer/components/Avatar'
import { Button } from '@renderer/components/Button'
import { QueryState } from '@renderer/components/QueryState'
import { useToast } from '@renderer/components/Toast'
import { useI18n } from '@renderer/i18n'
import { ContactComposer } from '@renderer/features/contacts/ContactComposer'
import { useContacts, useDeleteContact } from '@renderer/features/contacts/queries'
import '@renderer/features/missions/missions.css'
import './contacts.css'

/**
 * CARNET DE CONTACTS — local (V1 hors-ligne, voir contacts.service.ts).
 *
 * Une liste, pas un tableau : un contact n'a pas de statut ni de colonne, il
 * n'existe qu'une seule vue de lui. Chaque carte porte ses coordonnées et les
 * apps auxquelles il est lié, cliquables pour y aller directement.
 */
export function ContactsPage(): JSX.Element {
  const { t } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()

  const { data: contacts = [], isPending, isError, refetch } = useContacts()
  const deleteContact = useDeleteContact()

  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState<ContactSummary | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  async function remove(contact: ContactSummary): Promise<void> {
    try {
      await deleteContact.mutateAsync({ id: contact.id })
      toast.success(t('toast.contactDeleted'))
    } catch {
      toast.error(t('toast.failed'))
    } finally {
      setConfirmingId(null)
    }
  }

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <span className="mc-label">Address book</span>
          <h1 className="page__title">{t('nav.contacts')}</h1>
        </div>
        <Button type="button" onClick={() => setComposing(true)}>
          + {t('contact.new')}
        </Button>
      </header>

      <QueryState
        isPending={isPending}
        isError={isError}
        isEmpty={contacts.length === 0}
        retry={() => void refetch()}
        emptyTitle={t('contact.emptyTitle')}
        emptyHint={t('contact.emptyHint')}
      >
        <ul className="contact-grid">
          {contacts.map((contact) => (
            <li key={contact.id} className="contact-card">
              <div className="contact-card__head">
                <Avatar
                  user={{ displayName: contact.name, avatar: null, accentColor: contact.color }}
                  size={40}
                />
                <div className="contact-card__id">
                  <span className="contact-card__name">{contact.name}</span>
                  {contact.company && (
                    <span className="contact-card__company">{contact.company}</span>
                  )}
                </div>
              </div>

              {(contact.email || contact.phone) && (
                <div className="contact-card__coords">
                  {contact.email && <span className="mc-data">{contact.email}</span>}
                  {contact.phone && <span className="mc-data">{contact.phone}</span>}
                </div>
              )}

              {contact.notes && <p className="contact-card__notes">{contact.notes}</p>}

              {contact.projects.length > 0 && (
                <div className="contact-card__projects">
                  {contact.projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      className="contact-card__project"
                      style={{ borderColor: project.color }}
                      onClick={() => navigate(`/app/${project.id}`)}
                    >
                      {project.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="contact-card__actions">
                <button
                  type="button"
                  className="mc-btn mc-btn--ghost"
                  onClick={() => setEditing(contact)}
                >
                  {t('common.edit')}
                </button>
                {confirmingId === contact.id ? (
                  <>
                    <button
                      type="button"
                      className="mc-btn mc-btn--danger"
                      onClick={() => void remove(contact)}
                    >
                      {t('common.confirm')}
                    </button>
                    <button
                      type="button"
                      className="mc-btn mc-btn--ghost"
                      onClick={() => setConfirmingId(null)}
                    >
                      {t('common.cancel')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="mc-btn mc-btn--ghost"
                    onClick={() => setConfirmingId(contact.id)}
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </QueryState>

      {composing && <ContactComposer onClose={() => setComposing(false)} />}
      {editing && <ContactComposer contact={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
