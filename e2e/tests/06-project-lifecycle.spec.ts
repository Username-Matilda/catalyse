import { test, expect, getAlert, readAdminToken, createApprovedVolunteer } from '../fixtures'
import { goToDashboardNotifications } from '../actions/dashboard'
import { fake } from '../fake'
import { createApiClient } from '../client'
import {
  proposeProject,
  adminCreateProject,
  adminApproveProject,
  setProjectStatus,
  adminRecordOutcome,
  transferProjectOwnership,
} from '../actions/projects'

test.describe('Project Lifecycle', () => {
  test('Volunteer proposes a project with tasks; admin approves; project moves to Seeking Owner', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const title = fake.projectTitle()
    const projectId = await proposeProject(
      baseUrl,
      volunteer.page,
      title,
      'Test proposal description',
    )
    await adminApproveProject(baseUrl, adminPage, title)

    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
    await expect(volunteer.page.getByLabel('project status')).toContainText('Seeking Owner', {
      timeout: 10_000,
    })
  })

  test('Admin sends a proposed project back for discussion', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const title = fake.projectTitle()
    const feedbackText = fake.feedbackText()
    await proposeProject(baseUrl, volunteer.page, title, 'Test proposal for discussion')

    await adminPage.goto(`${baseUrl}/admin/triage`)
    const projectCard = adminPage.locator('.card').filter({ hasText: title })
    await expect(projectCard).toBeVisible({ timeout: 10_000 })
    await projectCard.getByRole('link', { name: 'Review' }).click()
    await expect(adminPage.getByRole('heading', { name: 'Review Project' })).toBeVisible({
      timeout: 10_000,
    })

    await adminPage.getByRole('radio', { name: /Needs Discussion/ }).click()
    await adminPage.getByLabel('Message to Proposer').fill(feedbackText)
    await adminPage.getByRole('button', { name: 'Submit Review' }).click()
    await expect(getAlert(adminPage)).toBeVisible({ timeout: 10_000 })

    // Project status becomes needs_discussion — visible in the triage "Needs Discussion" tab
    await adminPage.goto(`${baseUrl}/admin/triage`)
    await adminPage.getByRole('tab', { name: 'Needs Discussion' }).click()
    await expect(adminPage.locator('.card').filter({ hasText: title })).toBeVisible({
      timeout: 10_000,
    })

    // Proposer receives a notification containing the feedback message
    await goToDashboardNotifications(baseUrl, volunteer.page)
    await expect(volunteer.page.locator('p').filter({ hasText: feedbackText })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('Discussion message and admin follow-up appear in the proposer comment thread', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const title = fake.projectTitle()
    const feedbackText = fake.feedbackText()
    const projectId = await proposeProject(baseUrl, volunteer.page, title, 'Discussion thread test')

    // Admin sends it back for discussion with a message
    await adminPage.goto(`${baseUrl}/admin/triage`)
    const card = adminPage.locator('.card').filter({ hasText: title })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.getByRole('link', { name: 'Review' }).click()
    await expect(adminPage.getByRole('heading', { name: 'Review Project' })).toBeVisible({
      timeout: 10_000,
    })
    await adminPage.getByRole('radio', { name: /Needs Discussion/ }).click()
    await adminPage.getByLabel('Message to Proposer').fill(feedbackText)
    await adminPage.getByRole('button', { name: 'Submit Review' }).click()
    await expect(getAlert(adminPage)).toBeVisible({ timeout: 10_000 })

    // Proposer sees the review message as a comment on their project
    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
    await expect(volunteer.page.getByText(feedbackText)).toBeVisible({ timeout: 10_000 })

    // Admin posts a follow-up reply via the triage modal thread
    const followUp = fake.feedbackText()
    await adminPage.goto(`${baseUrl}/admin/triage`)
    await adminPage.getByRole('tab', { name: 'Needs Discussion' }).click()
    const discussionCard = adminPage.locator('.card').filter({ hasText: title })
    await expect(discussionCard).toBeVisible({ timeout: 10_000 })
    await discussionCard.getByRole('link', { name: 'Review' }).click()
    await expect(adminPage.getByRole('heading', { name: 'Review Project' })).toBeVisible({
      timeout: 10_000,
    })
    await adminPage.getByLabel('Add a comment').fill(followUp)
    await adminPage.getByRole('button', { name: 'Post Comment' }).click()
    await expect(getAlert(adminPage)).toContainText('Comment added', { timeout: 10_000 })

    // Proposer sees the follow-up too
    await volunteer.page.goto(`${baseUrl}/projects/${projectId}`)
    await expect(volunteer.page.getByText(followUp)).toBeVisible({ timeout: 10_000 })
  })

  test('Admin creates an org-proposed project', async ({ adminPage, baseUrl }) => {
    const title = fake.projectTitle()
    await adminCreateProject(baseUrl, adminPage, title, 'Admin-created project description')

    // Project starts in_progress since it must be created with at least one task
    await expect(adminPage.getByLabel('project status')).toContainText('In Progress', {
      timeout: 10_000,
    })

    // Project does not appear in the triage queue
    await adminPage.goto(`${baseUrl}/admin/triage`)
    await expect(adminPage.locator('.card').filter({ hasText: title })).not.toBeVisible({
      timeout: 5_000,
    })
  })

  test('Owner moves an `in_progress` project to completed', async ({
    adminPage,
    volunteer,
    baseUrl,
  }) => {
    const title = fake.projectTitle()
    const projectId = await proposeProject(
      baseUrl,
      volunteer.page,
      title,
      'Project to be completed by owner',
    )
    await adminApproveProject(baseUrl, adminPage, title)

    // Admin assigns volunteer as owner via the Transfer Ownership UI
    await transferProjectOwnership(baseUrl, adminPage, projectId, volunteer.name)

    // Owner (volunteer) changes status to completed via the dropdown
    await setProjectStatus(baseUrl, volunteer.page, projectId, 'completed')

    // Project appears in the completed tab on the projects index
    await volunteer.page.goto(`${baseUrl}/projects`)
    await expect(
      volunteer.page.getByRole('heading', { name: 'Projects', exact: true }),
    ).toBeVisible({ timeout: 10_000 })
    await volunteer.page.getByRole('button', { name: 'Status filter' }).click()
    await volunteer.page.getByRole('option', { name: 'Completed' }).click()
    await expect(volunteer.page.getByRole('link', { name: title })).toBeVisible({ timeout: 10_000 })
  })

  test('Admin records a successful project outcome', async ({ adminPage, volunteer, baseUrl }) => {
    const title = fake.projectTitle()
    const outcomeNotes = fake.outcomeNotes()

    // Create project with a required skill
    const projectId = await proposeProject(
      baseUrl,
      volunteer.page,
      title,
      'Project for outcome recording',
      'Fundraising',
    )
    await adminApproveProject(baseUrl, adminPage, title)

    // Admin assigns volunteer as owner via the Transfer Ownership UI
    await transferProjectOwnership(baseUrl, adminPage, projectId, volunteer.name)

    // Set project to completed
    await setProjectStatus(baseUrl, adminPage, projectId, 'completed')

    // Admin records outcome as successful with notes
    await adminRecordOutcome(baseUrl, adminPage, projectId, 'successful', outcomeNotes)

    // Outcome is visible on the project detail
    await adminPage.goto(`${baseUrl}/projects/${projectId}`)
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
    // dnd-kit's DndContext (used for task reordering) injects its own hidden
    // role="status" live region, so scope to the visible outcome banner.
    const outcomeDisplay = adminPage.getByRole('status').filter({ hasText: 'Outcome' })
    await expect(outcomeDisplay).toBeVisible({ timeout: 10_000 })
    await expect(outcomeDisplay).toContainText('Successful')
    await expect(outcomeDisplay).toContainText(outcomeNotes)
  })

  // SKIPPED: The app has no UI that displays a volunteer's endorsements — there is no profile
  // view, directory card, or project page that shows "endorsed via project_outcome". The only
  // way to verify this is via the admin API endpoint, which requires the volunteer's numeric ID.
  // Skip until endorsements become visible somewhere in the UI.
  test.skip('Required-skill endorsements are created for the project owner on a successful outcome', async () => {})
})

test.describe('Project Creation Requires At Least One Task', () => {
  test('Suggesting a project without any task shows a validation error', async ({
    volunteer,
    baseUrl,
  }) => {
    await volunteer.page.goto(`${baseUrl}/suggest`)
    await expect(
      volunteer.page.getByRole('button', { name: 'Submit Project Proposal' }),
    ).toBeVisible({ timeout: 10_000 })

    await volunteer.page.getByLabel('Project Title').fill(fake.projectTitle())
    await volunteer.page.getByLabel('Description').fill('Proposal with no tasks')
    await volunteer.page.getByRole('button', { name: 'Submit Project Proposal' }).click()

    await expect(getAlert(volunteer.page)).toContainText(
      'At least one task with a title is required.',
      { timeout: 10_000 },
    )
    // Still on the form — submission was blocked client-side, no navigation happened
    await expect(
      volunteer.page.getByRole('button', { name: 'Submit Project Proposal' }),
    ).toBeVisible()
  })

  test('Creating an org project without any task shows a validation error', async ({
    adminPage,
    baseUrl,
  }) => {
    await adminPage.goto(`${baseUrl}/admin/projects/new`)
    await expect(
      adminPage.getByRole('heading', { name: 'Create Organisation Project' }),
    ).toBeVisible({ timeout: 10_000 })

    await adminPage.getByLabel('Project Title').fill(fake.projectTitle())
    await adminPage.getByLabel('Description').fill('Org project with no tasks')
    await adminPage.getByRole('button', { name: 'Create Project' }).click()

    await expect(getAlert(adminPage)).toContainText('At least one task with a title is required.', {
      timeout: 10_000,
    })
  })

  test('The API rejects a project proposal with no tasks', async ({ baseUrl }) => {
    const volunteer = await createApprovedVolunteer(baseUrl)
    const api = createApiClient(baseUrl, volunteer.token)

    const result = await api.projects.create({
      body: {
        title: fake.projectTitle(),
        description: 'Proposal with no tasks, sent directly to the API',
        projectType: null,
        estimatedDuration: null,
        timeCommitmentHoursPerWeek: null,
        urgency: 'medium',
        collaborationLink: null,
        country: null,
        localGroup: null,
        isSeekingHelp: true,
        isSeekingOwner: true,
        tasks: [],
      },
    })

    expect(result.status).toBe(400)
    expect(JSON.stringify(result.body)).toContain('At least one task is required')
  })

  test('The API rejects an org project with no tasks', async ({ baseUrl }) => {
    const adminApi = createApiClient(baseUrl, readAdminToken(baseUrl))

    const result = await adminApi.admin.projects.create({
      body: {
        title: fake.projectTitle(),
        description: 'Org project with no tasks, sent directly to the API',
        projectType: null,
        estimatedDuration: null,
        timeCommitmentHoursPerWeek: null,
        urgency: 'medium',
        collaborationLink: null,
        country: null,
        localGroup: null,
        isSeekingHelp: false,
        isSeekingOwner: false,
        tasks: [],
      },
    })

    expect(result.status).toBe(400)
    expect(JSON.stringify(result.body)).toContain('At least one task is required')
  })
})
