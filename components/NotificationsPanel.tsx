'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Button from './Button'
import { friendlyDate } from '@/lib/format-date'
import { orpc } from '@/lib/orpc'

const PAGE_SIZE = 20
type Filter = 'all' | 'unread' | 'read'

/** The volunteer's notifications: Unread / Read filters, mark read, and paging. */
export default function NotificationsPanel({ unreadCount }: { unreadCount: number }) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)

  const { data } = useQuery({
    ...orpc.notifications.list.queryOptions({
      input: { filter, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    }),
    placeholderData: keepPreviousData,
  })
  const notifications = data?.notifications ?? []
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

  const refresh = {
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.notifications.list.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.dashboard.get.key() })
    },
  }
  const readAll = useMutation({ ...orpc.notifications.readAll.mutationOptions(), ...refresh })
  const markRead = useMutation({ ...orpc.notifications.markRead.mutationOptions(), ...refresh })
  const markUnread = useMutation({ ...orpc.notifications.markUnread.mutationOptions(), ...refresh })

  function toggle(next: Filter) {
    setFilter(filter === next ? 'all' : next)
    setPage(1)
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex gap-2">
          <Button
            variant={filter === 'unread' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => toggle('unread')}
          >
            Unread
          </Button>
          <Button
            variant={filter === 'read' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => toggle('read')}
          >
            Read
          </Button>
        </div>
        {unreadCount > 0 && (
          <Button size="sm" onClick={() => readAll.mutate({})}>
            Mark all as read
          </Button>
        )}
      </div>
      {!notifications.length ? (
        <p className="text-text-light">
          No notifications
          {filter !== 'all' ? ` marked ${filter}` : ''}.
        </p>
      ) : (
        <>
          {notifications.map((n, i) => (
            <React.Fragment key={n.id}>
              {filter === 'all' && i === 0 && !n.readAt && (
                <h3 className="text-sm text-text-light mb-2 mt-0">Unread</h3>
              )}
              {filter === 'all' && n.readAt && i > 0 && !notifications[i - 1].readAt && (
                <h3 className="text-sm text-text-light mb-2 mt-4">Earlier</h3>
              )}
              <div
                className={`bg-surface rounded-xl shadow p-5 mb-3 wrap-break-word ${!n.readAt ? 'border-l-4 border-primary' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <strong className={!n.readAt ? 'text-brand-text' : 'text-text-light'}>
                    {n.title}
                  </strong>
                  <span className="text-xs text-text-light whitespace-nowrap">
                    {n.createdAt ? friendlyDate(n.createdAt) : ''}
                  </span>
                </div>
                <p className="text-sm mt-1 mb-0">{n.body}</p>
                <div className="flex items-center gap-3 mt-2">
                  {n.link && (
                    <Link
                      href={n.link}
                      className="text-sm underline"
                      onClick={() => {
                        if (!n.readAt) markRead.mutate({ id: n.id })
                      }}
                    >
                      View
                    </Link>
                  )}
                  {n.readAt ? (
                    <button
                      type="button"
                      className="text-sm underline text-text-light cursor-pointer bg-transparent border-0 p-0"
                      onClick={() => markUnread.mutate({ id: n.id })}
                    >
                      Mark as unread
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-sm underline text-text-light cursor-pointer bg-transparent border-0 p-0"
                      onClick={() => markRead.mutate({ id: n.id })}
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
            </React.Fragment>
          ))}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-text-light">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
