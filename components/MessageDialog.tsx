'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import Button from '@/components/Button'
import Modal from '@/components/ui/Modal'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'

interface DirectContact {
  discordHandle?: string | null
  signalNumber?: string | null
  whatsappNumber?: string | null
}

/**
 * Sends a message through the platform relay: the recipient gets it by email and in their
 * notifications without their address being shown. Render it only while open.
 */
export default function MessageDialog({
  id,
  title,
  recipientId,
  recipientName,
  relatedProjectId,
  directContact,
  onClose,
}: {
  id: string
  title: string
  recipientId: number
  recipientName: string
  relatedProjectId?: number
  /** Channels the recipient shares, offered before the form. */
  directContact?: DirectContact
  onClose: () => void
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const showToast = useToast()

  const sendMessageMutation = useMutation({
    ...orpc.messages.send.mutationOptions(),
    onSuccess: () => {
      onClose()
      showToast(
        "Message sent! They'll receive it by email and can reply directly to you.",
        'success',
      )
    },
    onError: (err: unknown) =>
      showToast(err instanceof Error ? err.message : 'Failed to send message', 'error'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendMessageMutation.mutate({
      recipientId,
      subject: subject.trim(),
      message: body.trim(),
      relatedProjectId,
    })
  }

  const channels = [
    { label: 'Discord', value: directContact?.discordHandle },
    { label: 'Signal', value: directContact?.signalNumber },
    { label: 'WhatsApp', value: directContact?.whatsappNumber },
  ].filter((c) => c.value)

  return (
    <Modal id={id} title={title} isOpen onClose={onClose}>
      <p className="text-sm text-text-light mb-4">
        {recipientName} will get this by email and in their notifications. Your email address is
        shared so they can reply.
      </p>
      {channels.length > 0 && (
        <div className="mb-5">
          <p className="text-sm font-medium mb-2">Contact directly:</p>
          <div className="flex flex-col gap-2">
            {channels.map((c) => (
              <div key={c.label} className="flex items-center gap-2 text-sm">
                <span className="text-text-light">{c.label}:</span>
                <span className="font-medium">{c.value}</span>
              </div>
            ))}
          </div>
          <hr className="my-4 border-brand-border" />
          <p className="text-sm text-text-light mb-3">Or send a message via the platform:</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-5">
          <label htmlFor={`${id}-subject`}>Subject</label>
          <input
            id={`${id}-subject`}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </div>
        <div className="mb-5">
          <label htmlFor={`${id}-message`}>Message</label>
          <textarea
            id={`${id}-message`}
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={sendMessageMutation.isPending}>
            {sendMessageMutation.isPending ? 'Sending…' : 'Send Message'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
