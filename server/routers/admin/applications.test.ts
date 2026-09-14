import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createSuperAdmin, createSkill } from '@/test/factories'
import { clientAs } from '@/test/rpc'

vi.mock('@/lib/email', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/email')>()
  return {
    ...original,
    sendApplicationApprovedEmail: vi.fn(async () => true),
    sendApplicationRejectedEmail: vi.fn(async () => true),
    sendApplicationNeedsInfoEmail: vi.fn(async () => true),
    sendApplicationReopenedEmail: vi.fn(async () => true),
  }
})
import {
  sendApplicationApprovedEmail,
  sendApplicationRejectedEmail,
  sendApplicationNeedsInfoEmail,
  sendApplicationReopenedEmail,
} from '@/lib/email'

const hashOf = (email: string) =>
  createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
const status = async (id: number) =>
  (await prisma.volunteer.findUniqueOrThrow({ where: { id } })).approvalStatus

describe('admin.applications.list / getById', () => {
  it('filters by queue and attaches reviewer, skills and previous rejections', async () => {
    const me = await createSuperAdmin()
    const otherAdmin = await createSuperAdmin()
    const c = clientAs(me)
    const skill = await createSkill()
    const fresh = await createVolunteer({
      approvalStatus: 'pending',
      skills: { create: [{ skillId: skill.id }] },
    })
    const mine = await createVolunteer({ approvalStatus: 'under_review', reviewerId: me.id })
    const theirs = await createVolunteer({
      approvalStatus: 'under_review',
      reviewerId: otherAdmin.id,
    })
    const approved = await createVolunteer()
    const rejected = await createVolunteer({
      approvalStatus: 'rejected',
      rejectedAt: new Date('2026-01-01T00:00:00Z'),
    })
    const needsInfo = await createVolunteer({ approvalStatus: 'needs_info', email: null })
    await createVolunteer({ approvalStatus: 'pending', deletedAt: new Date() })
    await prisma.rejectedApplication.create({
      data: {
        emailHash: hashOf(fresh.email!),
        rejectedAt: new Date('2025-06-01'),
        adminNotes: 'earlier',
      },
    })

    const ids = async (filter: 'mine' | 'others' | 'approved' | 'rejected' | 'needs_info') =>
      (await c.admin.applications.list({ filter })).map((v) => v.id)
    expect((await ids('mine')).sort()).toEqual([fresh.id, mine.id].sort())
    expect(await ids('others')).toEqual([theirs.id])
    expect(await ids('approved')).toEqual(expect.arrayContaining([approved.id]))
    expect(await ids('rejected')).toEqual([rejected.id])
    expect(await ids('needs_info')).toEqual([needsInfo.id])

    const list = await c.admin.applications.list({})
    const f = list.find((v) => v.id === fresh.id)!
    expect(f.previousRejections).toEqual([expect.objectContaining({ adminNotes: 'earlier' })])
    expect(f.skills[0]).toMatchObject({ id: skill.id })
    expect(f.reviewer).toBeNull()
    expect(list.find((v) => v.id === mine.id)!.reviewer).toEqual({ id: me.id, name: me.name })
    const r = (await c.admin.applications.list({ filter: 'rejected' }))[0]
    expect(r.anonymiseAt).toBe('2026-01-08T00:00:00.000Z')
    const ni = (await c.admin.applications.list({ filter: 'needs_info' }))[0]
    expect(ni.previousRejections).toEqual([])
    // No emails at all → no rejection lookup.
    await prisma.volunteer.update({ where: { id: needsInfo.id }, data: { email: null } })
    expect(await c.admin.applications.list({ filter: 'needs_info' })).toHaveLength(1)

    const one = await c.admin.applications.getById({ id: fresh.id })
    expect(one.previousRejections).toHaveLength(1)
    expect(one.anonymiseAt).toBeNull()
    const noEmail = await c.admin.applications.getById({ id: needsInfo.id })
    expect(noEmail.previousRejections).toEqual([])
    expect(noEmail.reviewer).toBeNull()
    const rej = await c.admin.applications.getById({ id: rejected.id })
    expect(rej.anonymiseAt).toBe('2026-01-08T00:00:00.000Z')
    await expect(c.admin.applications.getById({ id: 999_999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('admin.applications.action', () => {
  it('update_notes, start_review, request_info', async () => {
    const me = await createSuperAdmin()
    const c = clientAs(me)
    await expect(
      c.admin.applications.action({ id: 999_999, action: 'approve' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const v = await createVolunteer({ approvalStatus: 'pending' })
    expect(
      await c.admin.applications.action({
        id: v.id,
        action: 'update_notes',
        adminNotes: 'a',
        applicantNotes: 'b',
      }),
    ).toEqual({ message: 'Notes updated' })
    expect(await prisma.volunteer.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({
      applicationAdminNotes: 'a',
      applicationApplicantNotes: 'b',
    })
    await c.admin.applications.action({ id: v.id, action: 'update_notes', adminNotes: null })

    expect(await c.admin.applications.action({ id: v.id, action: 'start_review' })).toEqual({
      message: 'Review started',
    })
    expect(await prisma.volunteer.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({
      approvalStatus: 'under_review',
      reviewerId: me.id,
    })
    await c.admin.applications.action({
      id: v.id,
      action: 'start_review',
      adminNotes: 'x',
      applicantNotes: 'y',
    })

    expect(
      await c.admin.applications.action({
        id: v.id,
        action: 'request_info',
        applicantNotes: 'tell us more',
      }),
    ).toEqual({ message: 'More information requested' })
    expect(await status(v.id)).toBe('needs_info')
    expect(sendApplicationNeedsInfoEmail).toHaveBeenCalledWith({
      to: v.email,
      name: v.name,
      applicantNotes: 'tell us more',
    })
    await expect(
      c.admin.applications.action({ id: v.id, action: 'start_review' }),
    ).rejects.toMatchObject({ message: 'Cannot start review on a needs_info application' })
    await expect(
      c.admin.applications.action({ id: v.id, action: 'request_info' }),
    ).rejects.toMatchObject({ message: 'Cannot request info on a needs_info application' })
    await expect(c.admin.applications.action({ id: v.id, action: 'reopen' })).rejects.toMatchObject(
      { message: 'Cannot reopen a needs_info application' },
    )

    // Without an email nothing is sent; with stored notes they are reused.
    const quiet = await createVolunteer({
      approvalStatus: 'pending',
      email: null,
      applicationApplicantNotes: 'stored',
    })
    await c.admin.applications.action({
      id: quiet.id,
      action: 'request_info',
      adminNotes: 'n',
      applicantNotes: 'p',
    })
    expect(sendApplicationNeedsInfoEmail).toHaveBeenCalledTimes(1)
    const stored = await createVolunteer({
      approvalStatus: 'pending',
      applicationApplicantNotes: 'stored',
    })
    await c.admin.applications.action({ id: stored.id, action: 'request_info' })
    expect(vi.mocked(sendApplicationNeedsInfoEmail).mock.lastCall![0].applicantNotes).toBe('stored')
  })

  it('approve, reject, reopen — with emails and notification clean-up', async () => {
    const me = await createSuperAdmin()
    const c = clientAs(me)
    const a = await createVolunteer({ approvalStatus: 'pending' })
    await prisma.notification.create({
      data: { volunteerId: me.id, type: 'new_volunteer_signup', title: 't', entityId: a.id },
    })
    expect(await c.admin.applications.action({ id: a.id, action: 'approve' })).toEqual({
      message: 'Application approved',
    })
    expect(await status(a.id)).toBe('approved')
    expect(sendApplicationApprovedEmail).toHaveBeenCalledWith({ to: a.email, name: a.name })
    expect(
      await prisma.notification.count({ where: { type: 'new_volunteer_signup', entityId: a.id } }),
    ).toBe(0)
    await expect(c.admin.applications.action({ id: a.id, action: 'reject' })).rejects.toMatchObject(
      { message: 'Application already approved' },
    )

    const r = await createVolunteer({ approvalStatus: 'needs_info' })
    expect(
      await c.admin.applications.action({
        id: r.id,
        action: 'reject',
        applicantNotes: 'sorry',
        adminNotes: 'weak',
      }),
    ).toEqual({ message: 'Application rejected' })
    const rRow = await prisma.volunteer.findUniqueOrThrow({ where: { id: r.id } })
    expect(rRow.rejectedAt).not.toBeNull()
    expect(sendApplicationRejectedEmail).toHaveBeenCalledWith({
      to: r.email,
      name: r.name,
      applicantNotes: 'sorry',
    })

    expect(
      await c.admin.applications.action({
        id: r.id,
        action: 'reopen',
        adminNotes: 'second look',
        applicantNotes: 'welcome back',
      }),
    ).toEqual({ message: 'Application reopened' })
    expect(await prisma.volunteer.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({
      approvalStatus: 'needs_info',
      rejectedAt: null,
    })
    expect(sendApplicationReopenedEmail).toHaveBeenCalledWith({
      to: r.email,
      name: r.name,
      applicantNotes: 'welcome back',
    })

    // Email-less volunteers skip every send.
    const silent = await createVolunteer({ approvalStatus: 'pending', email: null })
    await c.admin.applications.action({ id: silent.id, action: 'reject' })
    await c.admin.applications.action({ id: silent.id, action: 'reopen' })
    await c.admin.applications.action({ id: silent.id, action: 'approve' })
    expect(sendApplicationApprovedEmail).toHaveBeenCalledTimes(1)
    expect(sendApplicationRejectedEmail).toHaveBeenCalledTimes(1)
    expect(sendApplicationReopenedEmail).toHaveBeenCalledTimes(1)
  })

  it('logs but does not fail when an email send rejects', async () => {
    const me = await createSuperAdmin()
    const c = clientAs(me)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = () => Promise.reject(new Error('smtp'))
    vi.mocked(sendApplicationNeedsInfoEmail).mockImplementationOnce(boom)
    vi.mocked(sendApplicationReopenedEmail).mockImplementationOnce(boom)
    vi.mocked(sendApplicationApprovedEmail).mockImplementationOnce(boom)
    vi.mocked(sendApplicationRejectedEmail).mockImplementationOnce(boom)
    const v = await createVolunteer({ approvalStatus: 'pending' })
    await c.admin.applications.action({ id: v.id, action: 'request_info' })
    await c.admin.applications.action({ id: v.id, action: 'reject' })
    await c.admin.applications.action({ id: v.id, action: 'reopen' })
    await c.admin.applications.action({ id: v.id, action: 'approve' })
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(4))
    expect(error.mock.calls.map((c) => c[0])).toEqual([
      '[APPLICATIONS] Needs-info email failed:',
      '[APPLICATIONS] Rejected email failed:',
      '[APPLICATIONS] Reopened email failed:',
      '[APPLICATIONS] Approved email failed:',
    ])
  })
})
