import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { prisma } from '@/lib/prisma'
import { createAdmin, createProject } from '@/test/factories'
import { renderApp } from '@/test/render'
import SaveAsTemplateButton from './SaveAsTemplateButton'

describe('SaveAsTemplateButton', () => {
  it('saves the project as a template from a dialog, resetting it each time it opens', async () => {
    const admin = await createAdmin()
    const project = await createProject({ title: 'Rally' })
    await renderApp(<SaveAsTemplateButton projectId={project.id} defaultTitle="Rally" />, {
      as: admin,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save as template' }))
    const title = screen.getByLabelText('Template title')
    expect(title).toHaveValue('Rally')
    await userEvent.clear(title)
    expect(screen.getByRole('button', { name: 'Save template' })).toBeDisabled()
    await userEvent.type(title, 'Scrapped')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Save as template' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Save as template' }))
    expect(screen.getByLabelText('Template title')).toHaveValue('Rally')
    await userEvent.type(screen.getByLabelText('Template title'), ' template ')
    await userEvent.type(screen.getByLabelText('Description (optional)'), ' Reusable ')
    await userEvent.click(screen.getByRole('button', { name: 'Save template' }))
    await screen.findByText('Saved as template')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      await prisma.template.findFirstOrThrow({ where: { sourceProjectId: project.id } }),
    ).toMatchObject({ title: 'Rally template', description: 'Reusable', createdById: admin.id })
  })

  it('reports a refused save', async () => {
    const admin = await createAdmin()
    const project = await createProject({ title: 'Rally' })
    await renderApp(<SaveAsTemplateButton projectId={project.id} defaultTitle="Rally" />, {
      as: admin,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save as template' }))
    await userEvent.clear(screen.getByLabelText('Template title'))
    await userEvent.type(screen.getByLabelText('Template title'), 'Nope')
    localStorage.setItem('authToken', 'stale')
    await userEvent.click(screen.getByRole('button', { name: 'Save template' }))
    await screen.findByText('Unauthorized')
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })
})
