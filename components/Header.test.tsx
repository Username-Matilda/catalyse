import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createAdmin, createSuperAdmin } from '@/test/factories'
import { renderApp } from '@/test/render'
import { navigation } from '@/test/next-navigation'
import Header from './Header'
import { ThemeProvider } from './ThemeProvider'
import { LocationModalProvider, useLocationModal } from '@/lib/location-modal-context'

window.matchMedia = vi.fn(() => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
})) as never

function ModalFlag() {
  const { open } = useLocationModal()
  return <span data-testid="modal">{String(open)}</span>
}

const mount = (as: Awaited<ReturnType<typeof createVolunteer>> | null, url = '/projects') =>
  renderApp(
    <ThemeProvider>
      <LocationModalProvider>
        <Header />
        <ModalFlag />
      </LocationModalProvider>
    </ThemeProvider>,
    { as, url },
  )

describe('Header', () => {
  it('shows login/signup when signed out, on desktop and in the mobile menu', async () => {
    await mount(null, '/')
    expect(await screen.findByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Catalyse' })).toHaveAttribute('href', '/')
    await userEvent.click(screen.getByLabelText('Open menu'))
    expect(document.body.style.overflow).toBe('hidden')
    expect(screen.getAllByRole('link', { name: 'Sign Up' })).toHaveLength(2)
    await userEvent.click(screen.getByLabelText('Close menu'))
    expect(document.body.style.overflow).toBe('')
  })

  it('shows nav, unread badge, user menu and admin links for a signed-in admin', async () => {
    const admin = await createSuperAdmin({ locationConfirmedAt: new Date() })
    await prisma.notification.create({ data: { volunteerId: admin.id, type: 'x', title: 't' } })
    await mount(admin, '/projects')
    const nameButton = await screen.findByRole('button', { name: new RegExp(admin.name) })
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Notifications/ })).toHaveTextContent('1'),
    )
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveClass('bg-primary')
    expect(screen.getByRole('link', { name: 'Teams' })).not.toHaveClass('bg-primary')
    expect(screen.queryByText('Confirm your location')).toBeNull()
    await userEvent.click(nameButton)
    expect(screen.getByRole('link', { name: 'Superadmin panel' })).toHaveAttribute('href', '/admin')
    await userEvent.click(screen.getByRole('link', { name: 'Settings' }))
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
    // Mobile menu for an admin, then sign out from it.
    await userEvent.click(screen.getByLabelText('Open menu'))
    expect(screen.getByText('Super Admin')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign Out' }))
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/login'))
  })

  it('prompts to confirm location, opens the bug dialog, and signs out from the desktop menu', async () => {
    const vol = await createVolunteer({ locationConfirmedAt: null })
    await mount(vol, '/teams')
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm your location' }))
    expect(screen.getByTestId('modal')).toHaveTextContent('true')
    await userEvent.click(screen.getByLabelText('Report a bug or give feedback'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Close'))
    await userEvent.click(screen.getByLabelText('Open menu'))
    await userEvent.click(screen.getAllByRole('button', { name: 'Confirm your location' })[1])
    await userEvent.click(screen.getByLabelText('Open menu'))
    await userEvent.click(screen.getByRole('button', { name: 'Report bug/feedback' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Close'))
    const nameButton = screen.getByRole('button', { name: vol.name })
    await userEvent.click(nameButton)
    expect(screen.queryByText(/Admin panel/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Sign Out' }))
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/login'))
  })

  it('always links to Notifications, with a count only while something is unread', async () => {
    const vol = await createVolunteer({ locationConfirmedAt: new Date() })
    await mount(vol, '/projects')
    const link = await screen.findByRole('link', { name: /Notifications/ })
    expect(link).toHaveAttribute('href', '/dashboard#tab-notifications')
    expect(link).toHaveTextContent(/^Notifications$/)
    await userEvent.click(screen.getByLabelText('Open menu'))
    const links = screen.getAllByRole('link', { name: /Notifications/ })
    expect(links).toHaveLength(2)
    expect(links[1]).toHaveAttribute('href', '/dashboard#tab-notifications')
  })

  it('links to my own profile and to Privacy & Data from both menus', async () => {
    const vol = await createVolunteer({ locationConfirmedAt: new Date() })
    await mount(vol, '/projects')
    await userEvent.click(await screen.findByRole('button', { name: vol.name }))
    expect(screen.getByRole('link', { name: 'My profile' })).toHaveAttribute(
      'href',
      `/volunteers/${vol.id}`,
    )
    await userEvent.click(screen.getByRole('button', { name: vol.name }))
    await userEvent.click(screen.getByLabelText('Open menu'))
    expect(screen.getByRole('link', { name: 'My profile' })).toHaveAttribute(
      'href',
      `/volunteers/${vol.id}`,
    )
    expect(screen.getByRole('link', { name: 'Privacy & Data' })).toHaveAttribute('href', '/privacy')
  })

  it('shows a plain admin panel link for non-super admins', async () => {
    const admin = await createAdmin({ locationConfirmedAt: new Date() })
    await mount(admin, '/dashboard')
    await userEvent.click(await screen.findByRole('button', { name: admin.name }))
    expect(screen.getByRole('link', { name: 'Admin panel' })).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Open menu'))
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Admin panel' })).toHaveLength(2)
  })

  it('switches dashboard tabs via the hash without a navigation', async () => {
    const vol = await createVolunteer({ locationConfirmedAt: new Date() })
    await prisma.notification.create({ data: { volunteerId: vol.id, type: 'x', title: 't' } })
    await mount(vol, '/dashboard')
    const myProjects = await screen.findByRole('link', { name: 'My Projects' })
    expect(myProjects).toHaveClass('bg-primary')
    await userEvent.click(await screen.findByRole('link', { name: /Notifications/ }))
    act(() => window.dispatchEvent(new HashChangeEvent('hashchange')))
    expect(window.location.hash).toBe('#tab-notifications')
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Notifications/ })).toHaveClass('bg-primary'),
    )
    await userEvent.click(myProjects)
    expect(window.location.hash).toBe('')
    await waitFor(() => expect(myProjects).toHaveClass('bg-primary'))
    // Off the dashboard the buttons are plain links and the menu closes on navigation.
    await userEvent.click(screen.getByLabelText('Open menu'))
    act(() => navigation.push('/projects'))
    await waitFor(() => expect(screen.queryByLabelText('Close menu')).toBeNull())
    fireEvent.click(screen.getByRole('link', { name: 'My Projects' }))
    expect(screen.getByRole('link', { name: 'My Projects' })).not.toHaveClass('bg-primary')
  })
})
