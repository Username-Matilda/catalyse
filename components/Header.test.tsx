import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, fireEvent, act, within } from '@testing-library/react'
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
    await waitFor(() => expect(screen.getByRole('link', { name: /^Inbox/ })).toHaveTextContent('1'))
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveClass('bg-primary')
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'People' })).not.toHaveClass('bg-primary')
    expect(screen.getByRole('link', { name: 'Catalyse' })).toHaveAttribute('href', '/dashboard')
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

  it('shows five items, always linking to the Inbox, with a count only while something is unread', async () => {
    const vol = await createVolunteer({ locationConfirmedAt: new Date() })
    await mount(vol, '/projects')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    await waitFor(() =>
      expect(
        within(nav)
          .getAllByRole('link')
          .map((l) => l.textContent),
      ).toEqual(['Home', 'Projects', 'Tasks', 'People', 'Inbox']),
    )
    const link = within(nav).getByRole('link', { name: 'Inbox' })
    expect(link).toHaveAttribute('href', '/dashboard#tab-notifications')
    await userEvent.click(screen.getByLabelText('Open menu'))
    const links = screen.getAllByRole('link', { name: /^Inbox/ })
    expect(links).toHaveLength(2)
    expect(links[1]).toHaveAttribute('href', '/dashboard#tab-notifications')
  })

  it.each([
    ['/quick-tasks/5', 'Tasks'],
    ['/teams/2', 'People'],
    ['/suggest-team', 'People'],
    ['/templates', 'Projects'],
    ['/projects/gantt', 'Projects'],
    ['/volunteers', 'People'],
  ])('marks the right item active on %s', async (url, label) => {
    const vol = await createVolunteer({ locationConfirmedAt: new Date() })
    await mount(vol, url)
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    )
    expect(
      within(nav)
        .getAllByRole('link')
        .filter((l) => l.hasAttribute('aria-current')),
    ).toHaveLength(1)
  })

  it('links to my own profile and Settings from both menus, and Privacy only from Settings', async () => {
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
    expect(screen.queryByRole('link', { name: 'Privacy & Data' })).toBeNull()
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

  it('moves between Home and Inbox via the hash without a navigation', async () => {
    const vol = await createVolunteer({ locationConfirmedAt: new Date() })
    await prisma.notification.create({ data: { volunteerId: vol.id, type: 'x', title: 't' } })
    window.scrollTo = vi.fn()
    await mount(vol, '/dashboard')
    const home = await screen.findByRole('link', { name: 'Home' })
    expect(home).toHaveClass('bg-primary')
    await userEvent.click(await screen.findByRole('link', { name: /^Inbox/ }))
    act(() => window.dispatchEvent(new HashChangeEvent('hashchange')))
    expect(window.location.hash).toBe('#tab-notifications')
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /^Inbox/ })).toHaveClass('bg-primary'),
    )
    await userEvent.click(home)
    expect(window.location.hash).toBe('')
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 })
    await waitFor(() => expect(home).toHaveClass('bg-primary'))
    // Links to other pages navigate as usual.
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }))
    // Off Home the items are plain links and the menu closes on navigation.
    await userEvent.click(screen.getByLabelText('Open menu'))
    act(() => navigation.push('/projects'))
    await waitFor(() => expect(screen.queryByLabelText('Close menu')).toBeNull())
    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveClass('bg-primary')
  })
})
