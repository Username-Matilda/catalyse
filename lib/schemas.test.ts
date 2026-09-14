import { describe, it, expect } from 'vitest'
import {
  SignupSchema,
  CompleteGoogleSignupSchema,
  CreateProjectSchema,
  UpdateProjectTaskSchema,
  DependencyBodySchema,
  ApplicationActionSchema,
  UpdateVolunteerSchema,
} from './schemas'

const signup = {
  name: 'Ann',
  email: 'ann@example.com',
  password: 'longenough',
  bio: 'A bio that is definitely longer than twenty characters',
  country: 'UK',
  availabilityHoursPerWeek: 5,
  applicationMessage: 'An application message that is long enough',
}

describe('SignupSchema', () => {
  it('accepts a complete signup and reports the custom messages', () => {
    expect(SignupSchema.safeParse(signup).success).toBe(true)
    const bad = SignupSchema.safeParse({
      ...signup,
      email: 'nope',
      password: 'short',
      bio: 'short',
      country: '',
      availabilityHoursPerWeek: 50,
      applicationMessage: 'short',
    })
    expect(bad.success).toBe(false)
    const messages = bad.error!.issues.map((i) => i.message)
    expect(messages).toEqual(
      expect.arrayContaining([
        'A valid email address is required',
        'Password must be at least 8 characters',
        'Please write at least 20 characters',
        'Country is required',
        'Availability must be no more than 40 hours per week',
      ]),
    )
  })

  it('Google signup drops email/password/name and adds the credential', () => {
    const { email: _e, password: _p, name: _n, ...rest } = signup
    expect(
      CompleteGoogleSignupSchema.safeParse({ ...rest, credential: 'c', stub: true }).success,
    ).toBe(true)
  })
})

describe('project and task schemas', () => {
  it('CreateProjectSchema fills defaults for the optional arrays and flags', () => {
    const parsed = CreateProjectSchema.parse({
      title: 'T',
      description: 'D',
      projectType: 'sprint',
      estimatedDuration: '2 weeks',
      timeCommitmentHoursPerWeek: 2,
      urgency: 'low',
      collaborationLink: null,
      country: 'UK',
      localGroup: null,
      isSeekingHelp: true,
    })
    expect(parsed).toMatchObject({
      tasks: [],
      wantToOwn: false,
      skillIds: [],
      skillRequiredMap: {},
      saveAsDraft: false,
    })
  })

  it('UpdateProjectTaskSchema accepts the enum status and DependencyBodySchema bounds lag', () => {
    expect(UpdateProjectTaskSchema.safeParse({ status: 'completed' }).success).toBe(true)
    expect(UpdateProjectTaskSchema.safeParse({ status: 'nonsense' }).success).toBe(false)
    expect(DependencyBodySchema.parse({ predecessorId: 1, successorId: 2 }).lagDays).toBe(0)
    expect(
      DependencyBodySchema.safeParse({ predecessorId: 1, successorId: 2, lagDays: 400 }).success,
    ).toBe(false)
  })
})

describe('admin and profile schemas', () => {
  it('ApplicationActionSchema restricts the action', () => {
    expect(ApplicationActionSchema.safeParse({ action: 'approve' }).success).toBe(true)
    const bad = ApplicationActionSchema.safeParse({ action: 'nuke' })
    expect(bad.success).toBe(false)
    expect(bad.error!.issues[0].message).toContain('action must be')
  })

  it('UpdateVolunteerSchema is partial but validates the application message', () => {
    expect(UpdateVolunteerSchema.safeParse({}).success).toBe(true)
    expect(UpdateVolunteerSchema.safeParse({ applicationMessage: null }).success).toBe(true)
    expect(UpdateVolunteerSchema.safeParse({ applicationMessage: 'short' }).success).toBe(false)
    expect(UpdateVolunteerSchema.safeParse({ email: 'x@y.z' } as never)).toMatchObject({
      success: true,
    })
  })
})
