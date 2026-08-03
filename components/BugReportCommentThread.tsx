'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import CommentThreadView from './CommentThreadView'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'

interface BugReportCommentThreadProps {
  bugReportId: number
  emptyText?: string
  placeholder?: string
}

export default function BugReportCommentThread({
  bugReportId,
  emptyText,
  placeholder,
}: BugReportCommentThreadProps) {
  const queryClient = useQueryClient()
  const showToast = useToast()

  const { data, isPending } = useQuery({
    ...orpc.bugReportComments.list.queryOptions({ input: { bugReportId } }),
  })

  const addMutation = useMutation({
    ...orpc.bugReportComments.add.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.bugReportComments.list.key() })
      showToast('Comment added', 'success')
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to add comment', 'error'),
  })

  return (
    <CommentThreadView
      comments={data?.comments ?? []}
      canPost={data?.canPost ?? false}
      isPending={isPending}
      isSubmitting={addMutation.isPending}
      onSubmit={async (content) => {
        try {
          await addMutation.mutateAsync({ bugReportId, content })
          return true
        } catch {
          return false
        }
      }}
      emptyText={emptyText}
      placeholder={placeholder}
    />
  )
}
