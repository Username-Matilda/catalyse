'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Button from './Button'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'

interface CommentThreadProps {
  workItemId: number
  /** Show the post form (server still enforces authorization). */
  canPost?: boolean
  emptyText?: string
  placeholder?: string
}

export default function CommentThread({
  workItemId,
  canPost = false,
  emptyText = 'No comments yet.',
  placeholder = 'Add a comment…',
}: CommentThreadProps) {
  const queryClient = useQueryClient()
  const showToast = useToast()
  const [content, setContent] = useState('')

  const { data: comments = [], isPending } = useQuery({
    ...orpc.workItemComments.list.queryOptions({ input: { workItemId } }),
  })

  const addMutation = useMutation({
    ...orpc.workItemComments.add.mutationOptions(),
    onSuccess: () => {
      setContent('')
      void queryClient.invalidateQueries({ queryKey: orpc.workItemComments.list.key() })
      showToast('Comment added', 'success')
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to add comment', 'error'),
  })

  return (
    <div>
      {canPost && (
        <form
          className="mb-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!content.trim()) return
            addMutation.mutate({ workItemId, content: content.trim() })
          }}
        >
          <textarea
            aria-label="Add a comment"
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
          />
          <Button type="submit" size="sm" disabled={!content.trim() || addMutation.isPending}>
            {addMutation.isPending ? 'Posting…' : 'Post Comment'}
          </Button>
        </form>
      )}

      {isPending ? (
        <p className="text-text-light">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-text-light">{emptyText}</p>
      ) : (
        <ul className="list-none p-0 m-0">
          {comments.map((c) => (
            <li key={c.id} className="py-3 border-b border-brand-border last:border-0">
              <p className="m-0 mb-1 whitespace-pre-wrap">{c.content}</p>
              <span className="text-xs text-text-light">
                {c.authorName ?? 'Unknown'} ·{' '}
                {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
