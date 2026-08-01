'use client'

import { useEffect, useRef, useState } from 'react'
import Button from './Button'
import { formatDate } from '@/lib/format-date'

export interface CommentItem {
  id: number
  content: string
  authorName: string | null
  createdAt: Date | null
}

interface CommentThreadViewProps {
  comments: CommentItem[]
  canPost: boolean
  isPending: boolean
  isSubmitting: boolean
  onSubmit: (content: string) => Promise<boolean>
  emptyText?: string
  placeholder?: string
}

/**
 * Presentational comment list + post form, shared by CommentThread (work
 * items) and BugReportCommentThread. Owns the #comment-{id} anchor/scroll
 * behaviour so any consumer gets permalinks for free.
 */
export default function CommentThreadView({
  comments,
  canPost,
  isPending,
  isSubmitting,
  onSubmit,
  emptyText = 'No comments yet.',
  placeholder = 'Add a comment…',
}: CommentThreadViewProps) {
  const [content, setContent] = useState('')

  const scrolledToHashRef = useRef(false)
  useEffect(() => {
    if (scrolledToHashRef.current || comments.length === 0) return
    const hash = window.location.hash
    if (!hash.startsWith('#comment-')) return
    const el = document.getElementById(hash.slice(1))
    if (!el) return
    scrolledToHashRef.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-primary')
    setTimeout(() => el.classList.remove('ring-2', 'ring-primary'), 2000)
  }, [comments])

  return (
    <div>
      {canPost && (
        <form
          className="mb-4"
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = content.trim()
            if (!trimmed) return
            void onSubmit(trimmed).then((ok) => {
              if (ok) setContent('')
            })
          }}
        >
          <textarea
            aria-label="Add a comment"
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
          />
          <Button type="submit" size="sm" disabled={!content.trim() || isSubmitting}>
            {isSubmitting ? 'Posting…' : 'Post Comment'}
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
            <li
              key={c.id}
              id={`comment-${c.id}`}
              className="py-3 border-b border-brand-border last:border-0 scroll-mt-20 rounded transition-shadow"
            >
              <p className="m-0 mb-1 whitespace-pre-wrap">{c.content}</p>
              <span className="text-xs text-text-light">
                {c.authorName ?? 'Unknown'} · {c.createdAt ? formatDate(c.createdAt) : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
