import { describe, it, expect } from 'vitest'
import { screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { prisma } from '@/lib/prisma'
import {
  createVolunteer,
  createAdmin,
  createProject,
  createQuickTask,
  createSkill,
} from '@/test/factories'
import { renderApp } from '@/test/render'
import { clientAs } from '@/test/rpc'
import QuickTaskDetailPage from './quick-tasks/[id]/page'
import BugReportDetailPage from './bugs/[id]/page'

const row = (id: number) => prisma.workItem.findUniqueOrThrow({ where: { id } })

describe('quick task detail', () => {
  it('walks a task from open through claim, submit and review', async () => {
    const me = await createVolunteer()
    const skill = await createSkill()
    const project = await createProject({ title: 'Ctx project' })
    const task = await createQuickTask({
      title: 'Detail task',
      skillId: skill.id,
      estimatedHours: 2,
      contextProjectId: project.id,
    })
    const page = () =>
      renderApp(<QuickTaskDetailPage params={Promise.resolve({ id: String(task.id) })} />, {
        as: me,
      })
    await page()
    await screen.findByRole('heading', { name: 'Detail task' })
    expect(screen.getByText(skill.name)).toBeInTheDocument()
    expect(screen.getByText('~2h estimated')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Related project: Ctx project' })).toHaveAttribute(
      'href',
      `/projects/${project.id}`,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
    await screen.findByText('Task claimed!')
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as Complete' }))
    await screen.findByText('Task submitted for review!')
    await waitFor(async () => expect((await row(task.id)).status).toBe('under_review'))
    await screen.findAllByText(/awaiting review|under review/i)
    await clientAs(await createAdmin()).quickTasks.review({
      id: task.id,
      reviewRating: 'excellent',
      reviewNotes: 'top',
    })
    cleanup()
    await page()
    await screen.findByText('Excellent')
  })

  it('reports claim/submit failures and unknown tasks', async () => {
    const me = await createVolunteer()
    const rival = await createVolunteer()
    const task = await createQuickTask({ title: 'Contested', description: null })
    await renderApp(<QuickTaskDetailPage params={Promise.resolve({ id: String(task.id) })} />, {
      as: me,
    })
    await screen.findByRole('button', { name: 'Claim' })
    await prisma.workItem.update({
      where: { id: task.id },
      data: { assigneeId: rival.id, status: 'in_progress' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
    await screen.findByText('This task has already been claimed')
    cleanup()
    const mine = await createQuickTask({ title: 'Mine', assigneeId: me.id, status: 'in_progress' })
    await renderApp(<QuickTaskDetailPage params={Promise.resolve({ id: String(mine.id) })} />, {
      as: me,
    })
    await screen.findByRole('button', { name: 'Mark as Complete' })
    await prisma.workItem.update({ where: { id: mine.id }, data: { assigneeId: rival.id } })
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Complete' }))
    await screen.findByText('Task not found or not assigned to you')
    cleanup()
    await renderApp(<QuickTaskDetailPage params={Promise.resolve({ id: '999999' })} />, { as: me })
    await screen.findByRole('link', { name: 'Back to My Tasks' })
    cleanup()
    await renderApp(<QuickTaskDetailPage params={Promise.resolve({ id: 'nope' })} />, { as: me })
    await screen.findByRole('link', { name: 'Back to My Tasks' })
  })
})

describe('bug report detail', () => {
  it('shows a report to its reporter, and lets an admin update it', async () => {
    const reporter = await createVolunteer()
    const admin = await createAdmin({ name: 'Fixer' })
    const { id } = await clientAs(reporter).bugReports.create({
      title: 'Broken button',
      description: 'It does nothing at all',
      pageUrl: 'https://evil.example/projects/3?x=1',
      category: 'ux',
      severity: 'high',
    })
    await prisma.bugReport.update({
      where: { id },
      data: { assigneeId: admin.id, resolutionNotes: 'Looking into it' },
    })
    await renderApp(<BugReportDetailPage params={Promise.resolve({ id: String(id) })} />, {
      as: reporter,
    })
    await screen.findByRole('heading', { name: 'Broken button' })
    expect(screen.getByRole('link', { name: '/projects/3?x=1' })).toHaveAttribute(
      'href',
      '/projects/3?x=1',
    )
    expect(screen.getByText('Resolution: Looking into it')).toBeInTheDocument()
    expect(screen.queryByText(/Assigned to/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull()

    cleanup()
    await renderApp(<BugReportDetailPage params={Promise.resolve({ id: String(id) })} />, {
      as: admin,
    })
    await screen.findByText('· Assigned to: Fixer')
    expect(screen.getByRole('link', { name: '← Back to Bug Reports' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Resolved' }))
    await userEvent.clear(screen.getByLabelText('Resolution Notes'))
    await userEvent.type(screen.getByLabelText('Resolution Notes'), 'Fixed in #12')
    await userEvent.click(screen.getByRole('button', { name: 'Update' }))
    await screen.findByText('Report updated!')
    await waitFor(async () =>
      expect(await prisma.bugReport.findUniqueOrThrow({ where: { id } })).toMatchObject({
        status: 'resolved',
        resolutionNotes: 'Fixed in #12',
      }),
    )
    await prisma.bugReport.delete({ where: { id } })
    await userEvent.click(screen.getByRole('button', { name: 'Update' }))
    await screen.findByText('Bug report not found')
  })

  it('renders unlinkable page URLs as text, and a not-found state', async () => {
    const admin = await createAdmin()
    const report = await prisma.bugReport.create({
      data: {
        title: 'Odd URL',
        description: 'Ten characters at least',
        pageUrl: 'mailto:x@y.z',
        category: null,
        severity: null,
      },
    })
    await renderApp(<BugReportDetailPage params={Promise.resolve({ id: String(report.id) })} />, {
      as: admin,
    })
    await screen.findByText(/mailto:x@y\.z/)
    expect(screen.queryByRole('link', { name: /mailto/ })).toBeNull()
    cleanup()
    await renderApp(<BugReportDetailPage params={Promise.resolve({ id: '999999' })} />, {
      as: admin,
    })
    await screen.findByText(/not found/i)
  })
})
