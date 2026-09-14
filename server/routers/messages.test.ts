import { describe, it, expect, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createProject } from '@/test/factories'
import { clientAs } from '@/test/rpc'

const { checkRateLimitMock } = vi.hoisted(() => ({ checkRateLimitMock: vi.fn() }))
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/rate-limit')>()
  checkRateLimitMock.mockImplementation(original.checkRateLimit)
  return { ...original, checkRateLimit: checkRateLimitMock }
})

vi.mock('@/lib/email', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/email')>()
  return {
    ...original,
    sendRelayMessage: vi.fn(async () => true),
    isEmailConfigured: vi.fn(() => true),
  }
})
import { sendRelayMessage, isEmailConfigured } from '@/lib/email'

describe('messages', () => {
  it('sends a message, stores a notification, and relays by email', async () => {
    const sender = await createVolunteer()
    const recipient = await createVolunteer()
    const project = await createProject()
    const c = clientAs(sender)
    const res = await c.messages.send({
      recipientId: recipient.id,
      subject: 'Hi',
      message: 'Hello',
      relatedProjectId: project.id,
    })
    expect(res.message).toContain('Message sent')
    expect(sendRelayMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: recipient.email,
        projectTitle: project.title,
        fromEmail: sender.email,
      }),
    )
    const note = await prisma.notification.findFirstOrThrow({
      where: { volunteerId: recipient.id },
    })
    expect(note).toMatchObject({ type: 'message_received', link: `/projects/${project.id}` })

    // An unknown related project is refused (it would otherwise break the foreign key).
    await expect(
      c.messages.send({
        recipientId: recipient.id,
        subject: 'Two',
        message: 'x',
        relatedProjectId: 999_999,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Project not found' })
    await c.messages.send({
      recipientId: recipient.id,
      subject: 'Two',
      message: 'x',
      relatedProjectId: null,
    })
    expect(vi.mocked(sendRelayMessage).mock.calls[1][0].projectTitle).toBeUndefined()
    await c.messages.send({ recipientId: recipient.id, subject: 'Three', message: 'x' })
    expect(
      (await prisma.notification.findMany({ where: { volunteerId: recipient.id } })).map(
        (n) => n.link,
      ),
    ).toContain('/dashboard#tab-notifications')

    const { received, sent } = await clientAs(recipient).messages.list()
    expect(received.map((m) => m.subject)).toEqual(['Three', 'Two', 'Hi'])
    expect(received[0].fromName).toBe(sender.name)
    expect(sent).toEqual([])
    expect((await c.messages.list()).sent[0].toName).toBe(recipient.name)

    expect(await clientAs(recipient).messages.markRead({ id: received[0].id })).toEqual({
      message: 'Marked as read',
    })
    await expect(c.messages.markRead({ id: received[0].id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('refuses self, unknown/uncontactable/emailless recipients, and rate limits', async () => {
    const sender = await createVolunteer()
    const c = clientAs(sender)
    await expect(
      c.messages.send({ recipientId: sender.id, subject: 's', message: 'm' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    const closed = await createVolunteer({ consentContactableByProjectOwners: false })
    await expect(
      c.messages.send({ recipientId: closed.id, subject: 's', message: 'm' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const noEmail = await createVolunteer({ email: null })
    await expect(
      c.messages.send({ recipientId: noEmail.id, subject: 's', message: 'm' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    checkRateLimitMock.mockReturnValueOnce({ allowed: false, retryAfterMs: 5 })
    await expect(
      c.messages.send({ recipientId: noEmail.id, subject: 's', message: 'm' }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
  })

  it('skips the email when none is configured, and logs a failed relay', async () => {
    const sender = await createVolunteer()
    const recipient = await createVolunteer()
    vi.mocked(isEmailConfigured).mockReturnValueOnce(false)
    vi.mocked(sendRelayMessage).mockClear()
    await clientAs(sender).messages.send({ recipientId: recipient.id, subject: 's', message: 'm' })
    expect(sendRelayMessage).not.toHaveBeenCalled()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(sendRelayMessage).mockRejectedValueOnce(new Error('smtp'))
    await clientAs(sender).messages.send({ recipientId: recipient.id, subject: 's', message: 'm' })
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('[EMAIL ERROR]', expect.any(Error)))
  })
})
