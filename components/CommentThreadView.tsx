'use client'

import { useEffect, useRef, useState } from 'react'
import Button from './Button'
import { formatDateTime } from '@/lib/format-date'
import { useToast } from '@/lib/toast'

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
  const showToast = useToast()

  function copyCommentLink(id: number) {
    const url = `${window.location.origin}${window.location.pathname}#comment-${id}`
    navigator.clipboard.writeText(url)
    showToast('Link copied!', 'success')
  }

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
              <span className="text-xs text-text-light inline-flex items-center gap-1.5">
                {c.authorName ?? 'Unknown'} · {c.createdAt ? formatDateTime(c.createdAt) : ''}
                <button
                  type="button"
                  onClick={() => copyCommentLink(c.id)}
                  aria-label="Copy link to this comment"
                  title="Copy link to this comment"
                  className="text-text-light hover:text-text cursor-pointer"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
