import { describe, it, expect, vi, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createProject, createSkill } from '@/test/factories'

vi.mock('./email', () => ({
  sendDigestEmail: vi.fn(async () => true),
  isEmailConfigured: vi.fn(() => true),
}))

import { sendDigestEmail, isEmailConfigured } from './email'
import { notifyMatchingVolunteers } from './project-match-notify'

afterEach(() => {
  vi.clearAllMocks()
  vi.mocked(isEmailConfigured).mockReturnValue(true)
})

async function skills(n: number) {
  const out = []
  for (let i = 0; i < n; i++) out.push(await createSkill())
  return out
}

describe('notifyMatchingVolunteers', () => {
  it('does nothing when email is off, the project is missing, or it has no required skills', async () => {
    vi.mocked(isEmailConfigured).mockReturnValue(false)
    await notifyMatchingVolunteers(1)
    vi.mocked(isEmailConfigured).mockReturnValue(true)
    await notifyMatchingVolunteers(999_999)
    const [s] = await skills(1)
    const p = await createProject({ skills: { create: [{ skillId: s.id, isRequired: false }] } })
    await notifyMatchingVolunteers(p.id)
    expect(sendDigestEmail).not.toHaveBeenCalled()
  })

  it('emails opted-in, geo-eligible volunteers at a notifiable grade', async () => {
    const [a, b, c] = await skills(3)
    const p = await createProject({
      country: 'UK',
      remoteEligibility: 'NONE',
      description: null,
      skills: { create: [a, b, c].map((s) => ({ skillId: s.id, isRequired: true })) },
    })
    const mk = (over: Parameters<typeof createVolunteer>[0], ids: number[]) =>
      createVolunteer({
        emailDigest: 'match',
        country: 'UK',
        skills: { create: ids.map((skillId) => ({ skillId })) },
        ...over,
      })
    const good = await mk({}, [a.id, b.id])
    await mk({}, [a.id]) // partial: not notifiable
    await mk({ country: 'US' }, [a.id, b.id]) // wrong country, no remote
    await mk({ emailDigest: 'none' }, [a.id, b.id]) // not opted in
    await notifyMatchingVolunteers(p.id)
    expect(sendDigestEmail).toHaveBeenCalledTimes(1)
    expect(sendDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: good.email,
        isMatch: true,
        projects: [expect.objectContaining({ id: p.id, description: '', match_percent: 67 })],
      }),
    )
  })

  it('is a no-op with no candidate volunteers, and logs a failed send', async () => {
    const [a] = await skills(1)
    const p = await createProject({ skills: { create: [{ skillId: a.id, isRequired: true }] } })
    await notifyMatchingVolunteers(p.id)
    expect(sendDigestEmail).not.toHaveBeenCalled()

    const [b, c] = await skills(2)
    const p2 = await createProject({
      skills: { create: [b, c].map((s) => ({ skillId: s.id, isRequired: true })) },
    })
    await createVolunteer({
      emailDigest: 'match',
      skills: { create: [{ skillId: b.id }, { skillId: c.id }] },
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(sendDigestEmail).mockRejectedValueOnce(new Error('smtp'))
    await notifyMatchingVolunteers(p2.id)
    expect(error).toHaveBeenCalledWith('[MATCH NOTIFY ERROR]', expect.any(Error))
    expect(await prisma.workItem.count({ where: { id: p2.id } })).toBe(1)
  })
})
