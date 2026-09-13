import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { DirectMessage, ConversationSummary } from '@shared/types/views'
import { unwrap } from '@renderer/lib/ipc'

/**
 * Messagerie privée entre comptes — cache séparé de `missions/queries.ts` :
 * une conversation n'appartient à aucune app, elle traverse tout le compte.
 */
export const messageKeys = {
  conversations: ['conversations'] as const,
  thread: (otherUserId: string) => ['messages', otherUserId] as const
}

export function useConversations(): UseQueryResult<ConversationSummary[]> {
  return useQuery({
    queryKey: messageKeys.conversations,
    queryFn: () => unwrap(window.mc.messages.conversations())
  })
}

export function useMessageThread(otherUserId: string | null): UseQueryResult<DirectMessage[]> {
  return useQuery({
    queryKey: messageKeys.thread(otherUserId ?? ''),
    queryFn: () => unwrap(window.mc.messages.list({ otherUserId: otherUserId as string })),
    enabled: otherUserId !== null
  })
}

/**
 * Comme les mutations du chat général : le service renvoie le fil complet à
 * jour, écrit directement dans le cache plutôt qu'invalidé, pour qu'un envoi
 * n'ait jamais à clignoter. La liste des conversations, elle, EST invalidée :
 * un nouveau destinataire doit y apparaître immédiatement.
 */
export function useSendMessage(): ReturnType<
  typeof useMutation<DirectMessage[], Error, { recipientId: string; body: string }>
> {
  const client = useQueryClient()
  return useMutation<DirectMessage[], Error, { recipientId: string; body: string }>({
    mutationFn: (input) => unwrap(window.mc.messages.send(input)),
    onSuccess: (thread, input) => {
      client.setQueryData(messageKeys.thread(input.recipientId), thread)
      void client.invalidateQueries({ queryKey: messageKeys.conversations })
    }
  })
}

export function useMarkMessagesSeen(): ReturnType<
  typeof useMutation<null, Error, { otherUserId: string }>
> {
  const client = useQueryClient()
  return useMutation<null, Error, { otherUserId: string }>({
    mutationFn: (input) => unwrap(window.mc.messages.markSeen(input)),
    onSuccess: () => void client.invalidateQueries({ queryKey: messageKeys.conversations })
  })
}
