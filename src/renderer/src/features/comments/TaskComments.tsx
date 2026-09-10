import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { TaskComment } from '@shared/types/views'
import { Avatar } from '@renderer/components/Avatar'
import { Button } from '@renderer/components/Button'
import { useI18n } from '@renderer/i18n'
import { useToast } from '@renderer/components/Toast'
import { useAuth } from '@renderer/features/auth/AuthProvider'
import { formatRelativeTime } from '@renderer/lib/format'
import {
  useComments,
  useCreateComment,
  useUpdateComment,
  useDeleteComment
} from '@renderer/features/missions/queries'
import './comments.css'

/**
 * Fil de discussion d'une tâche — « un truc genre messenger dans la tâche ».
 *
 * L'application est mono-utilisateur : tous les messages sont de la personne
 * connectée. On n'aligne donc rien à droite pour opposer « moi » aux « autres » ;
 * le fil se lit comme un journal — avatar, nom, heure relative, bulle — et sert
 * à consigner un blocage, un contexte, une décision liés à la tâche.
 */
export function TaskComments({ taskId }: { taskId: string }): JSX.Element {
  const { t, language } = useI18n()
  const toast = useToast()
  const { user } = useAuth()

  const { data: comments = [], isLoading } = useComments(taskId)
  const createComment = useCreateComment()
  const updateComment = useUpdateComment()
  const deleteComment = useDeleteComment()

  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')

  // On garde le fil collé en bas à l'arrivée d'un message : la conversation la
  // plus récente est celle qu'on veut voir sans avoir à défiler.
  const threadRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [comments.length])

  async function send(): Promise<void> {
    const body = draft.trim()
    if (body === '' || createComment.isPending) return
    try {
      await createComment.mutateAsync({ taskId, body })
      setDraft('')
    } catch {
      toast.error(t('toast.failed'))
    }
  }

  function onComposeKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    // Entrée envoie, Maj+Entrée insère un retour à la ligne — la convention de
    // toutes les messageries.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  function startEdit(comment: TaskComment): void {
    setEditingId(comment.id)
    setEditBody(comment.body)
  }

  function cancelEdit(): void {
    setEditingId(null)
    setEditBody('')
  }

  async function saveEdit(comment: TaskComment): Promise<void> {
    const body = editBody.trim()
    if (body === '' || body === comment.body) {
      cancelEdit()
      return
    }
    try {
      await updateComment.mutateAsync({ id: comment.id, body, taskId })
      cancelEdit()
    } catch {
      toast.error(t('toast.failed'))
    }
  }

  async function remove(comment: TaskComment): Promise<void> {
    try {
      await deleteComment.mutateAsync({ id: comment.id, taskId })
    } catch {
      toast.error(t('toast.failed'))
    }
  }

  return (
    <section className="comments" aria-label={t('comments.title')}>
      <span className="mc-field__label">{t('comments.title')}</span>

      <div className="comments__thread" ref={threadRef}>
        {!isLoading && comments.length === 0 && (
          <p className="comments__empty">{t('comments.empty')}</p>
        )}

        {comments.map((comment) => {
          const isEditing = editingId === comment.id
          return (
            <article key={comment.id} className="comment">
              {user && <Avatar user={user} size={28} className="comment__avatar" />}

              <div className="comment__col">
                <div className="comment__head">
                  <span className="comment__author">{user?.displayName ?? ''}</span>
                  <time className="comment__time" dateTime={comment.createdAt}>
                    {formatRelativeTime(comment.createdAt, language)}
                  </time>
                  {comment.edited && (
                    <span className="comment__edited">{t('comments.edited')}</span>
                  )}
                </div>

                {isEditing ? (
                  <div className="comments__compose">
                    <textarea
                      className="comments__input"
                      value={editBody}
                      autoFocus
                      aria-label={t('comments.edit')}
                      onChange={(event) => setEditBody(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') cancelEdit()
                      }}
                    />
                    <div className="comments__compose-row" style={{ gap: 'var(--mc-space-2)' }}>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={cancelEdit}
                        disabled={updateComment.isPending}
                      >
                        {t('comments.cancelEdit')}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void saveEdit(comment)}
                        loading={updateComment.isPending}
                      >
                        {t('comments.saveEdit')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="comment__bubble">
                    {comment.body}
                    <div className="comment__actions">
                      <button
                        type="button"
                        className="comment__action"
                        onClick={() => startEdit(comment)}
                      >
                        {t('comments.edit')}
                      </button>
                      <button
                        type="button"
                        className="comment__action comment__action--danger"
                        onClick={() => void remove(comment)}
                      >
                        {t('comments.delete')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>

      <div className="comments__compose">
        <textarea
          className="comments__input"
          value={draft}
          placeholder={t('comments.placeholder')}
          aria-label={t('comments.title')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposeKeyDown}
        />
        <div className="comments__compose-row">
          <Button
            type="button"
            onClick={() => void send()}
            loading={createComment.isPending}
            disabled={draft.trim() === ''}
          >
            {t('comments.send')}
          </Button>
        </div>
      </div>
    </section>
  )
}
