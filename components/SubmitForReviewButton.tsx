'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { QUICK_TASK_SUBMITTED_MESSAGE } from '@/lib/action-messages'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'

/**
 * Submits the viewer's Quick Task for review, after a dialog reminding them to leave
 * their work in a comment: the submission itself carries nothing.
 */
export default function SubmitForReviewButton({
  taskId,
  size,
}: {
  taskId: number
  size?: 'sm' | 'md' | 'lg'
}) {
  const [confirming, setConfirming] = useState(false)
  const showToast = useToast()
  const queryClient = useQueryClient()

  const submitMutation = useMutation({
    ...orpc.quickTasks.submit.mutationOptions(),
    onSuccess: () => {
      showToast(QUICK_TASK_SUBMITTED_MESSAGE, 'success')
      void queryClient.invalidateQueries({ queryKey: orpc.quickTasks.get.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.my.quickTasks.key() })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to submit task', 'error')
    },
    onSettled: () => setConfirming(false),
  })

  return (
    <>
      <Button size={size} onClick={() => setConfirming(true)}>
        Submit for review
      </Button>
      <ConfirmDialog
        id={`submit-task-${taskId}`}
        isOpen={confirming}
        title="Submit for review?"
        body="Post a link or note to your work as a comment first, then submit. An admin will look at it."
        confirmLabel="Submit for review"
        busy={submitMutation.isPending}
        busyLabel="Submitting…"
        onConfirm={() => submitMutation.mutate({ id: taskId })}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}
