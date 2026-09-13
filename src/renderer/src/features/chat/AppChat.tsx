import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ChatMessage } from '@shared/types/views'
import { CHAT_REACTIONS, type ChatReaction } from '@shared/schemas/chat.schema'
import { Avatar } from '@renderer/components/Avatar'
import { Button } from '@renderer/components/Button'
import { useI18n, type MessageKey } from '@renderer/i18n'
import { useToast } from '@renderer/components/Toast'
import { useAuth } from '@renderer/features/auth/AuthProvider'
import { formatRelativeTime } from '@renderer/lib/format'
import { playChatChime } from '@renderer/lib/sound'
import {
  useChatMessages,
  useCreateChatMessage,
  useUpdateChatMessage,
  useReactToChatMessage,
  useDeleteChatMessage
} from '@renderer/features/missions/queries'
import './chat.css'

/** Libellé accessible de chaque réaction, dans l'ordre de CHAT_REACTIONS. */
const REACTION_LABELS: MessageKey[] = [
  'chat.reactionLike',
  'chat.reactionLove',
  'chat.reactionLaugh'
]

/**
 * Chat GÉNÉRAL d'une app — séparé du fil de discussion d'une tâche
 * (TaskComments) : une discussion sur l'app entière, pas sur une tâche
 * précise. Même lecture en journal (avatar, nom, heure, bulle), avec deux
 * ajouts : une réaction unique par message, et un son discret à l'arrivée
 * d'un message qu'on n'a pas soi-même envoyé.
 */
export function AppChat({ projectId }: { projectId: string }): JSX.Element {
  const { t, language } = useI18n()
  const toast = useToast()
  const { user } = useAuth()

  const { data: messages = [], isLoading } = useChatMessages(projectId)
  const createMessage = useCreateChatMessage()
  const updateMessage = useUpdateChatMessage()
  const reactToMessage = useReactToChatMessage()
  const deleteMessage = useDeleteChatMessage()

  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')

  const threadRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  // Son de réception : voir sendMessage/l'effet ci-dessous. `null` tant que
  // le premier chargement n'est pas passé — on ne joue jamais de son pour
  // des messages qui étaient déjà là avant d'ouvrir l'onglet.
  const seenIdsRef = useRef<Set<string> | null>(null)
  // Vrai entre l'appel d'envoi et l'arrivée de SA réponse : le ou les
  // messages qui apparaissent pendant cette fenêtre sont les miens, jamais
  // annoncés par un son. Un bool suffit : un seul envoi à la fois dans cette
  // interface (le bouton se désactive pendant l'attente).
  const pendingOwnSendRef = useRef(false)

  useEffect(() => {
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(messages.map((message) => message.id))
      return
    }

    const seen = seenIdsRef.current
    const arrived = messages.filter((message) => !seen.has(message.id))
    for (const message of arrived) seen.add(message.id)

    if (arrived.length === 0) return
    if (pendingOwnSendRef.current) {
      pendingOwnSendRef.current = false
      return
    }
    playChatChime()
  }, [messages])

  async function send(): Promise<void> {
    const body = draft.trim()
    if (body === '' || createMessage.isPending) return
    pendingOwnSendRef.current = true
    try {
      await createMessage.mutateAsync({ projectId, body })
      setDraft('')
    } catch {
      // L'envoi a échoué : rien n'est arrivé, il n'y a donc rien à couvrir.
      pendingOwnSendRef.current = false
      toast.error(t('toast.failed'))
    }
  }

  function onComposeKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  function startEdit(message: ChatMessage): void {
    setEditingId(message.id)
    setEditBody(message.body)
  }

  function cancelEdit(): void {
    setEditingId(null)
    setEditBody('')
  }

  async function saveEdit(message: ChatMessage): Promise<void> {
    const body = editBody.trim()
    if (body === '' || body === message.body) {
      cancelEdit()
      return
    }
    try {
      await updateMessage.mutateAsync({ id: message.id, body, projectId })
      cancelEdit()
    } catch {
      toast.error(t('toast.failed'))
    }
  }

  async function remove(message: ChatMessage): Promise<void> {
    try {
      await deleteMessage.mutateAsync({ id: message.id, projectId })
    } catch {
      toast.error(t('toast.failed'))
    }
  }

  // Un clic sur la réaction déjà active la RETIRE — poser, changer et
  // retirer sa réaction sont ainsi un seul geste, jamais deux boutons qui
  // pourraient se contredire.
  async function toggleReaction(message: ChatMessage, reaction: ChatReaction): Promise<void> {
    const next = message.reaction === reaction ? null : reaction
    try {
      await reactToMessage.mutateAsync({ id: message.id, reaction: next, projectId })
    } catch {
      toast.error(t('toast.failed'))
    }
  }

  return (
    <section className="chat" aria-label={t('chat.title')}>
      <div className="chat__thread" ref={threadRef}>
        {!isLoading && messages.length === 0 && <p className="chat__empty">{t('chat.empty')}</p>}

        {messages.map((message) => {
          const isEditing = editingId === message.id
          return (
            <article key={message.id} className="chat-message">
              {user && <Avatar user={user} size={28} className="chat-message__avatar" />}

              <div className="chat-message__col">
                <div className="chat-message__head">
                  <span className="chat-message__author">{user?.displayName ?? ''}</span>
                  <time className="chat-message__time" dateTime={message.createdAt}>
                    {formatRelativeTime(message.createdAt, language)}
                  </time>
                  {message.edited && (
                    <span className="chat-message__edited">{t('chat.edited')}</span>
                  )}
                </div>

                {isEditing ? (
                  <div className="chat__compose">
                    <textarea
                      className="chat__input"
                      value={editBody}
                      autoFocus
                      aria-label={t('chat.edit')}
                      onChange={(event) => setEditBody(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') cancelEdit()
                      }}
                    />
                    <div className="chat__compose-row" style={{ gap: 'var(--mc-space-2)' }}>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={cancelEdit}
                        disabled={updateMessage.isPending}
                      >
                        {t('chat.cancelEdit')}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void saveEdit(message)}
                        loading={updateMessage.isPending}
                      >
                        {t('chat.saveEdit')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="chat-message__bubble">
                    {message.body}
                    <div className="chat-message__actions">
                      <button
                        type="button"
                        className="chat-message__action"
                        onClick={() => startEdit(message)}
                      >
                        {t('chat.edit')}
                      </button>
                      <button
                        type="button"
                        className="chat-message__action chat-message__action--danger"
                        onClick={() => void remove(message)}
                      >
                        {t('chat.delete')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Toujours visible, pas seulement au survol comme éditer/
                    supprimer : réagir est le geste fréquent, il ne doit pas
                    se cacher. */}
                <div className="chat-reactions" role="group" aria-label={t('chat.reactionRemove')}>
                  {CHAT_REACTIONS.map((emoji, index) => {
                    const active = message.reaction === emoji
                    return (
                      <button
                        key={emoji}
                        type="button"
                        className={`chat-reaction${active ? ' chat-reaction--on' : ''}`}
                        aria-pressed={active}
                        aria-label={t(REACTION_LABELS[index] as MessageKey)}
                        onClick={() => void toggleReaction(message, emoji)}
                      >
                        {emoji}
                      </button>
                    )
                  })}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <div className="chat__compose">
        <textarea
          className="chat__input"
          value={draft}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.title')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposeKeyDown}
        />
        <div className="chat__compose-row">
          <Button
            type="button"
            onClick={() => void send()}
            loading={createMessage.isPending}
            disabled={draft.trim() === ''}
          >
            {t('chat.send')}
          </Button>
        </div>
      </div>
    </section>
  )
}
