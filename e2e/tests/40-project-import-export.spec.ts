import { test, expect, readAdminToken, createApprovedVolunteer } from '../fixtures'
import { fake } from '../fake'
import { createApiClient } from '../client'
import type { RouterClient } from '@orpc/server'
import type { appRouter } from '../../server/router'

type Api = RouterClient<typeof appRouter>

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

async function makeProject(api: Api, opts: { startDate?: Date } = {}): Promise<number> {
  const created = await api.admin.projects.create({
    body: {
      title: fake.projectTitle(),
      description: 'Import/export fixture',
      projectType: null,
      estimatedDuration: null,
      timeCommitmentHoursPerWeek: null,
      urgency: 'medium',
      collaborationLink: null,
      country: null,
      localGroup: null,
      remoteEligibility: 'NONE',
      isSeekingHelp: false,
      skillIds: [],
      skillRequiredMap: {},
      startDate: opts.startDate ?? null,
      tasks: [{ title: 'Seed task' }],
    },
  })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
  return (created.body as { id: number }).id
}

async function addTask(
  api: Api,
  projectId: number,
  opts: { title?: string; startDate?: Date | null; durationDays?: number | null } = {},
): Promise<number> {
  const res = await api.projects.createTask({
    body: {
      projectId,
      title: opts.title ?? fake.quickTaskTitle(),
      startDate: opts.startDate ?? null,
      durationDays: opts.durationDays ?? null,
    },
  })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return (res.body as { id: number }).id
}

type ExportPayload = {
  _meta: { baseHash: string }
  project: { id: number; title: string; description: string | null; status: string }
  tasks: Array<{
    id?: number
    ref?: string
    title: string
    description: string | null
    status: string
    assigneeEmail: string | null
    deadline: string | null
    startDate: string | null
    durationDays: number | null
    featuredAsQuickTask: boolean
    dependsOn: Array<{ on: number | string; lagDays?: number }>
  }>
}

async function exportProject(api: Api, projectId: number): Promise<ExportPayload> {
  const res = await api.projects.exportPlan({ body: { projectId } })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body as ExportPayload
}

async function preview(api: Api, projectId: number, file: unknown) {
  const res = await api.projects.previewImport({
    body: { projectId, file: JSON.stringify(file) },
  })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body as Awaited<ReturnType<Api['projects']['previewImport']>>
}

async function listTasks(api: Api, projectId: number) {
  const res = await api.projects.listTasks({ body: { projectId } })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body as {
    tasks: { id: number; title: string; durationDays: number | null }[]
    dependencies: { predecessorId: number; successorId: number; lagDays: number }[]
  }
}

test.describe('Project import / export', () => {
  test('round-tripping an unchanged export shows no changes', async ({ baseUrl }) => {
    const api = createApiClient(baseUrl, readAdminToken(baseUrl))
    const projectId = await makeProject(api, { startDate: day('2026-03-02') })
    await addTask(api, projectId, { title: 'A', startDate: day('2026-03-03'), durationDays: 3 })

    const file = await exportProject(api, projectId)
    const diff = await preview(api, projectId, file)

    expect(diff.errors).toHaveLength(0)
    expect(diff.project.op).toBe('noop')
    expect(diff.tasks.every((t) => t.op === 'noop')).toBe(true)
    expect(diff.dependencies.every((d) => d.op === 'noop')).toBe(true)
  })

  test('an edited field is reported and applied', async ({ baseUrl }) => {
    const api = createApiClient(baseUrl, readAdminToken(baseUrl))
    const projectId = await makeProject(api, { startDate: day('2026-04-01') })
    const taskId = await addTask(api, projectId, { title: 'Before', durationDays: 2 })

    const file = await exportProject(api, projectId)
    const row = file.tasks.find((t) => t.id === taskId)!
    row.title = 'After'
    row.durationDays = 6

    const diff = await preview(api, projectId, file)
    const entry = diff.tasks.find((t) => t.identity.id === taskId)!
    expect(entry.op).toBe('update')
    expect(entry.fieldChanges.map((c) => c.field).sort()).toEqual(['durationDays', 'title'])

    const applied = await api.projects.applyImport({
      body: {
        projectId,
        file: JSON.stringify(file),
        expectedHash: diff.meta.currentHash,
      },
    })
    expect(applied.status, JSON.stringify(applied.body)).toBe(200)

    const { tasks } = await listTasks(api, projectId)
    const updated = tasks.find((t) => t.id === taskId)!
    expect(updated.title).toBe('After')
    expect(updated.durationDays).toBe(6)
  })

  test('a new task row is created', async ({ baseUrl }) => {
    const api = createApiClient(baseUrl, readAdminToken(baseUrl))
    const projectId = await makeProject(api, { startDate: day('2026-05-01') })

    const file = await exportProject(api, projectId)
    file.tasks.push({
      ref: 'new1',
      title: 'Fresh task',
      description: null,
      status: 'open',
      assigneeEmail: null,
      deadline: null,
      startDate: '2026-05-04',
      durationDays: 2,
      featuredAsQuickTask: false,
      dependsOn: [],
    })

    const diff = await preview(api, projectId, file)
    expect(diff.errors).toHaveLength(0)
    expect(diff.tasks.some((t) => t.op === 'create' && t.identity.title === 'Fresh task')).toBe(
      true,
    )

    const applied = await api.projects.applyImport({
      body: { projectId, file: JSON.stringify(file), expectedHash: diff.meta.currentHash },
    })
    expect(applied.status, JSON.stringify(applied.body)).toBe(200)

    const { tasks } = await listTasks(api, projectId)
    expect(tasks.some((t) => t.title === 'Fresh task')).toBe(true)
  })

  test('an unticked deletion candidate is kept; a ticked one is removed', async ({ baseUrl }) => {
    const api = createApiClient(baseUrl, readAdminToken(baseUrl))
    const projectId = await makeProject(api, { startDate: day('2026-06-01') })
    const keep = await addTask(api, projectId, { title: 'Keep' })
    const drop = await addTask(api, projectId, { title: 'Drop' })

    const file = await exportProject(api, projectId)
    file.project.title = `${file.project.title} (edited)`
    file.tasks = file.tasks.filter((t) => t.id !== keep && t.id !== drop)

    const diff = await preview(api, projectId, file)
    expect(
      diff.tasks
        .filter((t) => t.op === 'delete')
        .map((t) => t.identity.id)
        .sort(),
    ).toEqual([keep, drop].sort())

    // No confirmed deletions → both survive, only the project edit lands.
    const kept = await api.projects.applyImport({
      body: { projectId, file: JSON.stringify(file), expectedHash: diff.meta.currentHash },
    })
    expect(kept.status, JSON.stringify(kept.body)).toBe(200)
    expect((kept.body as { deleted: number }).deleted).toBe(0)

    let tasks = (await listTasks(api, projectId)).tasks
    expect(tasks.map((t) => t.id)).toEqual(expect.arrayContaining([keep, drop]))

    // Now tick just one.
    const diff2 = await preview(api, projectId, file)
    const confirmed = await api.projects.applyImport({
      body: {
        projectId,
        file: JSON.stringify(file),
        expectedHash: diff2.meta.currentHash,
        confirmedDeleteIds: [drop],
      },
    })
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)

    tasks = (await listTasks(api, projectId)).tasks
    expect(tasks.map((t) => t.id)).toContain(keep)
    expect(tasks.map((t) => t.id)).not.toContain(drop)
  })

  test('a dependency is added via the file', async ({ baseUrl }) => {
    const api = createApiClient(baseUrl, readAdminToken(baseUrl))
    const projectId = await makeProject(api, { startDate: day('2026-07-01') })
    const a = await addTask(api, projectId, {
      title: 'First',
      startDate: day('2026-07-01'),
      durationDays: 3,
    })
    const b = await addTask(api, projectId, { title: 'Second', durationDays: 2 })

    const file = await exportProject(api, projectId)
    file.tasks.find((t) => t.id === b)!.dependsOn = [{ on: a, lagDays: 0 }]

    const diff = await preview(api, projectId, file)
    expect(diff.errors).toHaveLength(0)
    expect(diff.dependencies.some((d) => d.op === 'create')).toBe(true)

    const applied = await api.projects.applyImport({
      body: { projectId, file: JSON.stringify(file), expectedHash: diff.meta.currentHash },
    })
    expect(applied.status, JSON.stringify(applied.body)).toBe(200)

    const { dependencies } = await listTasks(api, projectId)
    expect(dependencies).toMatchObject([{ predecessorId: a, successorId: b, lagDays: 0 }])
  })

  test('a dependency loop in the file is rejected', async ({ baseUrl }) => {
    const api = createApiClient(baseUrl, readAdminToken(baseUrl))
    const projectId = await makeProject(api, { startDate: day('2026-08-01') })
    const a = await addTask(api, projectId, { title: 'A' })
    const b = await addTask(api, projectId, { title: 'B' })

    const file = await exportProject(api, projectId)
    file.tasks.find((t) => t.id === a)!.dependsOn = [{ on: b }]
    file.tasks.find((t) => t.id === b)!.dependsOn = [{ on: a }]

    const diff = await preview(api, projectId, file)
    expect(diff.errors.some((e) => /loop/i.test(e.message))).toBe(true)

    const applied = await api.projects.applyImport({
      body: { projectId, file: JSON.stringify(file), expectedHash: diff.meta.currentHash },
    })
    expect(applied.status).toBe(400)
  })

  test('a dependency on a task from another project is rejected', async ({ baseUrl }) => {
    const api = createApiClient(baseUrl, readAdminToken(baseUrl))
    const p1 = await makeProject(api, { startDate: day('2026-09-01') })
    const p2 = await makeProject(api, { startDate: day('2026-09-01') })
    const t1 = await addTask(api, p1, { title: 'Mine' })
    const foreign = await addTask(api, p2, { title: 'Theirs' })

    const file = await exportProject(api, p1)
    file.tasks.find((t) => t.id === t1)!.dependsOn = [{ on: foreign }]

    const diff = await preview(api, p1, file)
    expect(diff.errors.length).toBeGreaterThan(0)
  })

  test('an export from before a change is rejected as stale', async ({ baseUrl }) => {
    const api = createApiClient(baseUrl, readAdminToken(baseUrl))
    const projectId = await makeProject(api, { startDate: day('2026-10-01') })
    const taskId = await addTask(api, projectId, { title: 'Original' })

    const file = await exportProject(api, projectId)
    const diff = await preview(api, projectId, file)

    // Someone else edits the project after the preview.
    const edit = await api.projects.updateTask({
      body: { projectId, taskId, data: { title: 'Changed underneath' } },
    })
    expect(edit.status).toBe(200)

    file.tasks.find((t) => t.id === taskId)!.title = 'From my file'
    const applied = await api.projects.applyImport({
      body: { projectId, file: JSON.stringify(file), expectedHash: diff.meta.currentHash },
    })
    expect(applied.status).toBe(409)
  })

  test('a non-manager cannot export or preview an import', async ({ baseUrl }) => {
    const admin = createApiClient(baseUrl, readAdminToken(baseUrl))
    const projectId = await makeProject(admin, { startDate: day('2026-11-01') })

    const bystander = await createApprovedVolunteer(baseUrl)
    const outsider = createApiClient(baseUrl, bystander.token)

    const exp = await outsider.projects.exportPlan({ body: { projectId } })
    expect(exp.status).toBe(403)

    const prev = await outsider.projects.previewImport({
      body: { projectId, file: '{}' },
    })
    expect(prev.status).toBe(403)
  })

  test('the import page shows the diff and applies it after confirming a deletion', async ({
    baseUrl,
    adminPage,
  }) => {
    const api = createApiClient(baseUrl, readAdminToken(baseUrl))
    const projectId = await makeProject(api, { startDate: day('2026-12-01') })
    await addTask(api, projectId, { title: 'Stays' })
    const drop = await addTask(api, projectId, { title: 'Goes away' })

    const file = await exportProject(api, projectId)
    file.tasks = file.tasks.filter((t) => t.id !== drop)

    await adminPage.goto(`${baseUrl}/projects/${projectId}/import`)
    await adminPage.getByLabel('Export file').setInputFiles({
      name: 'plan.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(file)),
    })

    await expect(adminPage.getByRole('heading', { name: /Tasks to delete \(1\)/ })).toBeVisible()

    // The deletion is the only change, so nothing to apply until its box is ticked.
    const confirmButton = adminPage.getByRole('button', { name: 'Confirm import' })
    await expect(confirmButton).toBeDisabled()
    await adminPage.getByText('Delete Goes away').click()
    await expect(confirmButton).toBeEnabled()

    await confirmButton.click()
    await adminPage.getByRole('button', { name: 'Apply changes' }).click()

    await expect(adminPage).toHaveURL(`${baseUrl}/projects/${projectId}`)

    const { tasks } = await listTasks(api, projectId)
    expect(tasks.map((t) => t.title)).not.toContain('Goes away')
  })

  test('the import page accepts pasted JSON', async ({ baseUrl, adminPage }) => {
    const api = createApiClient(baseUrl, readAdminToken(baseUrl))
    const projectId = await makeProject(api, { startDate: day('2027-01-05') })

    const file = await exportProject(api, projectId)
    file.tasks.push({
      title: 'Pasted task',
      description: null,
      status: 'open',
      assigneeEmail: null,
      deadline: null,
      startDate: '2027-01-06',
      durationDays: 2,
      featuredAsQuickTask: false,
      dependsOn: [],
    })

    await adminPage.goto(`${baseUrl}/projects/${projectId}/import`)
    await adminPage.getByLabel('Paste export JSON').fill(JSON.stringify(file))
    await adminPage.getByRole('button', { name: 'Preview pasted JSON' }).click()

    await expect(adminPage.getByRole('heading', { name: /New tasks \(1\)/ })).toBeVisible()
    await adminPage.getByRole('button', { name: 'Confirm import' }).click()
    await adminPage.getByRole('button', { name: 'Apply changes' }).click()

    await expect(adminPage).toHaveURL(`${baseUrl}/projects/${projectId}`)
    const { tasks } = await listTasks(api, projectId)
    expect(tasks.map((t) => t.title)).toContain('Pasted task')
  })
})
