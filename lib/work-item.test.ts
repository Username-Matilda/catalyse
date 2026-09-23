import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createProject, createTask, createTeam } from '@/test/factories'
import {
  canViewWorkItem,
  canPostComment,
  canManageProject,
  resolveTeamPrivy,
  resolveProjectPrivy,
  canSeeProjectScope,
  isOutsideCountry,
  withProjectExtras,
  serializeTask,
  serializeStarterTask,
  applyScheduleWrite,
  projectInclude,
  type EnrichedProject,
} from './work-item'

const admin = { id: 1, isAdmin: true, isApproved: true, country: null }
const owner = { id: 2, isAdmin: false, isApproved: true, country: null }
const creator = { id: 3, isAdmin: false, isApproved: true, country: null }
const other = { id: 4, isAdmin: false, isApproved: true, country: null }
const pending = { id: 5, isAdmin: false, isApproved: false, country: null }

// Where a work item is: no country, so no country scope.
const anywhere = { country: null, remoteEligibility: 'NONE' }
const project = { type: 'PROJECT', status: 'ready', creatorId: 3, assigneeId: 2, ...anywhere }

describe('canViewWorkItem', () => {
  it('shows a live project to everyone, a hidden one to admins and its creator', () => {
    expect(canViewWorkItem(project, null)).toBe(true)
    const hidden = { ...project, status: 'pending_review' }
    expect(canViewWorkItem(hidden, null)).toBe(false)
    expect(canViewWorkItem(hidden, admin)).toBe(true)
    expect(canViewWorkItem(hidden, creator)).toBe(true)
    expect(canViewWorkItem(hidden, other)).toBe(false)
  })

  it('restricts a team project to participants and team-privy viewers', () => {
    const teamProject = { ...project, teamId: 9 }
    expect(canViewWorkItem(teamProject, other)).toBe(false)
    expect(canViewWorkItem(teamProject, other, undefined, { team: true, country: true })).toBe(true)
    expect(canViewWorkItem(teamProject, owner)).toBe(true)
    expect(canViewWorkItem(teamProject, admin)).toBe(true)
    expect(canViewWorkItem(teamProject, null)).toBe(false)
  })

  it('keeps a country-scoped project to its country, its participants and the privy', () => {
    const swedish = { ...project, country: 'SE', remoteEligibility: 'NONE' }
    const inUk = { ...other, country: 'UK' }
    expect(canViewWorkItem(swedish, inUk)).toBe(false)
    expect(canViewWorkItem(swedish, { ...other, country: 'SE' })).toBe(true)
    // No country given: not held to the rule.
    expect(canViewWorkItem(swedish, other)).toBe(true)
    expect(canViewWorkItem(swedish, { ...owner, country: 'UK' })).toBe(true)
    expect(canViewWorkItem(swedish, { ...admin, country: 'UK' })).toBe(true)
    expect(canViewWorkItem(swedish, inUk, undefined, { team: false, country: true })).toBe(true)
    // Remote within Sweden is still Sweden's; remote anywhere is everyone's.
    expect(canViewWorkItem({ ...swedish, remoteEligibility: 'COUNTRY' }, inUk)).toBe(false)
    expect(canViewWorkItem({ ...swedish, remoteEligibility: 'GLOBAL' }, inUk)).toBe(true)
    const task = { type: 'TASK', status: 'open', creatorId: 2, assigneeId: null, ...anywhere }
    expect(canViewWorkItem(task, inUk, swedish)).toBe(false)
    expect(isOutsideCountry(swedish, 'UK')).toBe(true)
    expect(isOutsideCountry(swedish, null)).toBe(false)
  })

  it('a task follows its parent project, or is admin-only without one', () => {
    const task = { type: 'TASK', status: 'open', creatorId: 2, assigneeId: null, ...anywhere }
    expect(canViewWorkItem(task, other, project)).toBe(true)
    expect(canViewWorkItem(task, other, null)).toBe(false)
    expect(canViewWorkItem(task, admin)).toBe(true)
  })

  it('open unclaimed quick tasks are visible to approved volunteers only; claimed ones to participants', () => {
    const open = { type: 'QUICK_TASK', status: 'open', creatorId: 3, assigneeId: null, ...anywhere }
    expect(canViewWorkItem(open, other)).toBe(true)
    expect(canViewWorkItem(open, pending)).toBe(false)
    expect(canViewWorkItem(open, null)).toBe(false)
    const claimed = { ...open, status: 'in_progress', assigneeId: 2 }
    expect(canViewWorkItem(claimed, owner)).toBe(true)
    expect(canViewWorkItem(claimed, creator)).toBe(true)
    expect(canViewWorkItem(claimed, other)).toBe(false)
  })

  it('unknown types are admin-only', () => {
    const weird = { type: 'OTHER', status: 'x', creatorId: null, assigneeId: null, ...anywhere }
    expect(canViewWorkItem(weird, admin)).toBe(true)
    expect(canViewWorkItem(weird, other)).toBe(false)
  })
})

describe('canPostComment', () => {
  it('admins always; project participants and accepted helpers', () => {
    expect(canPostComment(project, admin)).toBe(true)
    expect(canPostComment(project, owner)).toBe(true)
    expect(canPostComment(project, creator)).toBe(true)
    expect(canPostComment(project, other)).toBe(false)
    expect(canPostComment(project, other, { isAcceptedHelper: true })).toBe(true)
  })
  it('task: assignee, project owner or accepted helper', () => {
    const task = { type: 'TASK', status: 'open', creatorId: 3, assigneeId: 4, ...anywhere }
    expect(canPostComment(task, other)).toBe(true)
    expect(canPostComment(task, owner, { parent: project })).toBe(true)
    expect(canPostComment(task, creator)).toBe(false)
    expect(canPostComment(task, creator, { isAcceptedHelper: true })).toBe(true)
  })
  it('quick task: assignee only; unknown types never', () => {
    const qt = {
      type: 'QUICK_TASK',
      status: 'in_progress',
      creatorId: 3,
      assigneeId: 4,
      ...anywhere,
    }
    expect(canPostComment(qt, other)).toBe(true)
    expect(canPostComment(qt, creator)).toBe(false)
    expect(canPostComment({ ...qt, type: 'OTHER' }, other)).toBe(false)
  })
})

describe('canManageProject', () => {
  it('admin, owner, or draft creator', () => {
    const p = { creatorId: 3, assigneeId: 2, status: 'ready' }
    expect(canManageProject(p, { id: 9, isAdmin: true })).toBe(true)
    expect(canManageProject(p, { id: 2, isAdmin: false })).toBe(true)
    expect(canManageProject(p, { id: 3, isAdmin: false })).toBe(false)
    expect(canManageProject({ ...p, status: 'draft' }, { id: 3, isAdmin: null })).toBe(true)
  })
})

describe('resolveTeamPrivy', () => {
  it('is false without a team, true for a member or accepted helper', async () => {
    const vol = await createVolunteer()
    const team = await createTeam()
    const proj = await createProject({ teamId: team.id })
    expect(await resolveTeamPrivy(null, proj.id, vol.id)).toBe(false)
    expect(await resolveTeamPrivy(team.id, proj.id, vol.id)).toBe(false)
    await prisma.workItemInterest.create({
      data: { workItemId: proj.id, volunteerId: vol.id, status: 'accepted', interestType: 'help' },
    })
    expect(await resolveTeamPrivy(team.id, proj.id, vol.id)).toBe(true)
    const member = await createVolunteer()
    await prisma.teamMembership.create({ data: { teamId: team.id, volunteerId: member.id } })
    expect(await resolveTeamPrivy(team.id, proj.id, member.id)).toBe(true)
  })
})

describe('resolveProjectPrivy and canSeeProjectScope', () => {
  it('exempt from the country rule: anyone who applied, was added, holds a task, or is in the team', async () => {
    const owner = await createVolunteer({ country: 'SE' })
    const outsider = await createVolunteer({ country: 'UK' })
    const proj = await createProject({ country: 'SE', assigneeId: owner.id })
    const viewer = { id: outsider.id, isAdmin: false, country: 'UK' }
    expect(await resolveProjectPrivy(proj, viewer)).toEqual({ team: false, country: false })
    expect(await canSeeProjectScope(proj, viewer)).toBe(false)
    expect(await canSeeProjectScope(proj, { ...viewer, country: 'SE' })).toBe(true)
    expect(await canSeeProjectScope(proj, { ...viewer, isAdmin: true })).toBe(true)
    expect(await canSeeProjectScope(proj, { id: owner.id, isAdmin: false, country: 'UK' })).toBe(
      true,
    )

    await prisma.workItemInterest.create({
      data: { workItemId: proj.id, volunteerId: outsider.id, interestType: 'help' },
    })
    expect(await canSeeProjectScope(proj, viewer)).toBe(true)

    const tasked = await createVolunteer({ country: 'UK' })
    await createTask(proj.id, { assigneeId: tasked.id })
    expect(await canSeeProjectScope(proj, { id: tasked.id, isAdmin: false, country: 'UK' })).toBe(
      true,
    )

    const team = await createTeam()
    const teamProj = await createProject({ country: 'SE', teamId: team.id })
    const member = await createVolunteer({ country: 'UK' })
    const memberView = { id: member.id, isAdmin: false, country: 'UK' }
    expect(await canSeeProjectScope(teamProj, memberView)).toBe(false)
    await prisma.teamMembership.create({ data: { teamId: team.id, volunteerId: member.id } })
    expect(await resolveProjectPrivy(teamProj, memberView)).toEqual({ team: true, country: true })
    expect(await canSeeProjectScope(teamProj, memberView)).toBe(true)
    // In the right country but not in the team.
    expect(
      await canSeeProjectScope(teamProj, { id: outsider.id, isAdmin: false, country: 'SE' }),
    ).toBe(false)
  })
})

describe('withProjectExtras', () => {
  it('serialises a project loaded with projectInclude, deriving flags and match', async () => {
    const owner = await createVolunteer()
    const team = await createTeam()
    const cat = await prisma.skillCategory.create({ data: { name: 'Cat-extras' } })
    const skill = await prisma.skill.create({ data: { name: 'S-extras', categoryId: cat.id } })
    const proj = await createProject({
      assigneeId: owner.id,
      creatorId: owner.id,
      status: 'in_progress',
      teamId: team.id,
      skills: { create: [{ skillId: skill.id, isRequired: true }] },
    })
    const loaded = await prisma.workItem.findUniqueOrThrow({
      where: { id: proj.id },
      include: projectInclude,
    })
    const out = withProjectExtras(
      loaded as EnrichedProject,
      new Set([skill.id]),
      new Set([team.id]),
    )
    expect(out).toMatchObject({
      ownerId: owner.id,
      proposedById: owner.id,
      isSeekingOwner: false,
      needsTasks: true,
      openTaskCount: 0,
      isMyTeam: true,
      owner: { id: owner.id, name: owner.name },
      team: { id: team.id, name: team.name },
      pendingInterestCount: 0,
      isAnchor: false,
      match: { matchedRequiredCount: 1, totalRequired: 1, requiredMatchPercent: 100 },
    })
    expect(out.skills[0]).toMatchObject({
      name: 'S-extras',
      categoryName: 'Cat-extras',
      isRequired: true,
    })

    const bare = withProjectExtras(loaded as EnrichedProject)
    expect(bare).not.toHaveProperty('match')
    expect(bare.isMyTeam).toBe(false)
  })
})

describe('serializers', () => {
  const schedule = {
    startDate: null,
    durationDays: 3,
    baselineStartDate: null,
    baselineDurationDays: null,
    baselineSetAt: null,
    scheduleUpdatedAt: null,
    startedAt: null,
  }
  it('serializeTask maps work item columns to the task API shape', () => {
    const out = serializeTask({
      ...schedule,
      id: 1,
      parentId: 2,
      title: 'T',
      description: null,
      assigneeId: 3,
      creatorId: 4,
      status: 'open',
      estimatedHours: 1.5,
      deadline: null,
      completedAt: null,
      createdAt: null,
      updatedAt: null,
    })
    expect(out).toMatchObject({
      projectId: 2,
      assignedToId: 3,
      createdById: 4,
      isAnchor: false,
      durationDays: 3,
    })
  })
  it('serializeStarterTask maps columns to the quick task API shape', () => {
    const out = serializeStarterTask({
      id: 1,
      contextProjectId: 2,
      title: 'Q',
      description: null,
      skillId: null,
      assigneeId: 3,
      creatorId: 4,
      status: 'open',
      reviewRating: null,
      reviewNotes: null,
      reviewedById: null,
      reviewedAt: null,
      estimatedHours: null,
      createdAt: null,
      updatedAt: null,
    })
    expect(out).toMatchObject({ projectId: 2, assignedToId: 3, assignedById: 4 })
  })
})

describe('applyScheduleWrite', () => {
  it('is a no-op when neither field is present', () => {
    const data: Record<string, unknown> = {}
    expect(applyScheduleWrite(data, {})).toBe(false)
    expect(data).toEqual({})
  })
  it('stamps scheduleUpdatedAt whenever a schedule field moves', () => {
    const now = new Date('2026-01-01')
    const data: Record<string, unknown> = {}
    expect(applyScheduleWrite(data, { startDate: null }, now)).toBe(true)
    expect(data).toEqual({ startDate: null, scheduleUpdatedAt: now })
    const data2: Record<string, unknown> = {}
    applyScheduleWrite(data2, { durationDays: 4 }, now)
    expect(data2).toEqual({ durationDays: 4, scheduleUpdatedAt: now })
  })
})
