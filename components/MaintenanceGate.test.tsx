import { describe, it, expect } from 'vitest'
import { screen, act } from '@testing-library/react'
import { prisma } from '@/lib/prisma'
import { client } from '@/lib/client'
import { createVolunteer, createSuperAdmin } from '@/test/factories'
import { renderApp } from '@/test/render'
import MaintenanceGate from './MaintenanceGate'

const mount = (as: Awaited<ReturnType<typeof createVolunteer>> | null, url = '/projects') =>
  renderApp(
    <MaintenanceGate>
      <span>the app</span>
    </MaintenanceGate>,
    { as, url },
  )

describe('MaintenanceGate', () => {
  const setMaintenance = (maintenanceMode: boolean) =>
    prisma.platformSettings.update({ where: { id: 1 }, data: { maintenanceMode } })

  it('renders the app when maintenance is off, and takes over if it switches on', async () => {
    await mount(null)
    expect(screen.getByText('the app')).toBeInTheDocument()
    // Switched on under an open session: the first refused call flips the page over.
    await setMaintenance(true)
    await act(async () => {
      await expect(client.skills.list()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
    })
    expect(await screen.findByRole('heading', { name: 'Down for Maintenance' })).toBeInTheDocument()
    expect(screen.queryByText('the app')).not.toBeInTheDocument()
  })

  it('shows visitors the down page with a way for admins to sign in', async () => {
    await setMaintenance(true)
    await mount(null)
    expect(await screen.findByRole('heading', { name: 'Down for Maintenance' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Admin login' })).toHaveAttribute('href', '/login')
  })

  it('leaves the login page reachable', async () => {
    await setMaintenance(true)
    await mount(null, '/login')
    expect(await screen.findByText('the app')).toBeInTheDocument()
    await act(async () => {})
    expect(screen.queryByRole('heading', { name: 'Down for Maintenance' })).not.toBeInTheDocument()
  })

  it('shows signed-in volunteers the down page, without the login link', async () => {
    await setMaintenance(true)
    await mount(await createVolunteer())
    expect(await screen.findByRole('heading', { name: 'Down for Maintenance' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Admin login' })).not.toBeInTheDocument()
  })

  it('lets super admins use the app, with a banner saying it is on', async () => {
    await setMaintenance(true)
    const sa = await createSuperAdmin()
    await mount(sa)
    expect(await screen.findByText('the app')).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('Maintenance mode is on')
    expect(screen.getByRole('link', { name: 'Turn it off' })).toHaveAttribute(
      'href',
      '/admin/platform-settings',
    )
    expect(screen.queryByRole('heading', { name: 'Down for Maintenance' })).not.toBeInTheDocument()
  })
})
