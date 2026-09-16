import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { ContactSummary } from '@shared/types/views'
import type { CreateContactInput, UpdateContactInput } from '@shared/schemas/contact.schema'
import { unwrap } from '@renderer/lib/ipc'

/**
 * Carnet de contacts — cache séparé de `missions/queries.ts` : un contact
 * n'est pas une tâche ni une app, et rien ici n'a besoin d'invalider les
 * compteurs du tableau de bord.
 */
const contactsKey = ['contacts'] as const

export function useContacts(): UseQueryResult<ContactSummary[]> {
  return useQuery({
    queryKey: contactsKey,
    queryFn: () => unwrap(window.mc.contacts.list())
  })
}

type Api = typeof window.mc

function useContactMutation<TInput, TResult>(
  call: (api: Api, input: TInput) => Promise<TResult>
): ReturnType<typeof useMutation<TResult, Error, TInput>> {
  const client = useQueryClient()
  return useMutation<TResult, Error, TInput>({
    mutationFn: (input) => call(window.mc, input),
    onSuccess: () => void client.invalidateQueries({ queryKey: contactsKey })
  })
}

export const useCreateContact = () =>
  useContactMutation((api, input: Partial<CreateContactInput> & { name: string }) =>
    unwrap(api.contacts.create(input))
  )

export const useUpdateContact = () =>
  useContactMutation((api, input: UpdateContactInput) => unwrap(api.contacts.update(input)))

export const useDeleteContact = () =>
  useContactMutation((api, input: { id: string }) => unwrap(api.contacts.remove(input)))
