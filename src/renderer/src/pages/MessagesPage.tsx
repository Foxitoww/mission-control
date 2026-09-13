import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Avatar } from '@renderer/components/Avatar'
import { Button } from '@renderer/components/Button'
import { Modal } from '@renderer/components/Modal'
import { QueryState } from '@renderer/components/QueryState'
import { useToast } from '@renderer/components/Toast'
import { useAuth } from '@renderer/features/auth/AuthProvider'
import { useI18n } from '@renderer/i18n'
import { formatRelativeTime } from '@renderer/lib/format'
import { unwrap } from '@renderer/lib/ipc'
import { useQuery } from '@tanstack/react-query'
import type { PublicUser } from '@shared/types/domain'
import {
  useConversations,
  useMessageThread,
  useSendMessage,
  useMarkMessagesSeen
} from '@renderer/features/messages/queries'
import './messages.css'

/**
 * MESSAGERIE PRIVÉE — chiffrée de bout en bout entre deux comptes.
 *
 * Deux volets, comme un client de messagerie classique : la liste des
 * conversations à gauche, le fil choisi à droite. Contrairement au chat
 * général d'une app (AppChat), qui traverse tout un compte, une conversation
 * ici est toujours entre exactement deux personnes.
 */
export function MessagesPage(): JSX.Element {
  const { t, language } = useI18n()
  const toast = useToast()
  const { user } = useAuth()

  const { data: conversations = [], isPending, isError, refetch } = useConversations()
  const [selected, setSelected] = useState<PublicUser | null>(null)
  const [picking, setPicking] = useState(false)

  const otherUserId = selected?.id ?? null
  const { data: thread = [] } = useMessageThread(otherUserId)
  const sendMessage = useSendMessage()
  const markSeen = useMarkMessagesSeen()

  const selectedConversation = conversations.find((c) => c.user.id === otherUserId)

  // Éteint la pastille dès l'ouverture du fil — jamais en arrière-plan (même
  // geste que markTasksSeen/markChatSeen sur une app, voir AppPage.tsx).
  useEffect(() => {
    if (otherUserId && selectedConversation?.hasUnread) {
      markSeen.mutate({ otherUserId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherUserId, selectedConversation?.hasUnread])

  const [draft, setDraft] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread.length])

  async function send(): Promise<void> {
    const body = draft.trim()
    if (body === '' || !otherUserId || sendMessage.isPending) return
    try {
      await sendMessage.mutateAsync({ recipientId: otherUserId, body })
      setDraft('')
    } catch {
      toast.error(t('toast.failed'))
    }
  }

  function onComposeKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  function openConversation(candidate: PublicUser): void {
    setSelected(candidate)
    setPicking(false)
  }

  return (
    <div className="messages">
      <aside className="messages__list">
        <div className="messages__list-head">
          <h1 className="messages__title">{t('messages.title')}</h1>
          <Button type="button" variant="secondary" onClick={() => setPicking(true)}>
            + {t('messages.newMessage')}
          </Button>
        </div>

        <QueryState isPending={isPending} isError={isError} retry={() => void refetch()}>
          {conversations.length === 0 ? (
            <p className="messages__empty">{t('messages.noConversations')}</p>
          ) : (
            <ul className="messages__conversations">
              {conversations.map((conversation) => (
                <li key={conversation.user.id}>
                  <button
                    type="button"
                    className={`messages__conversation${
                      conversation.user.id === otherUserId ? ' messages__conversation--on' : ''
                    }`}
                    onClick={() => openConversation(conversation.user)}
                  >
                    <span className="messages__conversation-avatar">
                      <Avatar user={conversation.user} size={36} />
                      {conversation.hasUnread && <span className="badge-dot" aria-hidden="true" />}
                    </span>
                    <span className="messages__conversation-body">
                      <span className="messages__conversation-name">
                        {conversation.user.displayName}
                      </span>
                      {conversation.lastMessageAt && (
                        <time className="messages__conversation-time">
                          {formatRelativeTime(conversation.lastMessageAt, language)}
                        </time>
                      )}
                    </span>
                    {conversation.hasUnread && (
                      <span className="visually-hidden">{t('messages.unread')}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </aside>

      <section className="messages__thread" aria-label={t('messages.title')}>
        {!selected ? (
          <p className="messages__placeholder">{t('messages.selectConversation')}</p>
        ) : (
          <>
            <header className="messages__thread-head">
              <Avatar user={selected} size={30} />
              <span className="messages__thread-name">{selected.displayName}</span>
            </header>

            <div className="messages__thread-body" ref={threadRef}>
              {thread.length === 0 && <p className="messages__empty">{t('messages.empty')}</p>}
              {thread.map((message) => {
                const mine = message.senderId === user?.id
                return (
                  <article
                    key={message.id}
                    className={`messages__bubble-row${mine ? ' messages__bubble-row--mine' : ''}`}
                  >
                    <div className="messages__bubble">
                      {message.body}
                      <time className="messages__bubble-time" dateTime={message.createdAt}>
                        {formatRelativeTime(message.createdAt, language)}
                      </time>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="messages__compose">
              <textarea
                className="messages__input"
                value={draft}
                placeholder={t('messages.placeholder')}
                aria-label={t('messages.title')}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onComposeKeyDown}
              />
              <Button
                type="button"
                onClick={() => void send()}
                loading={sendMessage.isPending}
                disabled={draft.trim() === ''}
              >
                {t('messages.send')}
              </Button>
            </div>
          </>
        )}
      </section>

      {picking && (
        <RecipientPicker
          exclude={[user?.id, ...conversations.map((c) => c.user.id)].filter(Boolean) as string[]}
          onPick={openConversation}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}

/**
 * Choix d'un destinataire pour démarrer une NOUVELLE conversation.
 *
 * Exclut les comptes déjà présents dans la liste des conversations : une
 * conversation existante se rouvre en cliquant dessus, pas en la recréant.
 */
function RecipientPicker({
  exclude,
  onPick,
  onClose
}: {
  exclude: string[]
  onPick: (user: PublicUser) => void
  onClose: () => void
}): JSX.Element {
  const { t } = useI18n()
  const { data: users = [] } = useQuery({
    queryKey: ['auth', 'list-users'],
    queryFn: () => unwrap(window.mc.auth.listUsers())
  })

  const candidates = users.filter((candidate) => !exclude.includes(candidate.id))

  return (
    <Modal title={t('messages.pickRecipient')} onClose={onClose}>
      {candidates.length === 0 ? (
        <p className="messages__empty">{t('messages.noUsers')}</p>
      ) : (
        <ul className="messages__picker-list">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                className="messages__picker-row"
                onClick={() => onPick(candidate)}
              >
                <Avatar user={candidate} size={32} />
                <span>{candidate.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="messages__picker-footer">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </Modal>
  )
}
